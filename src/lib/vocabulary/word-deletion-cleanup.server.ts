import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

export const WORD_DELETION_POOL_CLEANUP_BATCH_SIZE = 150;
const CLEANED_POOL_NAME_SAMPLE_SIZE = 20;
export const WORD_DELETION_POOL_SCAN_PAGE_SIZE = 200;
export const WORD_DELETION_POOL_WARNING_SAMPLE_SIZE = 100;

type PendingDeletion = { actorUid?: unknown; tokenHash?: unknown };

function isAuthorizedPendingDeletion(value: unknown, actorUid: string, tokenHash: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pending = value as PendingDeletion;
  return pending.actorUid === actorUid && pending.tokenHash === tokenHash;
}

export async function scanVocabularyWordPoolReferences(
  db: Firestore,
  wordId: string
): Promise<Array<{ id: string; name: string }>> {
  const references: Array<{ id: string; name: string }> = [];
  let lastDocument: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    let query = db
      .collection('vocabulary_pools')
      .where('wordDocIds', 'array-contains', wordId)
      .orderBy(FieldPath.documentId())
      .limit(WORD_DELETION_POOL_SCAN_PAGE_SIZE);
    if (lastDocument) query = query.startAfter(lastDocument);
    const snapshot = await query.get();
    for (const poolDoc of snapshot.docs) {
      references.push({ id: poolDoc.id, name: String(poolDoc.data().name || poolDoc.id) });
    }
    if (snapshot.docs.length < WORD_DELETION_POOL_SCAN_PAGE_SIZE) break;
    lastDocument = snapshot.docs[snapshot.docs.length - 1];
  }
  return references;
}

/**
 * Removes a pending word from referencing pools in bounded, retryable
 * transactions. Pool membership writers read the same pending marker and
 * refuse to add the word while cleanup is in progress.
 */
export async function cleanupVocabularyWordPoolReferences(
  db: Firestore,
  input: { wordId: string; actorUid: string; tokenHash: string }
): Promise<{ cleanedPoolCount: number; cleanedPoolNames: string[] }> {
  const wordRef = db.collection(VOCABULARY_WORDS_COLLECTION).doc(input.wordId);
  const poolsQuery = db
    .collection('vocabulary_pools')
    .where('wordDocIds', 'array-contains', input.wordId)
    .limit(WORD_DELETION_POOL_CLEANUP_BATCH_SIZE);
  let cleanedPoolCount = 0;
  const cleanedPoolNames: string[] = [];

  while (true) {
    const chunk = await runVocabularyContentMutation(db, async transaction => {
      const [wordDoc, currentPools] = await Promise.all([transaction.get(wordRef), transaction.get(poolsQuery)]);
      if (!wordDoc.exists) throw new Error('Word not found');
      if (!isAuthorizedPendingDeletion(wordDoc.data()?._deletionPending, input.actorUid, input.tokenHash)) {
        throw new Error('Word deletion cleanup is not authorized');
      }

      for (const poolDoc of currentPools.docs) {
        const poolData = poolDoc.data();
        const updatedWordIds = Array.isArray(poolData.wordDocIds)
          ? poolData.wordDocIds.filter((id: unknown) => id !== input.wordId)
          : [];
        transaction.update(poolDoc.ref, {
          wordDocIds: updatedWordIds,
          'metadata.wordCount': updatedWordIds.length,
          'metadata.updatedAt': new Date(),
        });
      }
      return currentPools.docs.map(poolDoc =>
        typeof poolDoc.data().name === 'string' ? poolDoc.data().name : poolDoc.id
      );
    });

    if (chunk.length === 0) break;
    cleanedPoolCount += chunk.length;
    for (const name of chunk) {
      if (cleanedPoolNames.length >= CLEANED_POOL_NAME_SAMPLE_SIZE) break;
      cleanedPoolNames.push(name);
    }
  }

  return { cleanedPoolCount, cleanedPoolNames };
}
