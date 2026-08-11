import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { scanVocabularyPoolUsages } from '@/src/lib/vocabulary-pools/usage.server';
import {
  createVocabularyPoolDeletionChallenge,
  deletionChallengeDocumentId,
  poolUsagesForScan,
  VocabularyPoolDeletionError,
  vocabularyPoolContentFingerprint,
  vocabularyPoolUsageFingerprint,
} from '@/src/lib/vocabulary-pools/deletion.server';
import {
  DELETED_VOCABULARY_POOL_COLLECTION,
  VOCABULARY_POOL_COLLECTION,
  VOCABULARY_POOL_DELETION_CHALLENGE_COLLECTION,
} from '@/src/lib/vocabulary-pools/archive.server';
import {
  CONTENT_SYNC_LOCK_COLLECTION,
  CONTENT_SYNC_LOCK_ID,
  VocabularyContentSyncLockError,
} from '@/src/lib/vocabulary-pools/sync-lock.server';
import {
  VOCABULARY_CONTENT_STATE_COLLECTION,
  VOCABULARY_CONTENT_STATE_ID,
  vocabularyContentRevision,
} from '@/src/lib/vocabulary-pools/content-revision.server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { poolId } = await params;
    const usageScan = await scanVocabularyPoolUsages(adminDb);
    if (usageScan.status !== 'available') {
      throw new VocabularyPoolDeletionError(
        'Assignment checks are unavailable. The pool was not deleted.',
        409,
        'VOCABULARY_POOL_USAGE_UNAVAILABLE'
      );
    }
    const usages = poolUsagesForScan(usageScan, poolId);
    if (usages.length > 0) {
      throw new VocabularyPoolDeletionError(
        `Remove this pool from ${usages.length} saved ${usages.length === 1 ? 'assignment' : 'assignments'} before deleting it.`,
        409,
        'VOCABULARY_POOL_IN_USE'
      );
    }
    const usageFingerprint = vocabularyPoolUsageFingerprint(usageScan, poolId);
    const poolRef = adminDb.collection(VOCABULARY_POOL_COLLECTION).doc(poolId);
    const tombstoneRef = adminDb.collection(DELETED_VOCABULARY_POOL_COLLECTION).doc(poolId);
    const challengeRef = adminDb
      .collection(VOCABULARY_POOL_DELETION_CHALLENGE_COLLECTION)
      .doc(deletionChallengeDocumentId(poolId, actor.uid));
    const syncLockRef = adminDb.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID);
    const contentStateRef = adminDb.collection(VOCABULARY_CONTENT_STATE_COLLECTION).doc(VOCABULARY_CONTENT_STATE_ID);
    const [poolSnapshot, contentStateSnapshot] = await Promise.all([poolRef.get(), contentStateRef.get()]);
    if (!poolSnapshot.exists) {
      throw new VocabularyPoolDeletionError('Pool not found', 404, 'VOCABULARY_POOL_NOT_FOUND');
    }
    const poolData = poolSnapshot.data() ?? {};
    const poolFingerprint = vocabularyPoolContentFingerprint(poolData);
    const poolName = typeof poolData.name === 'string' && poolData.name.trim() ? poolData.name.trim() : poolId;
    const wordCount = new Set(
      (Array.isArray(poolData.wordDocIds) ? poolData.wordDocIds : []).filter(
        (wordId): wordId is string => typeof wordId === 'string' && wordId.length > 0
      )
    ).size;
    const wordContentRevision = vocabularyContentRevision(contentStateSnapshot.data());
    const challenge = createVocabularyPoolDeletionChallenge({
      actorUid: actor.uid,
      poolId,
      usageFingerprint,
      poolFingerprint,
      wordContentRevision,
    });

    await adminDb.runTransaction(async transaction => {
      const [pool, tombstone, syncLock, contentState] = await transaction.getAll(
        poolRef,
        tombstoneRef,
        syncLockRef,
        contentStateRef
      );
      if (syncLock.exists) throw new VocabularyContentSyncLockError();
      if (!pool.exists) {
        throw new VocabularyPoolDeletionError('Pool not found', 404, 'VOCABULARY_POOL_NOT_FOUND');
      }
      if (vocabularyPoolContentFingerprint(pool.data() ?? {}) !== poolFingerprint) {
        throw new VocabularyPoolDeletionError(
          'The pool changed while deletion was being prepared. Review it and try again.',
          409,
          'VOCABULARY_POOL_CONFIRMATION_STALE'
        );
      }
      if (vocabularyContentRevision(contentState.data()) !== wordContentRevision) {
        throw new VocabularyPoolDeletionError(
          'Vocabulary content changed while deletion was being prepared. Review it and try again.',
          409,
          'VOCABULARY_POOL_CONFIRMATION_STALE'
        );
      }
      if (tombstone.exists) {
        throw new VocabularyPoolDeletionError(
          'This pool ID already has an immutable deletion archive.',
          409,
          'VOCABULARY_POOL_ARCHIVE_EXISTS'
        );
      }
      transaction.set(challengeRef, { ...challenge.stored, createdAt: FieldValue.serverTimestamp() });
    });

    return NextResponse.json({
      success: true,
      data: {
        token: challenge.token,
        expiresAt: challenge.stored.expiresAt.toISOString(),
        poolName,
        wordCount,
        usageStatus: usageScan.status,
        usages,
      },
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof VocabularyPoolDeletionError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof VocabularyContentSyncLockError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Error preparing vocabulary pool deletion:', error);
    return NextResponse.json({ success: false, error: 'Failed to prepare vocabulary pool deletion' }, { status: 500 });
  }
}
