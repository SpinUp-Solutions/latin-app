import { VocabularyWord } from '../types/vocabulary/schemas';
import { PartOfSpeech } from '../types/vocabulary/schemas/enums';

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
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  tokens: TokenUsage;
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
