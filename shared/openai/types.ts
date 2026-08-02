import type { VocabularyWord } from '../types/vocabulary/schemas';
import type { PartOfSpeech } from '../types/vocabulary/schemas/enums';

export type AIProvider = 'openai';

export interface AIAutocompleteRequest {
  word: string;
  part_of_speech: PartOfSpeech;
  existingData?: Partial<VocabularyWord>;
  fieldsToComplete?: AICompletableField[];
  overwriteExisting?: boolean;
}

export type AICompletableField =
  | 'translation'
  | 'definitions'
  | 'etymology'
  | 'pronunciation'
  | 'gender'
  | 'declension'
  | 'declension_table'
  | 'conjugation'
  | 'conjugation_table'
  | 'principal_parts'
  | 'is_deponent'
  | 'degrees_table'
  | 'alternate_form'
  | 'pronoun_type'
  | 'dictionary_forms'
  | 'nominative_singular'
  | 'genitive_singular';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Input tokens not read from or written to the prompt cache. */
  ordinaryInputTokens?: number;
  /** Input tokens served from OpenAI's prompt cache. */
  cachedInputTokens?: number;
  /** Input tokens written to the prompt cache, when reported by the API. */
  cacheWriteTokens?: number;
  /** Reasoning tokens are included in completionTokens and are informational. */
  reasoningTokens?: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  tokens: TokenUsage;
  /** Version/source of the price table used for this estimate. */
  pricingVersion?: string;
  pricingSource?: string;
}

export type CostMeasurementStatus = 'measured' | 'not-incurred-app-cache' | 'not-incurred-coalesced' | 'unavailable';

export interface CostMeasurement {
  status: CostMeasurementStatus;
  /** Present only when the amount was calculated from measured token usage. */
  cost?: CostBreakdown;
  reason?: string;
}

export interface ErrorDetails {
  message: string;
  type?: string;
  stack?: string;
  details?: string;
}

export interface AIAutocompleteResponse {
  success: boolean;
  data?: Partial<VocabularyWord>;
  error?: string;
  errorDetails?: ErrorDetails;
  tokensUsed?: number;
  model?: string;
  cost?: CostBreakdown;
  fieldStatus?: Record<string, 'filled' | 'missing'>;
  notes?: string;
}

export type OpenAIStructuredOutput = Partial<VocabularyWord>;

export type TranslationDirection = 'latin-to-english' | 'english-to-latin';
export const TRANSLATION_FEEDBACK_LEVELS = ['Excellent', 'Very good', 'Good', 'Adequate', 'Not quite right'] as const;
export type TranslationFeedbackLevel = (typeof TRANSLATION_FEEDBACK_LEVELS)[number];

export interface TranslationGradingRequest {
  sourceText: string;
  userTranslation: string;
  direction: TranslationDirection;
  provider?: AIProvider;
}

export interface TranslationGradingResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: ErrorDetails;
  tokensUsed?: number;
  model?: string;
  cost?: CostBreakdown;
}
