import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { VOCABULARY_EVALUATION_RESULT_CACHE_COLLECTION } from '../../../shared/constants/firestore';
import { vocabularyAutocompleteRequestBody } from '../../../shared/openai/autocomplete';
import { isValidTokenUsage, type VocabularyAutocompleteProfile } from '../../../shared/openai/model-registry';
import type { TokenUsage } from '../../../shared/openai/types';
import type { PartOfSpeech } from '../../../shared/types/vocabulary/schemas/enums';
import { VOCABULARY_EVALUATION_SCHEMA_VERSION } from './contracts';

const CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

const cachedResultSchema = z.object({
  model: z.string(),
  actualModel: z.string(),
  output: z.record(z.string(), z.unknown()),
  usage: z.custom<TokenUsage>(isValidTokenUsage),
  latencyMs: z.number(),
  generatedAt: z.string(),
});
export type CachedVocabularyResult = z.infer<typeof cachedResultSchema>;

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

/** A stored result that is still fresh and well formed; anything else counts as a miss. */
export async function getCachedVocabularyResult(
  cacheKey: string,
  db: Firestore
): Promise<CachedVocabularyResult | null> {
  const data = (await cacheCollection(db).doc(cacheKey).get()).data();
  if (!(data?.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) return null;
  return cachedResultSchema.safeParse(data).data ?? null;
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
