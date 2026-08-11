import { randomUUID } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { AdminAccessError } from '@/src/lib/admin-access-error';

export const CONTENT_SYNC_LOCK_COLLECTION = 'content_sync_locks';
export const CONTENT_SYNC_LOCK_ID = 'prod-content-to-dev';

export class VocabularyContentSyncLockError extends AdminAccessError {
  constructor() {
    super(
      'Production content maintenance is in progress. Try again when it finishes.',
      409,
      'VOCABULARY_CONTENT_SYNC_IN_PROGRESS'
    );
    this.name = 'VocabularyContentSyncLockError';
  }
}

export async function runVocabularyContentMutation<T>(
  db: Firestore,
  callback: (transaction: Transaction) => Promise<T>,
  options: { lockOwnerId?: string } = {}
): Promise<T> {
  const lockRef = db.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID);
  return db.runTransaction(async transaction => {
    const lock = await transaction.get(lockRef);
    if (lock.exists && lock.data()?.ownerId !== options.lockOwnerId) throw new VocabularyContentSyncLockError();
    return callback(transaction);
  });
}

export async function assertVocabularyContentMutationUnlocked(db: Firestore): Promise<void> {
  const lock = await db.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID).get();
  if (lock.exists) throw new VocabularyContentSyncLockError();
}

const STORAGE_MUTATION_LOCK_LEASE_MS = 24 * 60 * 60 * 1000;

/** Holds the singleton lock across a multi-transaction or cross-service mutation. */
export async function runVocabularyContentExclusiveMutation<T>(
  db: Firestore,
  callback: (ownerId: string) => Promise<T>
): Promise<T> {
  const ownerId = `app-storage:${randomUUID()}`;
  const lockRef = db.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID);
  await db.runTransaction(async transaction => {
    const lock = await transaction.get(lockRef);
    if (lock.exists) throw new VocabularyContentSyncLockError();
    const now = Date.now();
    transaction.create(lockRef, {
      ownerId,
      runId: ownerId,
      kind: 'app-storage-mutation',
      manifestDurable: false,
      createdAt: new Date(now).toISOString(),
      leaseExpiresAt: new Date(now + STORAGE_MUTATION_LOCK_LEASE_MS).toISOString(),
    });
  });

  try {
    return await callback(ownerId);
  } finally {
    await db.runTransaction(async transaction => {
      const lock = await transaction.get(lockRef);
      if (lock.exists && lock.data()?.ownerId === ownerId) transaction.delete(lockRef);
    });
  }
}

export async function runVocabularyContentStorageMutation<T>(db: Firestore, callback: () => Promise<T>): Promise<T> {
  return runVocabularyContentExclusiveMutation(db, () => callback());
}
