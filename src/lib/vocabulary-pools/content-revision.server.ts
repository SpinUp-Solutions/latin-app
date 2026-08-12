import type { Firestore, Transaction } from 'firebase-admin/firestore';

export const VOCABULARY_CONTENT_STATE_COLLECTION = 'vocabulary_content_state';
export const VOCABULARY_CONTENT_STATE_ID = 'global';

export const vocabularyContentRevision = (data: FirebaseFirestore.DocumentData | undefined): number => {
  const revision = data?.revision;
  return Number.isSafeInteger(revision) && revision >= 0 ? Number(revision) : 0;
};

export async function prepareVocabularyContentRevisionBump(transaction: Transaction, db: Firestore) {
  const ref = db.collection(VOCABULARY_CONTENT_STATE_COLLECTION).doc(VOCABULARY_CONTENT_STATE_ID);
  const snapshot = await transaction.get(ref);
  const nextRevision = vocabularyContentRevision(snapshot.data()) + 1;
  return () => transaction.set(ref, { revision: nextRevision, updatedAt: new Date() }, { merge: true });
}
