/**
 * Versioned OpenAI model metadata used by both production grading and the
 * admin evaluation suite. Prices are standard, short-context USD per 1M
 * tokens and were verified against OpenAI's pricing documentation on
 * 2026-08-01: https://developers.openai.com/api/docs/pricing
 */

import type { CostBreakdown, TokenUsage, TranslationGradingMode } from './types';

export const OPENAI_PRICING_VERSION = '2026-08-01';
export const OPENAI_PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export type OpenAIReasoningEffort = 'low' | 'high';

export interface OpenAIModelPricing {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  cacheWritePerMillion: number;
  outputPerMillion: number;
}

interface OpenAIModelDefinition {
  model: string;
  label: string;
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

export const OPENAI_MODEL_CATALOG = {
  gpt54Mini: {
    model: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    pricing: BASELINE_PRICING,
  },
  gpt56Luna: {
    model: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    pricing: CANDIDATE_PRICING,
  },
} as const satisfies Record<string, OpenAIModelDefinition>;

type OpenAIModelId = keyof typeof OPENAI_MODEL_CATALOG;

/**
 * A run profile is deliberately separate from the model catalog. Profiles
 * capture how we call a model; tasks own prompts and output schemas.
 */
export interface TranslationGradingProfileDefinition {
  key: string;
  modelId: OpenAIModelId;
  model: string;
  label: string;
  reasoningEffort: OpenAIReasoningEffort;
  maxOutputTokens: Record<TranslationGradingMode, number>;
  promptCacheKey: string;
  promptCacheMode: 'automatic' | 'explicit';
  profileVersion: string;
  pricing: OpenAIModelPricing;
}

interface TranslationGradingProfileOptions {
  labelSuffix: string;
  reasoningEffort: OpenAIReasoningEffort;
  maxOutputTokens: Record<TranslationGradingMode, number>;
  promptCacheKey: string;
  promptCacheMode: 'automatic' | 'explicit';
  profileVersion: string;
}

const defineTranslationGradingProfile = <const K extends string, const M extends OpenAIModelId>(
  key: K,
  modelId: M,
  options: TranslationGradingProfileOptions
) => {
  const model = OPENAI_MODEL_CATALOG[modelId];
  const { labelSuffix, ...execution } = options;
  return {
    key,
    modelId,
    model: model.model,
    label: `${model.label} · ${labelSuffix}`,
    pricing: model.pricing,
    ...execution,
  };
};

const OPENAI_MODEL_PRICING: Record<string, OpenAIModelPricing> = Object.fromEntries(
  Object.values(OPENAI_MODEL_CATALOG).map(model => [model.model, model.pricing])
);

export const TRANSLATION_GRADING_PROFILES = {
  baseline: defineTranslationGradingProfile('baseline', 'gpt54Mini', {
    labelSuffix: 'Low',
    reasoningEffort: 'low',
    // Keep existing production limits while making the per-task knob clear.
    maxOutputTokens: { lesson: 5000, test: 5000 },
    promptCacheKey: 'translation-grading-v3:baseline',
    promptCacheMode: 'automatic',
    profileVersion: 'translation-grading-v3:baseline',
  }),
  candidate: defineTranslationGradingProfile('candidate', 'gpt56Luna', {
    labelSuffix: 'High',
    reasoningEffort: 'high',
    maxOutputTokens: { lesson: 8000, test: 8000 },
    promptCacheKey: 'translation-grading-v3:candidate',
    promptCacheMode: 'explicit',
    profileVersion: 'translation-grading-v3:candidate',
  }),
} as const satisfies Record<string, TranslationGradingProfileDefinition>;

export type TranslationGradingProfileId = keyof typeof TRANSLATION_GRADING_PROFILES;
export type TranslationGradingProfile = (typeof TRANSLATION_GRADING_PROFILES)[TranslationGradingProfileId];

export const getTranslationGradingProfile = (key: TranslationGradingProfileId): TranslationGradingProfile =>
  TRANSLATION_GRADING_PROFILES[key];

/** Production switches are policy, not call-site conditionals. */
export const PRODUCTION_TRANSLATION_POLICY = {
  lesson: 'baseline',
  test: 'baseline',
} as const satisfies Record<TranslationGradingMode, TranslationGradingProfileId>;

/** The evaluation workspace renders and runs these registered profiles. */
export const EVALUATION_TRANSLATION_PROFILE_IDS = [
  'baseline',
  'candidate',
] as const satisfies readonly TranslationGradingProfileId[];

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

export function calculateProfileCost(usage: unknown, profile: TranslationGradingProfileDefinition): CostBreakdown {
  return calculateOpenAICost(usage, profile.pricing);
}

export function calculateModelCost(usage: unknown, model: string): CostBreakdown | undefined {
  if (!parseOpenAIUsage(usage)) return undefined;
  const pricing = OPENAI_MODEL_PRICING[model];
  return pricing ? calculateOpenAICost(usage, pricing) : undefined;
}
