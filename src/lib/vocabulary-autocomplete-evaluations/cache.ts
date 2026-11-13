import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { VOCABULARY_EVALUATION_RESULT_CACHE_COLLECTION } from '../../../shared/constants/firestore';
import { vocabularyAutocompleteRequestBody } from '../../../shared/openai/autocomplete';
import { isValidTokenUsage, type VocabularyAutocompleteProfile } from '../../../shared/openai/model-registry';
import type { TokenUsage } from '../../../shared/openai/types';
import type { PartOfSpeech } from '../../../shared/types/vocabulary/schemas/enums';
import { VOCABULARY_EVALUATION_SCHEMA_VERSION } from './contracts';

const CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface CachedVocabularyResult {
  model: string;
  actualModel: string;
  output: Record<string, unknown>;
  usage: TokenUsage;
  latencyMs: number;
  generatedAt: string;
}

/**
 * Hashes the exact prompt and output schema, so editing either one starts
 * fresh results without a manual version bump.
 */
export function createVocabularyCacheKey(
  profile: VocabularyAutocompleteProfile,
  word: string,
  partOfSpeech: PartOfSpeech
): string {
  const body = vocabularyAutocompleteRequestBody(partOfSpeech, word);
  const canonical = {
    schemaVersion: VOCABULARY_EVALUATION_SCHEMA_VERSION,
    profileVersion: profile.profileVersion,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort,
    maxOutputTokens: profile.maxOutputTokens,
    instructions: body.instructions,
    input: body.input,
    format: body.format,
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

const cacheCollection = (db: Firestore) => db.collection(VOCABULARY_EVALUATION_RESULT_CACHE_COLLECTION);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export async function getCachedVocabularyResult(
  cacheKey: string,
  db: Firestore
): Promise<CachedVocabularyResult | null> {
  const snapshot = await cacheCollection(db).doc(cacheKey).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as Partial<CachedVocabularyResult> & { expiresAt?: Timestamp };
  if (!(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) return null;
  if (
    typeof data.model !== 'string' ||
    typeof data.actualModel !== 'string' ||
    !isPlainObject(data.output) ||
    !isValidTokenUsage(data.usage) ||
    typeof data.latencyMs !== 'number' ||
    !Number.isFinite(data.latencyMs) ||
    typeof data.generatedAt !== 'string'
  ) {
    return null;
  }
  return {
    model: data.model,
    actualModel: data.actualModel,
    output: data.output,
    usage: data.usage,
    latencyMs: data.latencyMs,
    generatedAt: data.generatedAt,
  };
}

export async function setCachedVocabularyResult(
  cacheKey: string,
  result: CachedVocabularyResult,
  db: Firestore
): Promise<void> {
  await cacheCollection(db)
    .doc(cacheKey)
    .set({ ...result, expiresAt: Timestamp.fromMillis(Date.now() + CACHE_RETENTION_MS) });
}
