import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { MAX_VOCABULARY_POOL_WORD_ADDITIONS } from '@/src/lib/vocabulary-pools/limits';

export class VocabularyPoolWordMembershipError extends Error {
  readonly status = 409;
  readonly code = 'VOCABULARY_POOL_WORDS_MISSING';

  constructor(message: string) {
    super(message);
    this.name = 'VocabularyPoolWordMembershipError';
  }
}

export async function prepareVocabularyPoolWordMembership(
  transaction: Transaction,
  db: Firestore,
  existingWordIds: readonly string[],
  nextWordIds: unknown
): Promise<() => void> {
  if (
    !Array.isArray(nextWordIds) ||
    nextWordIds.some(wordId => typeof wordId !== 'string' || wordId.trim().length === 0)
  ) {
    throw new VocabularyPoolWordMembershipError('Every pool word reference must be a non-empty string');
  }
  const existing = new Set(existingWordIds);
  const addedIds = [...new Set(nextWordIds as string[])].filter(wordId => !existing.has(wordId));
  if (addedIds.length > MAX_VOCABULARY_POOL_WORD_ADDITIONS) {
    throw new VocabularyPoolWordMembershipError(
      `Add at most ${MAX_VOCABULARY_POOL_WORD_ADDITIONS} new words to a pool at once`
    );
  }
  if (addedIds.length === 0) return () => undefined;

  const refs = addedIds.map(wordId => db.collection(VOCABULARY_WORDS_COLLECTION).doc(wordId));
  const snapshots = await transaction.getAll(...refs);
  const missingIds = addedIds.filter((_, index) => !snapshots[index].exists);
  if (missingIds.length > 0) {
    throw new VocabularyPoolWordMembershipError(
      `Cannot assign ${missingIds.length} missing vocabulary ${missingIds.length === 1 ? 'word' : 'words'}`
    );
  }
  const deletingIds = addedIds.filter((_, index) => Boolean(snapshots[index].data()?._deletionPending));
  if (deletingIds.length > 0) {
    throw new VocabularyPoolWordMembershipError(
      `Cannot assign ${deletingIds.length} vocabulary ${deletingIds.length === 1 ? 'word' : 'words'} pending deletion`
    );
  }

  return () => {
    snapshots.forEach((snapshot, index) => {
      const revision = snapshot.data()?._poolReferenceRevision;
      transaction.update(refs[index], {
        _poolReferenceRevision: Number.isSafeInteger(revision) ? Number(revision) + 1 : 1,
      });
    });
  };
}
