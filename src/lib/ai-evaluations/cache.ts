import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { isValidTokenUsage } from '../../../shared/openai/model-registry';
import type { CostBreakdown, TokenUsage } from '../../../shared/openai/types';
import {
  getTranslationGradingTask,
  type TestTranslationGradingOutput,
  type TranslationGradingOutput,
} from '../../../shared/openai/translation-grading-tasks';
import type { TranslationGradingMode } from '../../../shared/openai/types';
import { AI_EVALUATION_RESULT_CACHE_COLLECTION } from '../../../shared/constants/firestore';

const AI_EVALUATION_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface CachedEvaluationResult {
  cacheKey: string;
  gradingMode: TranslationGradingMode;
  model: string;
  actualModel: string;
  output: TranslationGradingOutput | TestTranslationGradingOutput;
  usage: TokenUsage;
  cost: CostBreakdown;
  latencyMs: number;
  generatedAt: string;
}

const cacheCollection = (db: Firestore) => db.collection(AI_EVALUATION_RESULT_CACHE_COLLECTION);

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isValidCost = (value: unknown, usage: TokenUsage): value is CostBreakdown => {
  if (!value || typeof value !== 'object') return false;
  const cost = value as Partial<CostBreakdown>;
  return (
    isFiniteNonNegative(cost.inputCost) &&
    isFiniteNonNegative(cost.outputCost) &&
    isFiniteNonNegative(cost.totalCost) &&
    Math.abs(cost.totalCost - cost.inputCost! - cost.outputCost!) < 1e-12 &&
    isValidTokenUsage(cost.tokens) &&
    cost.tokens.promptTokens === usage.promptTokens &&
    cost.tokens.completionTokens === usage.completionTokens &&
    cost.tokens.totalTokens === usage.totalTokens
  );
};

const expiresAtMillis = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object' || !('toMillis' in value)) return undefined;
  const millis = (value as { toMillis?: () => unknown }).toMillis?.();
  return typeof millis === 'number' && Number.isFinite(millis) ? millis : undefined;
};

export async function getCachedEvaluationResult(
  cacheKey: string,
  gradingMode: TranslationGradingMode,
  db: Firestore
): Promise<CachedEvaluationResult | null> {
  const snapshot = await cacheCollection(db).doc(cacheKey).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as (Partial<CachedEvaluationResult> & { expiresAt?: unknown }) | undefined;
  const expiry = expiresAtMillis(data?.expiresAt);
  if (!expiry || expiry <= Date.now()) {
    // Old records without a TTL and expired records are never reused. Cleanup
    // is best effort so a transient delete failure does not block a fresh run.
    await snapshot.ref.delete().catch(error => console.warn('[ai-evaluations] stale cache cleanup failed', error));
    return null;
  }

  if (data?.gradingMode !== gradingMode) return null;
  let output: TranslationGradingOutput | TestTranslationGradingOutput;
  try {
    output = getTranslationGradingTask(gradingMode).parse(data.output);
  } catch {
    return null;
  }

  const usage = data.usage;
  if (
    !data.model ||
    !data.actualModel ||
    !isValidTokenUsage(usage) ||
    !isValidCost(data.cost, usage) ||
    !isFiniteNonNegative(data.latencyMs) ||
    typeof data.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(data.generatedAt))
  ) {
    return null;
  }

  return {
    cacheKey,
    gradingMode,
    model: data.model,
    actualModel: data.actualModel,
    output,
    usage,
    cost: data.cost,
    latencyMs: data.latencyMs,
    generatedAt: data.generatedAt,
  };
}

export async function setCachedEvaluationResult(result: CachedEvaluationResult, db: Firestore): Promise<void> {
  if (!isValidTokenUsage(result.usage) || !isValidCost(result.cost, result.usage)) {
    throw new Error('Cannot cache an evaluation without measured, consistent usage and cost');
  }
  getTranslationGradingTask(result.gradingMode).parse(result.output);
  await cacheCollection(db)
    .doc(result.cacheKey)
    .set({ ...result, expiresAt: Timestamp.fromMillis(Date.now() + AI_EVALUATION_CACHE_RETENTION_MS) });
}
