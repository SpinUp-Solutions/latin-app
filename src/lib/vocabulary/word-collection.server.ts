import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

export const LEGACY_VOCABULARY_WORDS_COLLECTION = 'vocabulary_words_v4';

export class VocabularyWordCollectionError extends Error {
  readonly status = 400;
  readonly code = 'INVALID_VOCABULARY_WORD_COLLECTION';

  constructor(collection: unknown) {
    super(`Unsupported vocabulary word collection: ${String(collection)}`);
    this.name = 'VocabularyWordCollectionError';
  }
}

export function requireVocabularyWordsCollection(collection: unknown): string {
  if (collection === undefined || collection === null || collection === '') return VOCABULARY_WORDS_COLLECTION;
  if (collection !== VOCABULARY_WORDS_COLLECTION) throw new VocabularyWordCollectionError(collection);
  return VOCABULARY_WORDS_COLLECTION;
}

export function requireVocabularyWordMigrationCollections(source: unknown, target: unknown) {
  const sourceCollection = source || LEGACY_VOCABULARY_WORDS_COLLECTION;
  const targetCollection = target || VOCABULARY_WORDS_COLLECTION;
  if (sourceCollection !== LEGACY_VOCABULARY_WORDS_COLLECTION || targetCollection !== VOCABULARY_WORDS_COLLECTION) {
    throw new VocabularyWordCollectionError(`${String(sourceCollection)} -> ${String(targetCollection)}`);
  }
  return { sourceCollection, targetCollection };
}
