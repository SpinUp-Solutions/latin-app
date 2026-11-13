import { z } from 'zod';
import type { OpenAIReasoningEffort, VocabularyAutocompleteProfileId } from '../../../shared/openai/model-registry';
import type { VocabularyAutocompleteFailureCode } from '../../../shared/openai/autocomplete';
import type { CostBreakdown, TokenUsage } from '../../../shared/openai/types';
import { PartOfSpeechSchema } from '../../../shared/types/vocabulary/schemas/enums';
import type { PartOfSpeech } from '../../../shared/types/vocabulary/schemas/enums';

export const VOCABULARY_EVALUATION_SCHEMA_VERSION = 'vocabulary-autocomplete-evaluation-v1';
/** Every word runs on both profiles at once, so this bounds one run's parallel requests. */
export const VOCABULARY_EVALUATION_MAX_ENTRIES = 6;

const CASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ENTRY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

const caseIdSchema = z.string().regex(CASE_ID_PATTERN, 'Invalid evaluation case id');

const entryInputSchema = z
  .object({
    id: z.string().regex(ENTRY_ID_PATTERN, 'Invalid entry id'),
    word: z.string().trim().min(1, 'Word is required').max(60, 'Word must be 60 characters or fewer'),
    partOfSpeech: PartOfSpeechSchema,
  })
  .strict();

export const vocabularyEvaluationCaseInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(120, 'Title must be 120 characters or fewer'),
    entries: z
      .array(entryInputSchema)
      .min(1, 'Add at least one word')
      .max(VOCABULARY_EVALUATION_MAX_ENTRIES, `Use at most ${VOCABULARY_EVALUATION_MAX_ENTRIES} words`),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    const words = new Set<string>();
    value.entries.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        context.addIssue({ code: 'custom', path: ['entries', index, 'id'], message: 'Entry ids must be unique' });
      }
      const wordKey = `${entry.partOfSpeech}:${entry.word.normalize('NFC')}`;
      if (words.has(wordKey)) {
        context.addIssue({ code: 'custom', path: ['entries', index, 'word'], message: 'Each word appears once' });
      }
      ids.add(entry.id);
      words.add(wordKey);
    });
  });

export const vocabularyEvaluationRunRequestSchema = z
  .object({ caseId: caseIdSchema, forceRefresh: z.boolean().default(false) })
  .strict();
export const vocabularyEvaluationSaveRequestSchema = z
  .object({ caseId: caseIdSchema.optional(), input: vocabularyEvaluationCaseInputSchema })
  .strict();
export const vocabularyEvaluationDeleteRequestSchema = z.object({ caseId: caseIdSchema }).strict();

export type VocabularyEvaluationCaseInput = z.infer<typeof vocabularyEvaluationCaseInputSchema>;
export type VocabularyEvaluationEntry = VocabularyEvaluationCaseInput['entries'][number];
export type VocabularyEvaluationRunRequest = z.infer<typeof vocabularyEvaluationRunRequestSchema>;
export type VocabularyEvaluationSaveRequest = z.infer<typeof vocabularyEvaluationSaveRequestSchema>;
export type VocabularyEvaluationDeleteRequest = z.infer<typeof vocabularyEvaluationDeleteRequestSchema>;

export interface VocabularyEvaluationCase extends VocabularyEvaluationCaseInput {
  id: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** One word autocompleted by one profile. */
export interface VocabularyEvaluationCell {
  entryId: string;
  word: string;
  partOfSpeech: PartOfSpeech;
  profileId: VocabularyAutocompleteProfileId;
  requestedModel: string;
  actualModel?: string;
  reasoningEffort: OpenAIReasoningEffort;
  maxOutputTokens: number;
  output?: Record<string, unknown>;
  error?: string;
  errorCode?: VocabularyAutocompleteFailureCode;
  incompleteReason?: string;
  /** Time the model took when this result was generated. */
  generationLatencyMs: number;
  generatedAt?: string;
  appCacheHit: boolean;
  usage?: TokenUsage;
  /** What generating this result cost, whether now or when it was cached. */
  cost?: CostBreakdown;
  /** Zero for an app-cache hit. */
  costThisRun?: CostBreakdown;
}

export interface VocabularyEvaluationRunResult {
  caseId: string;
  schemaVersion: string;
  forceRefresh: boolean;
  startedAt: string;
  completedAt: string;
  wallTimeMs: number;
  cells: VocabularyEvaluationCell[];
}
