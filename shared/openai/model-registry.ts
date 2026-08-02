/**
 * Versioned OpenAI model metadata used by both production grading and the
 * admin evaluation suite. Prices are standard, short-context USD per 1M
 * tokens and were verified against OpenAI's pricing documentation on
 * 2026-08-01: https://developers.openai.com/api/docs/pricing
 */

import type { CostBreakdown, TokenUsage } from './types';

export const OPENAI_PRICING_VERSION = '2026-08-01';
export const OPENAI_PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export const OPENAI_MODELS_SOURCE = 'https://developers.openai.com/api/docs/models';
// Batch is intentionally not used for this interactive suite: it is asynchronous
// and may take up to 24 hours despite its lower price: https://developers.openai.com/api/docs/guides/batch
export const OPENAI_BATCH_GUIDE_SOURCE = 'https://developers.openai.com/api/docs/guides/batch';
export const OPENAI_PROMPT_CACHING_SOURCE = 'https://developers.openai.com/api/docs/guides/prompt-caching';
export const TRANSLATION_GRADING_PROMPT_VERSION = 'translation-grading-v3';
export const TEST_TRANSLATION_GRADING_PROMPT_VERSION = `${TRANSLATION_GRADING_PROMPT_VERSION}:test`;
export const TEST_TRANSLATION_GRADING_OUTPUT_TOKEN_LIMIT = 768;

export type OpenAIReasoningEffort = 'low' | 'high';

export interface OpenAIModelPricing {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  cacheWritePerMillion: number;
  outputPerMillion: number;
}

export interface OpenAIModelProfile {
  key: 'baseline' | 'candidate' | 'test';
  model: string;
  label: string;
  reasoningEffort: OpenAIReasoningEffort;
  maxOutputTokens: number;
  promptCacheKey: string;
  promptCacheMode: 'automatic' | 'explicit';
  promptVersion: string;
  profileVersion: string;
  pricing: OpenAIModelPricing;
}

const BASELINE_PRICING: OpenAIModelPricing = {
  inputPerMillion: 0.75,
  cachedInputPerMillion: 0.075,
  // GPT-5.4-mini does not have a separate cache-write surcharge. Keeping the
  // rate explicit lets usage accounting handle cache-write fields safely.
  cacheWritePerMillion: 0.75,
  outputPerMillion: 4.5,
};

const CANDIDATE_PRICING: OpenAIModelPricing = {
  inputPerMillion: 0.2,
  cachedInputPerMillion: 0.02,
  cacheWritePerMillion: 0.25,
  outputPerMillion: 1.2,
};

export const OPENAI_MODEL_PRICING: Record<string, OpenAIModelPricing> = {
  'gpt-5.4-mini': BASELINE_PRICING,
  'gpt-5.6-luna': CANDIDATE_PRICING,
};

export const TRANSLATION_GRADING_PROFILES = {
  baseline: {
    key: 'baseline',
    model: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini · Low',
    reasoningEffort: 'low',
    maxOutputTokens: 5000,
    promptCacheKey: `${TRANSLATION_GRADING_PROMPT_VERSION}:baseline`,
    promptCacheMode: 'automatic',
    promptVersion: TRANSLATION_GRADING_PROMPT_VERSION,
    profileVersion: `${TRANSLATION_GRADING_PROMPT_VERSION}:baseline`,
    pricing: BASELINE_PRICING,
  },
  candidate: {
    key: 'candidate',
    model: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna · High',
    reasoningEffort: 'high',
    maxOutputTokens: 8000,
    promptCacheKey: `${TRANSLATION_GRADING_PROMPT_VERSION}:candidate`,
    promptCacheMode: 'explicit',
    promptVersion: TRANSLATION_GRADING_PROMPT_VERSION,
    profileVersion: `${TRANSLATION_GRADING_PROMPT_VERSION}:candidate`,
    pricing: CANDIDATE_PRICING,
  },
} as const satisfies Record<'baseline' | 'candidate', OpenAIModelProfile>;

export type TranslationGradingProfileKey = keyof typeof TRANSLATION_GRADING_PROFILES;
export type TranslationGradingProfile = OpenAIModelProfile;

/**
 * Test submissions return only a numeric score. Keep their output budget
 * independent from the detailed lesson-grading profile so a verbose lesson
 * response cannot consume the same token budget as a score-only response.
 */
export const TEST_TRANSLATION_GRADING_PROFILE: OpenAIModelProfile = {
  key: 'test',
  model: TRANSLATION_GRADING_PROFILES.baseline.model,
  label: 'GPT-5.4 Mini · Test score',
  reasoningEffort: TRANSLATION_GRADING_PROFILES.baseline.reasoningEffort,
  maxOutputTokens: TEST_TRANSLATION_GRADING_OUTPUT_TOKEN_LIMIT,
  // Keep the existing baseline route for the short score-only prefix; the
  // dedicated profile and namespace still distinguish application cache keys.
  promptCacheKey: TRANSLATION_GRADING_PROFILES.baseline.promptCacheKey,
  promptCacheMode: 'automatic',
  promptVersion: TEST_TRANSLATION_GRADING_PROMPT_VERSION,
  profileVersion: `${TEST_TRANSLATION_GRADING_PROMPT_VERSION}:profile-v1`,
  pricing: TRANSLATION_GRADING_PROFILES.baseline.pricing,
};

export const getTranslationGradingProfile = (key: TranslationGradingProfileKey): TranslationGradingProfile =>
  TRANSLATION_GRADING_PROFILES[key];

interface RawUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
  input_tokens_details?: unknown;
  output_tokens_details?: unknown;
  cached_tokens?: unknown;
  cache_write_tokens?: unknown;
  reasoning_tokens?: unknown;
}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const readOptionalInteger = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  return isNonNegativeInteger(value) ? value : undefined;
};

const readDetailsInteger = (value: unknown, key: string): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return undefined;
  return readOptionalInteger((value as Record<string, unknown>)[key]);
};

/**
 * Parse usage without silently converting malformed provider data into a
 * billable-looking zero. Missing optional cache/reasoning details are valid;
 * negative, fractional, or internally inconsistent counters are not.
 */
export function parseOpenAIUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const raw = usage as RawUsage;
  const promptTokens = readOptionalInteger(raw.input_tokens);
  const completionTokens = readOptionalInteger(raw.output_tokens);
  if (promptTokens === undefined || completionTokens === undefined) return undefined;

  const reportedTotal = readOptionalInteger(raw.total_tokens);
  const totalTokens = reportedTotal ?? promptTokens + completionTokens;
  if (totalTokens !== promptTokens + completionTokens) return undefined;

  const cachedFromDetails = readDetailsInteger(raw.input_tokens_details, 'cached_tokens');
  const cachedFromTopLevel = readOptionalInteger(raw.cached_tokens);
  const cacheWriteFromDetails = readDetailsInteger(raw.input_tokens_details, 'cache_write_tokens');
  const cacheWriteFromTopLevel = readOptionalInteger(raw.cache_write_tokens);
  const reasoningFromDetails = readDetailsInteger(raw.output_tokens_details, 'reasoning_tokens');
  const reasoningFromTopLevel = readOptionalInteger(raw.reasoning_tokens);

  if (raw.input_tokens_details !== undefined && raw.input_tokens_details !== null) {
    if (typeof raw.input_tokens_details !== 'object') return undefined;
    const details = raw.input_tokens_details as Record<string, unknown>;
    if ('cached_tokens' in details && cachedFromDetails === undefined) return undefined;
    if ('cache_write_tokens' in details && cacheWriteFromDetails === undefined) return undefined;
  }
  if (raw.output_tokens_details !== undefined && raw.output_tokens_details !== null) {
    if (typeof raw.output_tokens_details !== 'object') return undefined;
    const details = raw.output_tokens_details as Record<string, unknown>;
    if ('reasoning_tokens' in details && reasoningFromDetails === undefined) return undefined;
  }

  if ('cached_tokens' in raw && cachedFromTopLevel === undefined) return undefined;
  if ('cache_write_tokens' in raw && cacheWriteFromTopLevel === undefined) return undefined;
  if ('reasoning_tokens' in raw && reasoningFromTopLevel === undefined) return undefined;

  const cachedInputTokens = cachedFromDetails ?? cachedFromTopLevel ?? 0;
  const cacheWriteTokens = cacheWriteFromDetails ?? cacheWriteFromTopLevel ?? 0;
  const reasoningTokens = reasoningFromDetails ?? reasoningFromTopLevel ?? 0;
  if (cachedInputTokens + cacheWriteTokens > promptTokens) return undefined;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    ordinaryInputTokens: promptTokens - cachedInputTokens - cacheWriteTokens,
    cachedInputTokens,
    cacheWriteTokens,
    reasoningTokens,
  };
}

/**
 * Responses API usage has evolved a little across SDK/API versions. Keep the
 * legacy normalizer tolerant for existing autocomplete callers; evaluation
 * billing uses parseOpenAIUsage so malformed usage is marked unavailable.
 */
export function normalizeOpenAIUsage(usage: unknown): TokenUsage {
  return (
    parseOpenAIUsage(usage) ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      ordinaryInputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    }
  );
}

export function isValidTokenUsage(value: unknown): value is TokenUsage {
  if (!value || typeof value !== 'object') return false;
  const usage = value as Partial<TokenUsage>;
  const required = [usage.promptTokens, usage.completionTokens, usage.totalTokens];
  if (!required.every(isNonNegativeInteger) || usage.totalTokens !== usage.promptTokens! + usage.completionTokens!) {
    return false;
  }
  const optional = [usage.ordinaryInputTokens, usage.cachedInputTokens, usage.cacheWriteTokens, usage.reasoningTokens];
  if (!optional.every(value => value === undefined || isNonNegativeInteger(value))) return false;
  const ordinary = usage.ordinaryInputTokens ?? usage.promptTokens!;
  const cached = usage.cachedInputTokens ?? 0;
  const writes = usage.cacheWriteTokens ?? 0;
  return ordinary + cached + writes === usage.promptTokens;
}

export function calculateTokenUsageCost(tokens: TokenUsage, pricing: OpenAIModelPricing): CostBreakdown {
  if (!isValidTokenUsage(tokens)) {
    throw new Error('Cannot calculate model cost from invalid token usage');
  }
  const cachedInputTokens = tokens.cachedInputTokens ?? 0;
  const cacheWriteTokens = tokens.cacheWriteTokens ?? 0;
  const ordinaryInputTokens = tokens.ordinaryInputTokens ?? tokens.promptTokens - cachedInputTokens - cacheWriteTokens;
  const inputCost =
    (ordinaryInputTokens / 1_000_000) * pricing.inputPerMillion +
    (cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillion +
    (cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion;
  const outputCost = (tokens.completionTokens / 1_000_000) * pricing.outputPerMillion;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    tokens,
    pricingVersion: OPENAI_PRICING_VERSION,
    pricingSource: OPENAI_PRICING_SOURCE,
  };
}

export function calculateOpenAICost(usage: unknown, pricing: OpenAIModelPricing): CostBreakdown {
  return calculateTokenUsageCost(normalizeOpenAIUsage(usage), pricing);
}

export function calculateProfileCost(usage: unknown, profile: OpenAIModelProfile): CostBreakdown {
  return calculateOpenAICost(usage, profile.pricing);
}

export function calculateModelCost(usage: unknown, model: string): CostBreakdown | undefined {
  if (!parseOpenAIUsage(usage)) return undefined;
  const pricing = OPENAI_MODEL_PRICING[model];
  return pricing ? calculateOpenAICost(usage, pricing) : undefined;
}
