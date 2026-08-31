import type { Firestore } from 'firebase-admin/firestore';
import {
  type TranslationGradingRunFailure,
  type TranslationGradingRunResult,
  type TranslationGradingRunSuccess,
  translationGrader,
  parseTranslationGradingOutput,
  type TranslationGradingMode,
  type TestTranslationGradingOutput,
  type TranslationGradingOutput,
} from '../../../shared/openai/translation-grading';
import { getTranslationGradingTask } from '../../../shared/openai/translation-grading-tasks';
import { createTranslationGradingBehaviorFingerprint } from '../../../shared/openai/translation-grading-fingerprint';
import {
  calculateTokenUsageCost,
  EVALUATION_TRANSLATION_PROFILE_IDS,
  getTranslationGradingProfile,
  isValidTokenUsage,
  type TranslationGradingProfile,
  type TranslationGradingProfileId,
} from '../../../shared/openai/model-registry';
import type { CostBreakdown, TokenUsage } from '../../../shared/openai/types';
import type { OpenAIRequestContext } from '../../../shared/openai/types';
import {
  getCachedEvaluationResult,
  getEvaluationCacheExpiry,
  isValidEvaluationCost,
  setCachedEvaluationResult,
} from './cache';
import { createEvaluationCacheKey } from './cache-key';
import { EvaluationSingleFlightPublishError, runEvaluationSingleFlight } from './single-flight';
import {
  AI_EVALUATION_SCHEMA_VERSION,
  emptyCostBreakdown,
  emptyTokenUsage,
  type EvaluationAggregate,
  type EvaluationCase,
  type EvaluationCellResult,
  type EvaluationCellResultCommon,
  type EvaluationRunResult,
} from './contracts';

const MAX_CONCURRENCY = 4;

type ExecutionOutcome = {
  result: TranslationGradingRunResult<TranslationGradingOutput | TestTranslationGradingOutput>;
  appCacheHit: boolean;
  chargeable: boolean;
  runLatencyMs: number;
  generatedAt?: string;
};

const FAILURE_CODES = new Set([
  'provider-error',
  'response-incomplete',
  'response-missing-message',
  'response-missing-text',
  'response-malformed-json',
  'response-invalid-output',
]);

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const parseSingleFlightOutcome = (mode: TranslationGradingMode, value: unknown): ExecutionOutcome | null => {
  if (!value || typeof value !== 'object') return null;
  const outcome = value as Partial<ExecutionOutcome>;
  if (
    typeof outcome.appCacheHit !== 'boolean' ||
    typeof outcome.chargeable !== 'boolean' ||
    !isFiniteNonNegative(outcome.runLatencyMs) ||
    (outcome.generatedAt !== undefined &&
      (typeof outcome.generatedAt !== 'string' || !Number.isFinite(Date.parse(outcome.generatedAt)))) ||
    !outcome.result ||
    typeof outcome.result !== 'object'
  ) {
    return null;
  }

  const result = outcome.result as Partial<
    TranslationGradingRunResult<TranslationGradingOutput | TestTranslationGradingOutput>
  >;
  if (
    typeof result.requestedModel !== 'string' ||
    !result.requestedModel ||
    (result.model !== undefined && typeof result.model !== 'string') ||
    !isFiniteNonNegative(result.latencyMs) ||
    (result.usage !== undefined && !isValidTokenUsage(result.usage)) ||
    (result.tokensUsed !== undefined && !isFiniteNonNegative(result.tokensUsed)) ||
    (result.usage && result.tokensUsed !== undefined && result.tokensUsed !== result.usage.totalTokens) ||
    (result.cost !== undefined && (!result.usage || !isValidEvaluationCost(result.cost, result.usage))) ||
    !result.costMeasurement ||
    typeof result.costMeasurement !== 'object'
  ) {
    return null;
  }

  const measurement = result.costMeasurement;
  if (
    (measurement.status !== 'measured' && measurement.status !== 'unavailable') ||
    (measurement.reason !== undefined && typeof measurement.reason !== 'string') ||
    (measurement.status === 'measured' &&
      (!result.usage || !measurement.cost || !isValidEvaluationCost(measurement.cost, result.usage)))
  ) {
    return null;
  }

  if (result.success === true) {
    try {
      return {
        ...outcome,
        result: { ...result, success: true, data: parseTranslationGradingOutput(mode, result.data) },
      } as ExecutionOutcome;
    } catch {
      return null;
    }
  }
  if (
    result.success !== false ||
    typeof result.code !== 'string' ||
    !FAILURE_CODES.has(result.code) ||
    typeof result.error !== 'string'
  ) {
    return null;
  }
  return { ...outcome, result } as ExecutionOutcome;
};

// Only promises are retained, never completed results. This coalesces duplicate
// answer texts within an active run while preserving normal cache semantics for
// later requests and force-refresh behavior.
const inFlightResults = new Map<string, Promise<ExecutionOutcome>>();

const safeErrorMessage = (error: unknown): string => {
  console.error('[ai-evaluations] unexpected cell failure', error);
  return 'The model comparison could not complete this cell.';
};

const addTokenUsage = (left: TokenUsage, right: TokenUsage): TokenUsage => ({
  promptTokens: left.promptTokens + right.promptTokens,
  completionTokens: left.completionTokens + right.completionTokens,
  totalTokens: left.totalTokens + right.totalTokens,
  ordinaryInputTokens: (left.ordinaryInputTokens ?? 0) + (right.ordinaryInputTokens ?? 0),
  cachedInputTokens: (left.cachedInputTokens ?? 0) + (right.cachedInputTokens ?? 0),
  cacheWriteTokens: (left.cacheWriteTokens ?? 0) + (right.cacheWriteTokens ?? 0),
  reasoningTokens: (left.reasoningTokens ?? 0) + (right.reasoningTokens ?? 0),
});

const addCost = (left: CostBreakdown, right: CostBreakdown): CostBreakdown => ({
  inputCost: left.inputCost + right.inputCost,
  outputCost: left.outputCost + right.outputCost,
  totalCost: left.totalCost + right.totalCost,
  tokens: addTokenUsage(left.tokens, right.tokens),
  pricingVersion: left.pricingVersion ?? right.pricingVersion,
  pricingSource: left.pricingSource ?? right.pricingSource,
});

const costForResult = (result: TranslationGradingRunResult) =>
  result.costMeasurement.status === 'measured' && result.cost ? result.cost : undefined;

const createUnexpectedFailure = (
  profile: TranslationGradingProfile,
  error: unknown,
  latencyMs: number
): TranslationGradingRunFailure => ({
  success: false,
  code: 'provider-error',
  error: safeErrorMessage(error),
  requestedModel: profile.model,
  costMeasurement: { status: 'unavailable', reason: 'No provider usage was returned.' },
  latencyMs,
});

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => worker()));
  return results;
}

interface EvaluationJob {
  answer: EvaluationCase['answers'][number];
  mode: TranslationGradingMode;
  profileId: TranslationGradingProfileId;
  profile: TranslationGradingProfile;
  duplicateWithinRun: boolean;
  index: number;
}

const cacheKeyFor = (
  evaluationCase: EvaluationCase,
  job: Pick<EvaluationJob, 'answer' | 'mode' | 'profileId' | 'profile'>
) =>
  createEvaluationCacheKey({
    direction: evaluationCase.direction,
    sourceText: evaluationCase.sourceText,
    answerText: job.answer.text,
    gradingMode: job.mode,
    profileId: job.profileId,
    model: job.profile.model,
    reasoningEffort: job.profile.reasoningEffort,
    behaviorFingerprint: createTranslationGradingBehaviorFingerprint(getTranslationGradingTask(job.mode), job.profile),
    schemaVersion: AI_EVALUATION_SCHEMA_VERSION,
  });

async function executeUniqueJob(
  evaluationCase: EvaluationCase,
  job: EvaluationJob,
  forceRefresh: boolean,
  db: Firestore,
  context: OpenAIRequestContext
): Promise<ExecutionOutcome> {
  const runStartedAt = Date.now();
  const cacheKey = cacheKeyFor(evaluationCase, job);

  const cachedOutcome = async (treatAsAppCacheHit: boolean): Promise<ExecutionOutcome | null> => {
    const cached = await getCachedEvaluationResult(cacheKey, job.mode, db);
    if (!cached) return null;
    const currentCost = calculateTokenUsageCost(cached.usage, job.profile.pricing);
    const cachedResult: TranslationGradingRunSuccess<TranslationGradingOutput | TestTranslationGradingOutput> = {
      success: true,
      data: cached.output,
      requestedModel: cached.model,
      model: cached.actualModel,
      usage: cached.usage,
      tokensUsed: cached.usage.totalTokens,
      cost: currentCost,
      costMeasurement: { status: 'measured', cost: currentCost },
      latencyMs: cached.latencyMs,
    };
    return {
      result: cachedResult,
      appCacheHit: treatAsAppCacheHit,
      chargeable: treatAsAppCacheHit,
      runLatencyMs: Date.now() - runStartedAt,
      generatedAt: cached.generatedAt,
    };
  };

  if (!forceRefresh) {
    try {
      const cached = await cachedOutcome(true);
      if (cached) return cached;
    } catch (error) {
      // A cache outage should not make an interactive evaluation unusable.
      console.warn('[ai-evaluations] cache read failed; running API request', error);
    }
  }

  const providerOperation = async (signal: AbortSignal): Promise<ExecutionOutcome> => {
    const providerStartedAt = Date.now();
    let result: TranslationGradingRunResult<TranslationGradingOutput | TestTranslationGradingOutput>;
    try {
      result = await translationGrader.grade(
        job.mode,
        {
          sourceText: evaluationCase.sourceText,
          userTranslation: job.answer.text,
          direction: evaluationCase.direction,
        },
        job.profileId,
        { ...context, signal }
      );
    } catch (error) {
      result = createUnexpectedFailure(job.profile, error, Date.now() - providerStartedAt);
    }

    // Do not write malformed/unmetered output to the shared cache. Billable
    // metrics must be measured before a successful result becomes reusable.
    const generatedAt = result.success ? new Date().toISOString() : undefined;
    if (result.success && result.costMeasurement.status === 'measured' && result.cost && result.usage) {
      try {
        await setCachedEvaluationResult(
          {
            cacheKey,
            gradingMode: job.mode,
            model: result.requestedModel,
            actualModel: result.model ?? result.requestedModel,
            output: result.data,
            usage: result.usage,
            cost: result.cost,
            latencyMs: result.latencyMs,
            generatedAt: generatedAt!,
            expiresAt: getEvaluationCacheExpiry(),
          },
          db
        );
      } catch (error) {
        console.warn('[ai-evaluations] cache write failed', error);
      }
    }

    return {
      result,
      appCacheHit: false,
      chargeable: true,
      runLatencyMs: Date.now() - runStartedAt,
      generatedAt,
    };
  };

  try {
    const singleFlight = await runEvaluationSingleFlight(cacheKey, db, providerOperation, {
      serialize: value => value,
      deserialize: value => parseSingleFlightOutcome(job.mode, value),
    });
    return singleFlight.joined ? { ...singleFlight.value, chargeable: false } : singleFlight.value;
  } catch (error) {
    if (error instanceof EvaluationSingleFlightPublishError) {
      const completed = parseSingleFlightOutcome(job.mode, error.completedValue);
      if (completed) return { ...completed, chargeable: true };
    }
    const result = createUnexpectedFailure(job.profile, error, Date.now() - runStartedAt);
    return {
      result,
      appCacheHit: false,
      chargeable: false,
      runLatencyMs: Date.now() - runStartedAt,
    };
  }
}

async function executeCoalesced(
  evaluationCase: EvaluationCase,
  job: EvaluationJob,
  forceRefresh: boolean,
  db: Firestore,
  context: OpenAIRequestContext
): Promise<ExecutionOutcome> {
  const waitStartedAt = Date.now();
  const cacheKey = cacheKeyFor(evaluationCase, job);
  const mapKey = `${forceRefresh ? 'force' : 'cached'}:${cacheKey}`;
  const existing = inFlightResults.get(mapKey);
  if (existing) {
    const outcome = await existing;
    return {
      ...outcome,
      chargeable: false,
      runLatencyMs: Date.now() - waitStartedAt,
    };
  }

  const pending = executeUniqueJob(evaluationCase, job, forceRefresh, db, context);
  inFlightResults.set(mapKey, pending);
  try {
    return await pending;
  } finally {
    if (inFlightResults.get(mapKey) === pending) inFlightResults.delete(mapKey);
  }
}

function createSuccessfulCell(
  job: EvaluationJob,
  result: TranslationGradingRunSuccess<TranslationGradingOutput | TestTranslationGradingOutput>,
  appCacheHit: boolean,
  coalescedDuplicate: boolean,
  runLatencyMs: number,
  generatedAt?: string
): EvaluationCellResult {
  const openAIPromptCacheHit = !appCacheHit && !coalescedDuplicate && (result.usage?.cachedInputTokens ?? 0) > 0;
  const originalCostStatus = result.costMeasurement.status;
  const costIncurredThisRunStatus = appCacheHit
    ? 'not-incurred-app-cache'
    : coalescedDuplicate
      ? 'not-incurred-coalesced'
      : result.costMeasurement.status;
  const base: EvaluationCellResultCommon = {
    answerId: job.answer.id,
    answerLabel: job.answer.label,
    profileId: job.profileId,
    requestedModel: result.requestedModel,
    actualModel: result.model,
    reasoningEffort: job.profile.reasoningEffort,
    latencyMs: runLatencyMs,
    generationLatencyMs: result.latencyMs,
    generatedAt,
    cacheStatus: appCacheHit ? 'app-cache' : openAIPromptCacheHit ? 'openai-prompt-cache' : 'fresh-api',
    appCacheHit,
    openAIPromptCacheHit,
    coalescedDuplicate,
    duplicateWithinRun: job.duplicateWithinRun,
    usage: result.usage,
    originalCost: result.cost,
    originalCostStatus,
    costIncurredThisRun: appCacheHit || coalescedDuplicate ? emptyCostBreakdown() : result.cost,
    costIncurredThisRunStatus,
    costIncurredThisRunReason: appCacheHit
      ? 'Reused from the server app cache.'
      : coalescedDuplicate
        ? 'Reused an identical in-flight model request.'
        : result.costMeasurement.reason,
  };

  if (job.mode === 'lesson' && 'feedbackLevel' in result.data) {
    const expected = job.answer.expectations?.lesson;
    return {
      ...base,
      gradingMode: 'lesson',
      output: result.data,
      ...(expected
        ? {
            criterion: {
              passed: result.data.isPassing === expected.passing,
              expected: expected.passing ? 'Passing feedback' : 'Non-passing feedback',
              actual: result.data.isPassing ? 'Passing feedback' : 'Non-passing feedback',
            },
          }
        : {}),
    };
  }
  if (job.mode === 'test' && 'score' in result.data) {
    const expected = job.answer.expectations?.test;
    return {
      ...base,
      gradingMode: 'test',
      output: result.data,
      ...(expected
        ? {
            criterion: {
              passed: result.data.score >= expected.minScore && result.data.score <= expected.maxScore,
              expected: `${expected.minScore}–${expected.maxScore}/10`,
              actual: `${result.data.score}/10`,
            },
          }
        : {}),
    };
  }
  throw new Error(`Translation grading task ${job.mode} returned an incompatible output shape`);
}

function createFailureCell(
  job: EvaluationJob,
  result: TranslationGradingRunFailure,
  coalescedDuplicate: boolean,
  runLatencyMs: number
): EvaluationCellResult {
  const measuredCost = costForResult(result);
  const base: EvaluationCellResultCommon = {
    answerId: job.answer.id,
    answerLabel: job.answer.label,
    profileId: job.profileId,
    requestedModel: result.requestedModel,
    actualModel: result.model,
    reasoningEffort: job.profile.reasoningEffort,
    error: result.error,
    errorCode: result.code,
    latencyMs: runLatencyMs,
    generationLatencyMs: result.latencyMs,
    cacheStatus: 'error',
    appCacheHit: false,
    openAIPromptCacheHit: !coalescedDuplicate && (result.usage?.cachedInputTokens ?? 0) > 0,
    coalescedDuplicate,
    duplicateWithinRun: job.duplicateWithinRun,
    usage: result.usage,
    originalCost: measuredCost,
    originalCostStatus: result.costMeasurement.status,
    costIncurredThisRun: coalescedDuplicate ? emptyCostBreakdown() : measuredCost,
    costIncurredThisRunStatus: coalescedDuplicate ? 'not-incurred-coalesced' : result.costMeasurement.status,
    costIncurredThisRunReason: coalescedDuplicate
      ? 'Reused an identical in-flight model request.'
      : result.costMeasurement.reason,
  };
  return job.mode === 'lesson' ? { ...base, gradingMode: 'lesson' } : { ...base, gradingMode: 'test' };
}

function measurementStatusFor(
  cells: EvaluationCellResult[],
  field: 'originalCost' | 'costIncurredThisRun'
): {
  cost?: CostBreakdown;
  status: EvaluationAggregate['originalCostStatus'];
  unknownCount: number;
} {
  const knownCosts = cells.map(cell => cell[field]).filter((cost): cost is CostBreakdown => Boolean(cost));
  const unknownCount = cells.filter(cell =>
    field === 'originalCost'
      ? cell.originalCostStatus === 'unavailable'
      : cell.costIncurredThisRunStatus === 'unavailable'
  ).length;
  let cost: CostBreakdown | undefined;
  for (const knownCost of knownCosts) {
    cost = cost ? addCost(cost, knownCost) : knownCost;
  }
  return {
    cost,
    unknownCount,
    status: unknownCount === 0 ? 'measured' : cost ? 'lower-bound' : 'unavailable',
  };
}

interface EvaluationJobGroup {
  jobs: EvaluationJob[];
}

function buildEvaluationJobGroups(evaluationCase: EvaluationCase): EvaluationJobGroup[] {
  const groups = new Map<string, EvaluationJobGroup>();
  let index = 0;
  for (const answer of evaluationCase.answers) {
    for (const mode of evaluationCase.modes) {
      for (const profileId of EVALUATION_TRANSLATION_PROFILE_IDS) {
        const profile = getTranslationGradingProfile(profileId);
        const identity = { answer, mode, profileId, profile };
        const cacheKey = cacheKeyFor(evaluationCase, identity);
        const group = groups.get(cacheKey) ?? { jobs: [] };
        group.jobs.push({
          ...identity,
          index,
          duplicateWithinRun: group.jobs.length > 0,
        });
        groups.set(cacheKey, group);
        index += 1;
      }
    }
  }
  return [...groups.values()];
}

export function countEvaluationCells(evaluationCase: EvaluationCase): number {
  return buildEvaluationJobGroups(evaluationCase).length;
}

export async function runEvaluationCase(
  evaluationCase: EvaluationCase,
  forceRefresh: boolean,
  db: Firestore,
  context: OpenAIRequestContext = {}
): Promise<EvaluationRunResult> {
  const startedAt = new Date();
  const groups = buildEvaluationJobGroups(evaluationCase);
  const evaluationContext: OpenAIRequestContext = { ...context, capacityClass: 'evaluation' };
  const outcomes = await mapWithConcurrency(groups, MAX_CONCURRENCY, group =>
    executeCoalesced(evaluationCase, group.jobs[0], forceRefresh, db, evaluationContext)
  );
  const cells = new Array<EvaluationCellResult>(
    evaluationCase.answers.length * evaluationCase.modes.length * EVALUATION_TRANSLATION_PROFILE_IDS.length
  );
  groups.forEach((group, groupIndex) => {
    const outcome = outcomes[groupIndex];
    group.jobs.forEach((job, duplicateIndex) => {
      const coalescedDuplicate = duplicateIndex > 0 || !outcome.chargeable;
      cells[job.index] = outcome.result.success
        ? createSuccessfulCell(
            job,
            outcome.result,
            outcome.appCacheHit,
            coalescedDuplicate,
            outcome.runLatencyMs,
            outcome.generatedAt
          )
        : createFailureCell(job, outcome.result, coalescedDuplicate, outcome.runLatencyMs);
    });
  });
  const completedAt = new Date();
  const successfulCells = cells.filter(cell => cell.output);
  const uniqueCells = cells.filter(cell => !cell.duplicateWithinRun);
  const providerCells = uniqueCells.filter(cell => !cell.appCacheHit && !cell.coalescedDuplicate);
  const aggregateUsage = uniqueCells.reduce(
    (sum, cell) => addTokenUsage(sum, cell.usage ?? emptyTokenUsage()),
    emptyTokenUsage()
  );
  const incurredUsage = providerCells.reduce(
    (sum, cell) => addTokenUsage(sum, cell.usage ?? emptyTokenUsage()),
    emptyTokenUsage()
  );
  const originalMeasurement = measurementStatusFor(uniqueCells, 'originalCost');
  const incurredMeasurement = measurementStatusFor(uniqueCells, 'costIncurredThisRun');
  const aggregate: EvaluationAggregate = {
    cellCount: cells.length,
    evaluatedCellCount: successfulCells.length,
    failedCellCount: cells.length - successfulCells.length,
    criteriaEvaluatedCount: cells.filter(cell => cell.criterion).length,
    criteriaPassedCount: cells.filter(cell => cell.criterion?.passed).length,
    criteriaFailedCount: cells.filter(cell => cell.criterion && !cell.criterion.passed).length,
    appCacheHits: uniqueCells.filter(cell => cell.appCacheHit).length,
    openAIPromptCacheHits: uniqueCells.filter(cell => cell.openAIPromptCacheHit).length,
    wallTimeMs: completedAt.getTime() - startedAt.getTime(),
    generationTimeMs: uniqueCells.reduce((sum, cell) => sum + (cell.generationLatencyMs ?? 0), 0),
    providerTimeThisRunMs: providerCells.reduce((sum, cell) => sum + (cell.generationLatencyMs ?? 0), 0),
    originalCost: originalMeasurement.cost,
    originalCostStatus: originalMeasurement.status,
    costIncurredThisRun: incurredMeasurement.cost,
    costIncurredThisRunStatus: incurredMeasurement.status,
    usage: aggregateUsage,
    usageStatus: uniqueCells.every(cell => Boolean(cell.usage)) ? 'measured' : 'lower-bound',
    usageIncurredThisRun: incurredUsage,
    usageIncurredThisRunStatus: providerCells.every(cell => Boolean(cell.usage)) ? 'measured' : 'lower-bound',
    unknownOriginalCostCells: originalMeasurement.unknownCount,
    unknownIncurredCostCells: incurredMeasurement.unknownCount,
  };

  return {
    caseId: evaluationCase.id,
    schemaVersion: AI_EVALUATION_SCHEMA_VERSION,
    forceRefresh,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    aggregate,
    cells,
  };
}
