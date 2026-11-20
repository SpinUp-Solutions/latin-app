import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { DomainError } from '@/src/lib/domain-error';
import { serializeVocabularyWord } from '@/src/lib/vocabulary/word-serialization.server';
import { stripMacrons } from '@/src/utils/exercises/helpers';

/** How many existing words with the same headword a refused create reports. */
export const EXISTING_WORDS_SAMPLE_SIZE = 5;

/**
 * The sort keys a headword can be stored under: words are keyed by their headword without macrons, and
 * "Roma" and "roma" are the same headword to an admin adding a word.
 */
export function headwordSortKeys(word: string): string[] {
  const key = stripMacrons(word.trim());
  if (!key) return [];
  const lower = key.toLowerCase();
  return [...new Set([key, lower, lower.charAt(0).toUpperCase() + lower.slice(1)])];
}

/**
 * Words already stored under the same headword. The editor asks while the admin types a new word, before
 * any AI run; the create reads it again in its transaction, so a word added at the same moment is still
 * seen. A word being deleted no longer counts.
 */
export async function findWordsWithHeadword(db: Firestore, word: string, transaction?: Transaction) {
  const keys = headwordSortKeys(word);
  if (keys.length === 0) return [];
  const query = db
    .collection(VOCABULARY_WORDS_COLLECTION)
    .where('sort_key', 'in', keys)
    .limit(EXISTING_WORDS_SAMPLE_SIZE + 1);
  const { docs } = await (transaction ? transaction.get(query) : query.get());
  return docs
    .filter(doc => !doc.data()._deletionPending)
    .slice(0, EXISTING_WORDS_SAMPLE_SIZE)
    .map(doc => ({ id: doc.id, ...serializeVocabularyWord(doc.data()) }));
}

/**
 * The headword is already in the dictionary. Latin has real homographs (cum, liber, malum), so the admin
 * may still create the word by sending it again with `allowDuplicate`.
 */
export class WordAlreadyExistsError extends DomainError {
  readonly code = 'WORD_ALREADY_EXISTS';
  readonly status = 409;
  readonly details: { existingWords: Record<string, unknown>[] };

  constructor(word: string, existingWords: Record<string, unknown>[]) {
    super(`"${word.trim()}" is already in the vocabulary.`);
    this.name = 'WordAlreadyExistsError';
    this.details = { existingWords };
  }
}
