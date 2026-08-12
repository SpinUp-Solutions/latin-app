import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { Word } from '@/src/types/admin-vocabulary';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { buildPoolSearchTokens } from '@/src/utils/vocabularyPoolSummary';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { scanVocabularyPoolUsages } from '@/src/lib/vocabulary-pools/usage.server';
import {
  deletionChallengeDocumentId,
  poolUsagesForScan,
  validateVocabularyPoolDeletionChallenge,
  VocabularyPoolDeletionError,
  vocabularyPoolContentFingerprint,
  vocabularyPoolUsageFingerprint,
} from '@/src/lib/vocabulary-pools/deletion.server';
import {
  DELETED_VOCABULARY_POOL_COLLECTION,
  VOCABULARY_POOL_ARCHIVE_COLLECTION,
  VOCABULARY_POOL_COLLECTION,
  VOCABULARY_POOL_DELETION_CHALLENGE_COLLECTION,
  VocabularyPoolArchiveIntegrityError,
  writeVocabularyPoolWordArchive,
} from '@/src/lib/vocabulary-pools/archive.server';
import {
  prepareVocabularyPoolWordMembership,
  VocabularyPoolWordMembershipError,
} from '@/src/lib/vocabulary-pools/word-membership.server';
import {
  runVocabularyContentExclusiveMutation,
  runVocabularyContentMutation,
  VocabularyContentSyncLockError,
} from '@/src/lib/vocabulary-pools/sync-lock.server';
import {
  VOCABULARY_CONTENT_STATE_COLLECTION,
  VOCABULARY_CONTENT_STATE_ID,
  vocabularyContentRevision,
} from '@/src/lib/vocabulary-pools/content-revision.server';

export const dynamic = 'force-dynamic';

const serializePoolMetadata = (metadata: FirebaseFirestore.DocumentData) => ({
  ...metadata,
  createdAt: metadata.createdAt?.toDate ? metadata.createdAt.toDate() : metadata.createdAt,
  updatedAt: metadata.updatedAt?.toDate ? metadata.updatedAt.toDate() : metadata.updatedAt,
});

const routeErrorResponse = (error: unknown, action: string) => {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  if (error instanceof VocabularyPoolDeletionError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof VocabularyPoolArchiveIntegrityError) {
    return NextResponse.json(
      { success: false, error: error.message, code: 'VOCABULARY_POOL_ARCHIVE_INCOMPLETE' },
      { status: 409 }
    );
  }
  if (error instanceof VocabularyPoolWordMembershipError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof VocabularyContentSyncLockError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
  }

  console.error(`Error ${action} vocabulary pool:`, error);
  const notFound = error instanceof Error && error.message.includes('not found');
  const status = notFound ? 404 : 500;
  return NextResponse.json(
    { success: false, error: notFound ? error.message : `Failed to ${action} vocabulary pool` },
    { status }
  );
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const { poolId } = await params;

    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      throw new Error('Pool not found');
    }

    const poolData = poolDoc.data();
    if (!poolData) {
      throw new Error('Pool data not found');
    }

    const pool = {
      id: poolDoc.id,
      ...poolData,
      metadata: {
        ...serializePoolMetadata(poolData.metadata),
      },
    };

    const wordIds = poolData.wordDocIds || [];
    const words: Word[] = [];

    if (wordIds.length > 0) {
      const batches = [];
      for (let i = 0; i < wordIds.length; i += 10) {
        const batch = wordIds.slice(i, i + 10);
        batches.push(
          adminDb
            .collection(VOCABULARY_WORDS_COLLECTION)
            .where(FieldPath.documentId(), 'in', batch)
            .select(
              'word',
              'dictionary_entry',
              'translation',
              'part_of_speech',
              'definitions',
              'pronunciation',
              'gender',
              'declension',
              'conjugation',
              'is_deponent',
              'section',
              'createdAt',
              'updatedAt'
            )
            .get()
        );
      }

      const batchResults = await Promise.all(batches);
      batchResults.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          words.push({
            id: doc.id,
            ...data,
            wordType: data.part_of_speech,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          } as Word);
        });
      });

      const wordMap = new Map(words.map(word => [word.id, word]));
      const orderedWords: Word[] = [];
      const missingWordIds: string[] = [];

      wordIds.forEach((id: string) => {
        const word = wordMap.get(id);
        if (word) {
          orderedWords.push(word);
        } else {
          missingWordIds.push(id);
        }
      });

      return NextResponse.json({
        success: true,
        data: {
          pool: { ...pool, words: orderedWords },
          missingWordIds: missingWordIds.length > 0 ? missingWordIds : undefined,
          actualWordCount: orderedWords.length,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        pool: { ...pool, words: [] },
        actualWordCount: 0,
      },
    });
  } catch (error) {
    return routeErrorResponse(error, 'fetch');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { poolId } = await params;
    const updates = await request.json();

    if (updates.name !== undefined && updates.name.length > 100) {
      return NextResponse.json({ success: false, error: 'Name must be less than 100 characters' }, { status: 400 });
    }

    if (updates.description !== undefined && updates.description.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Description must be less than 500 characters' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      'metadata.updatedAt': new Date(),
      'metadata.updatedBy': actor.uid,
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.name !== undefined) updateData.searchTokens = buildPoolSearchTokens(updates.name);
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.wordDocIds !== undefined) {
      updateData.wordDocIds = updates.wordDocIds;
      updateData['metadata.wordCount'] = updates.wordDocIds.length;
    }
    if (updates.tags !== undefined) {
      updateData['metadata.tags'] = updates.tags.map((tag: string) => tag.toLowerCase().trim()).filter(Boolean);
    }
    if (updates.difficulty !== undefined) {
      updateData['metadata.difficulty'] = updates.difficulty;
    }
    if (updates.metadata?.difficulty !== undefined) {
      updateData['metadata.difficulty'] = updates.metadata.difficulty;
    }

    const poolRef = adminDb.collection('vocabulary_pools').doc(poolId);
    await runVocabularyContentMutation(adminDb, async transaction => {
      const poolDoc = await transaction.get(poolRef);
      if (!poolDoc.exists) throw new Error('Pool not found');
      const existingWordIds = Array.isArray(poolDoc.data()?.wordDocIds) ? poolDoc.data()!.wordDocIds : [];
      const nextWordIds = updates.wordDocIds === undefined ? existingWordIds : updates.wordDocIds;
      const applyWordReferenceRevisions = await prepareVocabularyPoolWordMembership(
        transaction,
        adminDb,
        existingWordIds,
        nextWordIds
      );
      applyWordReferenceRevisions();
      transaction.update(poolRef, updateData as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
    });

    const updatedDoc = await poolRef.get();
    const poolData = updatedDoc.data()!;

    return NextResponse.json({
      success: true,
      data: {
        pool: {
          id: poolId,
          name: poolData.name,
          description: poolData.description,
          wordDocIds: poolData.wordDocIds || [],
          searchTokens: poolData.searchTokens || buildPoolSearchTokens(poolData.name || ''),
          metadata: {
            ...serializePoolMetadata(poolData.metadata),
          },
        },
      },
    });
  } catch (error) {
    return routeErrorResponse(error, 'update');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { poolId } = await params;
    const body = await request.json().catch(() => ({}));
    const confirmationToken =
      body && typeof body === 'object' ? (body as Record<string, unknown>).confirmationToken : undefined;
    if (typeof confirmationToken !== 'string' || !confirmationToken) {
      throw new VocabularyPoolDeletionError(
        'Review the current assignments before deleting this pool.',
        400,
        'VOCABULARY_POOL_CONFIRMATION_REQUIRED'
      );
    }

    const usageScan = await scanVocabularyPoolUsages(adminDb);
    if (usageScan.status !== 'available') {
      throw new VocabularyPoolDeletionError(
        'Assignment checks are unavailable. The pool was not deleted.',
        409,
        'VOCABULARY_POOL_USAGE_UNAVAILABLE'
      );
    }
    const currentUsages = poolUsagesForScan(usageScan, poolId);
    if (currentUsages.length > 0) {
      throw new VocabularyPoolDeletionError(
        `Remove this pool from ${currentUsages.length} saved ${currentUsages.length === 1 ? 'assignment' : 'assignments'} before deleting it.`,
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
    const contentStateRef = adminDb.collection(VOCABULARY_CONTENT_STATE_COLLECTION).doc(VOCABULARY_CONTENT_STATE_ID);
    const [poolSnapshot, challengeSnapshot, contentStateSnapshot] = await Promise.all([
      poolRef.get(),
      challengeRef.get(),
      contentStateRef.get(),
    ]);
    if (!poolSnapshot.exists) {
      if (challengeSnapshot.exists) await challengeRef.delete();
      throw new VocabularyPoolDeletionError('Pool not found', 404, 'VOCABULARY_POOL_NOT_FOUND');
    }

    const poolData = poolSnapshot.data() ?? {};
    const poolFingerprint = vocabularyPoolContentFingerprint(poolData);
    const wordContentRevision = vocabularyContentRevision(contentStateSnapshot.data());
    const initialChallengeError = validateVocabularyPoolDeletionChallenge({
      stored: challengeSnapshot.data(),
      token: confirmationToken,
      actorUid: actor.uid,
      poolId,
      usageFingerprint,
      poolFingerprint,
      wordContentRevision,
    });
    if (initialChallengeError) {
      if (challengeSnapshot.exists) await challengeRef.delete();
      throw initialChallengeError;
    }

    const archiveId = challengeSnapshot.data()?.archiveId;
    if (typeof archiveId !== 'string' || !archiveId) {
      await challengeRef.delete();
      throw new VocabularyPoolDeletionError(
        'Deletion confirmation is invalid. Review the current assignments and try again.',
        409,
        'VOCABULARY_POOL_CONFIRMATION_STALE'
      );
    }
    let transactionError: VocabularyPoolDeletionError | null = null;
    await runVocabularyContentExclusiveMutation(adminDb, async lockOwnerId => {
      const archiveRef = adminDb.collection(VOCABULARY_POOL_ARCHIVE_COLLECTION).doc(archiveId);
      const [lockedPool, lockedChallenge, lockedTombstone, lockedArchive, lockedContentState] = await Promise.all([
        poolRef.get(),
        challengeRef.get(),
        tombstoneRef.get(),
        archiveRef.get(),
        contentStateRef.get(),
      ]);
      if (!lockedPool.exists) {
        throw new VocabularyPoolDeletionError('Pool not found', 404, 'VOCABULARY_POOL_NOT_FOUND');
      }
      if (lockedTombstone.exists || lockedArchive.exists) {
        throw new VocabularyPoolDeletionError(
          'An immutable archive already exists for this pool.',
          409,
          'VOCABULARY_POOL_ARCHIVE_EXISTS'
        );
      }
      const lockedChallengeError = validateVocabularyPoolDeletionChallenge({
        stored: lockedChallenge.data(),
        token: confirmationToken,
        actorUid: actor.uid,
        poolId,
        usageFingerprint,
        poolFingerprint: vocabularyPoolContentFingerprint(lockedPool.data() ?? {}),
        wordContentRevision: vocabularyContentRevision(lockedContentState.data()),
      });
      if (lockedChallengeError) throw lockedChallengeError;
      const archivedWordCount = await writeVocabularyPoolWordArchive(adminDb, archiveId, lockedPool.data() ?? {});
      await runVocabularyContentMutation(
        adminDb,
        async transaction => {
          const [poolDoc, currentChallenge, tombstone, existingArchive, contentState] = await transaction.getAll(
            poolRef,
            challengeRef,
            tombstoneRef,
            archiveRef,
            contentStateRef
          );
          if (!poolDoc.exists) {
            transactionError = new VocabularyPoolDeletionError('Pool not found', 404, 'VOCABULARY_POOL_NOT_FOUND');
          } else if (tombstone.exists || existingArchive.exists) {
            transactionError = new VocabularyPoolDeletionError(
              'An immutable archive already exists for this pool.',
              409,
              'VOCABULARY_POOL_ARCHIVE_EXISTS'
            );
          } else {
            transactionError = validateVocabularyPoolDeletionChallenge({
              stored: currentChallenge.data(),
              token: confirmationToken,
              actorUid: actor.uid,
              poolId,
              usageFingerprint,
              poolFingerprint: vocabularyPoolContentFingerprint(poolDoc.data() ?? {}),
              wordContentRevision: vocabularyContentRevision(contentState.data()),
            });
          }

          if (transactionError) {
            if (currentChallenge.exists) transaction.delete(challengeRef);
            return;
          }

          transaction.create(archiveRef, {
            ...(poolDoc.data() ?? {}),
            _archive: {
              poolId,
              deletedAt: new Date(),
              deletedBy: actor.uid,
              sourceCollection: VOCABULARY_POOL_COLLECTION,
              archivedWordCount,
            },
          });
          transaction.create(tombstoneRef, {
            archiveId,
            deletedAt: new Date(),
            deletedBy: actor.uid,
          });
          transaction.delete(poolRef);
          transaction.delete(challengeRef);
        },
        { lockOwnerId }
      );
    });
    if (transactionError) throw transactionError;

    console.log(`Vocabulary pool ${poolId} archived and deleted successfully by admin ${actor.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Pool deleted successfully',
    });
  } catch (error) {
    return routeErrorResponse(error, 'delete');
  }
}
