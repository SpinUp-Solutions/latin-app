import type { CostBreakdown, CostMeasurement, TokenUsage } from './types';

type TranslationGradingFailureCode =
  | 'provider-error'
  | 'response-incomplete'
  | 'response-missing-message'
  | 'response-missing-text'
  | 'response-malformed-json'
  | 'response-invalid-output';

interface TranslationGradingRunBase {
  requestedModel: string;
  model?: string;
  usage?: TokenUsage;
  tokensUsed?: number;
  cost?: CostBreakdown;
  costMeasurement: CostMeasurement;
  latencyMs: number;
}

export interface TranslationGradingRunSuccess<T = unknown> extends TranslationGradingRunBase {
  success: true;
  data: T;
}

export interface TranslationGradingRunFailure extends TranslationGradingRunBase {
  success: false;
  code: TranslationGradingFailureCode;
  /** Stable, safe-to-display message. Raw provider details stay in server logs. */
  error: string;
}

export type TranslationGradingRunResult<T = unknown> = TranslationGradingRunSuccess<T> | TranslationGradingRunFailure;
