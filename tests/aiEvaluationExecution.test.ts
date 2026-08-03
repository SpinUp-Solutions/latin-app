import { TRANSLATION_GRADING_PROFILES } from '@/shared/openai/model-registry';
import { translationGrader } from '@/shared/openai/translation-grading';
import { getCachedEvaluationResult, setCachedEvaluationResult } from '@/src/lib/ai-evaluations/cache';
import { runEvaluationCase } from '@/src/lib/ai-evaluations/execution';
import type { EvaluationCase } from '@/src/lib/ai-evaluations/contracts';

jest.mock('@/shared/openai/translation-grading', () => ({ translationGrader: { grade: jest.fn() } }));
jest.mock('@/src/lib/ai-evaluations/cache', () => ({
  createEvaluationCacheKey: jest.fn(
    (input: { model: string; answerText: string; gradingMode: string; profileId: string }) =>
      `${input.gradingMode}:${input.profileId}:${input.model}:${input.answerText}`
  ),
  getCachedEvaluationResult: jest.fn(),
  getEvaluationCacheExpiry: jest.fn(() => ({ toMillis: () => Date.now() + 30 * 24 * 60 * 60 * 1_000 })),
  setCachedEvaluationResult: jest.fn(),
}));

const mockedGradeTranslation = jest.mocked(translationGrader.grade);
const mockedGetCachedEvaluationResult = jest.mocked(getCachedEvaluationResult);
const mockedSetCachedEvaluationResult = jest.mocked(setCachedEvaluationResult);
const db = {} as never;

const evaluationCase: EvaluationCase = {
  id: 'case-1',
  title: 'Case',
  direction: 'latin-to-english',
  sourceText: 'Gallia est omnis divisa.',
  answers: [
    { id: 'answer-1', label: 'Correct', text: 'All Gaul is divided.' },
    { id: 'answer-2', label: 'Variant', text: 'Gaul is all split.' },
  ],
  modes: ['lesson'],
  createdAt: '2026-08-01T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'admin',
};

const successResult = (model: string, effort: 'low' | 'high') => ({
  success: true as const,
  data: {
    feedbackLevel: 'Excellent' as const,
    isPassing: true,
    notes: 'Good.',
    suggestedText: 'All Gaul is divided.',
    breakdown: [],
    grammaticalBreakdown: [],
  },
  requestedModel: model,
  model,
  usage: {
    promptTokens: 100,
    completionTokens: 40,
    totalTokens: 140,
    ordinaryInputTokens: 100,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: effort === 'high' ? 10 : 0,
  },
  tokensUsed: 140,
  cost: {
    inputCost: 0.0001,
    outputCost: 0.0002,
    totalCost: 0.0003,
    tokens: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
  },
  costMeasurement: {
    status: 'measured' as const,
    cost: {
      inputCost: 0.0001,
      outputCost: 0.0002,
      totalCost: 0.0003,
      tokens: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
    },
  },
  latencyMs: 80,
});

const measuredFailure = (model: string, effort: 'low' | 'high') => ({
  success: false as const,
  code: 'response-incomplete' as const,
  error: 'The translation grader returned an incomplete response.',
  requestedModel: model,
  model,
  usage: successResult(model, effort).usage,
  tokensUsed: 140,
  cost: successResult(model, effort).cost,
  costMeasurement: successResult(model, effort).costMeasurement,
  latencyMs: 90,
});

describe('AI evaluation execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetCachedEvaluationResult.mockResolvedValue(null);
    mockedSetCachedEvaluationResult.mockResolvedValue();
    mockedGradeTranslation.mockImplementation(async (_mode, _request, profileId) => {
      const profile = TRANSLATION_GRADING_PROFILES[profileId ?? 'baseline'];
      if (profile.model === TRANSLATION_GRADING_PROFILES.candidate.model) {
        return measuredFailure(profile.model, profile.reasoningEffort);
      }
      return successResult(profile.model, profile.reasoningEffort);
    });
  });

  it('keeps one model failure isolated and aggregates billable metrics from failed responses', async () => {
    const result = await runEvaluationCase(evaluationCase, false, db);

    expect(result.cells).toHaveLength(4);
    expect(result.aggregate.evaluatedCellCount).toBe(2);
    expect(result.aggregate.failedCellCount).toBe(2);
    expect(result.cells.filter(cell => cell.error)).toHaveLength(2);
    expect(result.cells.filter(cell => cell.error && cell.originalCostStatus === 'measured')).toHaveLength(2);
    expect(result.aggregate.costIncurredThisRun?.totalCost).toBeCloseTo(0.0012);
    expect(result.aggregate.costIncurredThisRunStatus).toBe('measured');
    expect(mockedSetCachedEvaluationResult).toHaveBeenCalledTimes(2);
  });

  it('evaluates both production modes with mode-specific output and cache identities', async () => {
    const bothModesCase = {
      ...evaluationCase,
      answers: [evaluationCase.answers[0]],
      modes: ['lesson', 'test'] as EvaluationCase['modes'],
    };
    mockedGradeTranslation.mockImplementation(async (mode, _request, profileId) => {
      const profile = TRANSLATION_GRADING_PROFILES[profileId ?? 'baseline'];
      if (mode === 'test') {
        return {
          success: true as const,
          data: { score: 8.5, feedback: 'Accurate overall; check the final tense.' },
          requestedModel: profile.model,
          model: profile.model,
          usage: successResult(profile.model, profile.reasoningEffort).usage,
          cost: successResult(profile.model, profile.reasoningEffort).cost,
          costMeasurement: successResult(profile.model, profile.reasoningEffort).costMeasurement,
          latencyMs: 80,
        };
      }
      return successResult(profile.model, profile.reasoningEffort);
    });

    const result = await runEvaluationCase(bothModesCase, false, db);

    expect(mockedGradeTranslation).toHaveBeenCalledTimes(4);
    expect(result.cells).toHaveLength(4);
    expect(result.cells.filter(cell => cell.gradingMode === 'lesson')).toHaveLength(2);
    expect(result.cells.filter(cell => cell.gradingMode === 'test')).toEqual(
      expect.arrayContaining([expect.objectContaining({ output: expect.objectContaining({ score: 8.5 }) })])
    );
    expect(mockedSetCachedEvaluationResult).toHaveBeenCalledWith(
      expect.objectContaining({ gradingMode: 'lesson' }),
      db
    );
    expect(mockedSetCachedEvaluationResult).toHaveBeenCalledWith(expect.objectContaining({ gradingMode: 'test' }), db);
  });

  it('marks missing usage as unavailable rather than a fabricated zero and does not cache it', async () => {
    mockedGradeTranslation.mockImplementation(async (_mode, _request, profileId) => {
      const profile = TRANSLATION_GRADING_PROFILES[profileId ?? 'baseline'];
      return {
        success: true,
        data: successResult(profile.model, profile.reasoningEffort).data,
        requestedModel: profile.model,
        model: profile.model,
        costMeasurement: { status: 'unavailable' as const, reason: 'No usage' },
        latencyMs: 80,
      };
    });

    const result = await runEvaluationCase(evaluationCase, false, db);

    expect(result.cells.every(cell => cell.originalCostStatus === 'unavailable')).toBe(true);
    expect(result.cells.every(cell => cell.costIncurredThisRun === undefined)).toBe(true);
    expect(result.aggregate.costIncurredThisRun).toBeUndefined();
    expect(result.aggregate.costIncurredThisRunStatus).toBe('unavailable');
    expect(result.aggregate.unknownIncurredCostCells).toBe(4);
    expect(mockedSetCachedEvaluationResult).not.toHaveBeenCalled();
  });

  it('coalesces duplicate answer texts to one API call per model and fans results out by label', async () => {
    const duplicateCase = {
      ...evaluationCase,
      answers: [
        { id: 'answer-a', label: 'First label', text: 'Same answer' },
        { id: 'answer-b', label: 'Second label', text: 'Same answer' },
      ],
    };
    mockedGradeTranslation.mockImplementation(async (_mode, _request, profileId) => {
      const profile = TRANSLATION_GRADING_PROFILES[profileId ?? 'baseline'];
      return successResult(profile.model, profile.reasoningEffort);
    });

    const result = await runEvaluationCase(duplicateCase, false, db);

    expect(mockedGradeTranslation).toHaveBeenCalledTimes(2);
    expect(result.cells).toHaveLength(4);
    expect(result.cells.filter(cell => cell.coalescedDuplicate)).toHaveLength(2);
    expect(result.cells.filter(cell => cell.duplicateWithinRun)).toHaveLength(2);
    expect(result.aggregate.costIncurredThisRun?.totalCost).toBeCloseTo(0.0006);
    expect(result.aggregate.usage.totalTokens).toBe(280);
    expect(result.cells.map(cell => cell.answerLabel)).toEqual([
      'First label',
      'First label',
      'Second label',
      'Second label',
    ]);
  });

  it('executes three duplicate answers only once per model during force refresh, including failures', async () => {
    const duplicateCase = {
      ...evaluationCase,
      answers: [
        { id: 'answer-a', label: 'First', text: 'Same answer' },
        { id: 'answer-b', label: 'Second', text: 'Same answer' },
        { id: 'answer-c', label: 'Third', text: 'Same answer' },
      ],
    };
    mockedGradeTranslation.mockImplementation(async (_mode, _request, profileId) => {
      const profile = TRANSLATION_GRADING_PROFILES[profileId ?? 'baseline'];
      return measuredFailure(profile.model, profile.reasoningEffort);
    });

    const result = await runEvaluationCase(duplicateCase, true, db);

    expect(mockedGradeTranslation).toHaveBeenCalledTimes(2);
    expect(result.cells).toHaveLength(6);
    expect(result.cells.filter(cell => cell.duplicateWithinRun)).toHaveLength(4);
    expect(result.cells.filter(cell => cell.coalescedDuplicate)).toHaveLength(4);
    expect(result.aggregate.costIncurredThisRun?.totalCost).toBeCloseTo(0.0006);
    expect(result.aggregate.usageIncurredThisRun.totalTokens).toBe(280);
  });

  it('keeps original metrics and reports zero incremental cost when a concurrent run joins in-flight work', async () => {
    const singleAnswerCase = { ...evaluationCase, answers: [evaluationCase.answers[0]] };
    const resolvers: Array<() => void> = [];
    mockedGradeTranslation.mockImplementation(
      async (_mode, _request, profileId) =>
        new Promise(resolve => {
          const profile = TRANSLATION_GRADING_PROFILES[profileId ?? 'baseline'];
          resolvers.push(() => resolve(successResult(profile.model, profile.reasoningEffort)));
        })
    );

    const firstRun = runEvaluationCase(singleAnswerCase, false, db);
    await new Promise(resolve => setTimeout(resolve, 0));
    const joinedRun = runEvaluationCase(singleAnswerCase, false, db);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockedGradeTranslation).toHaveBeenCalledTimes(2);

    resolvers.forEach(resolve => resolve());
    const [, joined] = await Promise.all([firstRun, joinedRun]);

    expect(joined.cells.every(cell => cell.coalescedDuplicate)).toBe(true);
    expect(joined.cells.every(cell => !cell.duplicateWithinRun)).toBe(true);
    expect(joined.aggregate.originalCost?.totalCost).toBeCloseTo(0.0006);
    expect(joined.aggregate.costIncurredThisRun?.totalCost).toBe(0);
    expect(joined.aggregate.costIncurredThisRunStatus).toBe('measured');
    expect(joined.aggregate.usage.totalTokens).toBe(280);
  });

  it('reports app-cache reuse as known no-incurred cost while retaining original usage/cost', async () => {
    const cachedUsage = {
      ...successResult(TRANSLATION_GRADING_PROFILES.baseline.model, 'low').usage,
      ordinaryInputTokens: 80,
      cachedInputTokens: 20,
    };
    const cached = {
      cacheKey: 'lesson:baseline:gpt-5.4-mini:All Gaul is divided.',
      gradingMode: 'lesson' as const,
      model: TRANSLATION_GRADING_PROFILES.baseline.model,
      actualModel: TRANSLATION_GRADING_PROFILES.baseline.model,
      output: successResult(TRANSLATION_GRADING_PROFILES.baseline.model, 'low').data,
      usage: cachedUsage,
      cost: successResult(TRANSLATION_GRADING_PROFILES.baseline.model, 'low').cost,
      latencyMs: 80,
      generatedAt: '2026-08-01T00:00:00.000Z',
    };
    mockedGetCachedEvaluationResult.mockImplementation(async key => (key === cached.cacheKey ? cached : null));

    const result = await runEvaluationCase(evaluationCase, false, db);
    const cachedCell = result.cells[0];

    expect(cachedCell.appCacheHit).toBe(true);
    expect(cachedCell.costIncurredThisRunStatus).toBe('not-incurred-app-cache');
    expect(cachedCell.costIncurredThisRun?.totalCost).toBe(0);
    expect(cachedCell.originalCost?.totalCost).toBeCloseTo(0.0002415);
    expect(cachedCell.generationLatencyMs).toBe(80);
    expect(result.aggregate.appCacheHits).toBe(1);
    expect(result.aggregate.openAIPromptCacheHits).toBe(0);
    expect(result.aggregate.usage.totalTokens).toBe(560);
    expect(result.aggregate.usageIncurredThisRun.totalTokens).toBe(420);
    expect(result.aggregate.costIncurredThisRun?.totalCost).toBeCloseTo(0.0009);
  });
});
