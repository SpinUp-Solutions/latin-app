import { z } from 'zod';
import {
  type CostBreakdown,
  type CostMeasurementStatus,
  type TokenUsage,
  TRANSLATION_GRADING_MODES,
  type TranslationGradingMode,
} from '../../../shared/openai/types';
import type {
  TestTranslationGradingOutput,
  TranslationGradingOutput,
} from '../../../shared/openai/translation-grading';
import type { TranslationGradingProfileId } from '../../../shared/openai/model-registry';
export const AI_EVALUATION_SCHEMA_VERSION = 'ai-translation-evaluation-v2';

const CASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ANSWER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
export const AI_EVALUATION_MAX_ANSWERS = 20;

export const evaluationCaseIdSchema = z.string().regex(CASE_ID_PATTERN, 'Invalid evaluation case id');
const evaluationAnswerIdSchema = z.string().regex(ANSWER_ID_PATTERN, 'Invalid answer id');

const titleSchema = z.string().trim().min(1, 'Title is required').max(120, 'Title must be 120 characters or fewer');
const sourceTextSchema = z
  .string()
  .trim()
  .min(1, 'Source text is required')
  .max(4_000, 'Source text must be 4,000 characters or fewer');
const answerTextSchema = z
  .string()
  .trim()
  .min(1, 'Answer text is required')
  .max(4_000, 'Answer text must be 4,000 characters or fewer');
const answerLabelSchema = z
  .string()
  .trim()
  .min(1, 'Answer label is required')
  .max(80, 'Answer label must be 80 characters or fewer');

const evaluationModeSchema = z.enum(TRANSLATION_GRADING_MODES);
const defaultEvaluationModes: TranslationGradingMode[] = ['lesson'];
const canonicalEvaluationModes = (modes: readonly TranslationGradingMode[]) =>
  TRANSLATION_GRADING_MODES.filter(mode => modes.includes(mode));
const evaluationModesSchema = z
  .array(evaluationModeSchema)
  .min(1, 'Choose at least one grading mode')
  .max(TRANSLATION_GRADING_MODES.length)
  .superRefine((modes, context) => {
    if (new Set(modes).size !== modes.length) {
      context.addIssue({ code: 'custom', message: 'Grading modes must be unique' });
    }
  })
  .transform(canonicalEvaluationModes);

export const evaluationAnswerInputSchema = z
  .object({
    id: evaluationAnswerIdSchema,
    label: answerLabelSchema,
    text: answerTextSchema,
  })
  .strict();

export const evaluationCaseInputSchema = z
  .object({
    title: titleSchema,
    direction: z.enum(['latin-to-english', 'english-to-latin']),
    sourceText: sourceTextSchema,
    answers: z
      .array(evaluationAnswerInputSchema)
      .min(1, 'Add at least one answer')
      .max(AI_EVALUATION_MAX_ANSWERS, `Use at most ${AI_EVALUATION_MAX_ANSWERS} answers`),
    modes: evaluationModesSchema.default(defaultEvaluationModes),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.answers.forEach((answer, index) => {
      if (ids.has(answer.id)) {
        context.addIssue({ code: 'custom', path: ['answers', index, 'id'], message: 'Answer ids must be unique' });
      }
      ids.add(answer.id);
    });
  });

export const evaluationFunctionRunRequestSchema = z
  .object({ caseId: evaluationCaseIdSchema, forceRefresh: z.boolean().default(false) })
  .strict();
export const evaluationFunctionSaveRequestSchema = z
  .object({ caseId: evaluationCaseIdSchema.optional(), input: evaluationCaseInputSchema })
  .strict();
export const evaluationFunctionDeleteRequestSchema = z.object({ caseId: evaluationCaseIdSchema }).strict();

export interface EvaluationCase extends z.infer<typeof evaluationCaseInputSchema> {
  id: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

interface EvaluationUsage extends TokenUsage {
  /** Original OpenAI response usage, before any app-cache reuse. */
}

type EvaluationCellCostStatus = CostMeasurementStatus;
type EvaluationAggregateCostStatus = 'measured' | 'lower-bound' | 'unavailable';

interface EvaluationCellResultBase<M extends TranslationGradingMode> {
  answerId: string;
  answerLabel: string;
  gradingMode: M;
  profileId: TranslationGradingProfileId;
  requestedModel: string;
  actualModel?: string;
  reasoningEffort: 'low' | 'high';
  output?: M extends 'lesson' ? TranslationGradingOutput : TestTranslationGradingOutput;
  error?: string;
  errorCode?: string;
  latencyMs: number;
  generationLatencyMs?: number;
  generatedAt?: string;
  cacheStatus: 'app-cache' | 'openai-prompt-cache' | 'fresh-api' | 'error';
  appCacheHit: boolean;
  openAIPromptCacheHit: boolean;
  /** This labeled cell reused another identical in-flight API result. */
  coalescedDuplicate: boolean;
  /** Excludes repeated labels for the same exact request from run aggregates. */
  duplicateWithinRun: boolean;
  usage?: EvaluationUsage;
  originalCost?: CostBreakdown;
  originalCostStatus: EvaluationCellCostStatus;
  costIncurredThisRun?: CostBreakdown;
  costIncurredThisRunStatus: EvaluationCellCostStatus;
  costIncurredThisRunReason?: string;
}

type EvaluationLessonCellResult = EvaluationCellResultBase<'lesson'>;
type EvaluationTestCellResult = EvaluationCellResultBase<'test'>;
export type EvaluationCellResult = EvaluationLessonCellResult | EvaluationTestCellResult;
export type EvaluationCellResultCommon = Omit<EvaluationLessonCellResult, 'gradingMode' | 'output'>;

export interface EvaluationAggregate {
  cellCount: number;
  evaluatedCellCount: number;
  failedCellCount: number;
  appCacheHits: number;
  openAIPromptCacheHits: number;
  wallTimeMs: number;
  generationTimeMs: number;
  /** Provider latency incurred by this run; excludes app-cache and coalesced reuse. */
  providerTimeThisRunMs: number;
  originalCost?: CostBreakdown;
  originalCostStatus: EvaluationAggregateCostStatus;
  costIncurredThisRun?: CostBreakdown;
  costIncurredThisRunStatus: EvaluationAggregateCostStatus;
  usage: EvaluationUsage;
  usageStatus: 'measured' | 'lower-bound';
  /** Provider usage incurred by this run; excludes app-cache and coalesced reuse. */
  usageIncurredThisRun: EvaluationUsage;
  usageIncurredThisRunStatus: 'measured' | 'lower-bound';
  unknownOriginalCostCells: number;
  unknownIncurredCostCells: number;
}

export interface EvaluationRunResult {
  caseId: string;
  schemaVersion: string;
  forceRefresh: boolean;
  startedAt: string;
  completedAt: string;
  aggregate: EvaluationAggregate;
  cells: EvaluationCellResult[];
}

export type EvaluationCaseInput = z.infer<typeof evaluationCaseInputSchema>;
export type EvaluationFunctionRunRequest = z.infer<typeof evaluationFunctionRunRequestSchema>;
export type EvaluationFunctionSaveRequest = z.infer<typeof evaluationFunctionSaveRequestSchema>;
export type EvaluationFunctionDeleteRequest = z.infer<typeof evaluationFunctionDeleteRequestSchema>;
export const emptyTokenUsage = (): EvaluationUsage => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  ordinaryInputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
});

export const emptyCostBreakdown = (): CostBreakdown => ({
  inputCost: 0,
  outputCost: 0,
  totalCost: 0,
  tokens: emptyTokenUsage(),
});
