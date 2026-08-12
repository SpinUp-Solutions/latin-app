import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import type { VocabularyPool, AddWordsRequest } from '@/src/types/vocabulary-pool';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { MAX_VOCABULARY_POOL_WORD_ADDITIONS } from '@/src/lib/vocabulary-pools/limits';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { VocabularyPoolWordMembershipError } from '@/src/lib/vocabulary-pools/word-membership.server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { poolId } = await params;
    const { wordDocIds, skipDuplicates = true }: AddWordsRequest = await request.json();

    if (!wordDocIds || !Array.isArray(wordDocIds) || wordDocIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'wordDocIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (wordDocIds.some(wordId => typeof wordId !== 'string' || !wordId.trim())) {
      return NextResponse.json(
        { success: false, error: 'Every wordDocId must be a non-empty string' },
        { status: 400 }
      );
    }

    const poolRef = adminDb.collection('vocabulary_pools').doc(poolId);
    const requestedIds = [...new Set(wordDocIds)];

    const result = await runVocabularyContentMutation(adminDb, async transaction => {
      const poolDoc = await transaction.get(poolRef);
      if (!poolDoc.exists) {
        throw new Error('Pool not found');
      }

      const poolData = poolDoc.data() as VocabularyPool;
      const currentWordIds = poolData.wordDocIds || [];
      const candidateIds = skipDuplicates ? requestedIds.filter(id => !currentWordIds.includes(id)) : requestedIds;
      if (candidateIds.length > MAX_VOCABULARY_POOL_WORD_ADDITIONS) {
        throw new Error(`Add at most ${MAX_VOCABULARY_POOL_WORD_ADDITIONS} new words to a pool at once`);
      }
      const wordRefs = candidateIds.map(wordId => adminDb.collection(VOCABULARY_WORDS_COLLECTION).doc(wordId));
      const wordDocs = wordRefs.length > 0 ? await transaction.getAll(...wordRefs) : [];
      const validIds = candidateIds.filter((_, index) => wordDocs[index].exists);
      const invalidIds = candidateIds.filter((_, index) => !wordDocs[index].exists);
      const deletingIds = candidateIds.filter((_, index) => Boolean(wordDocs[index].data()?._deletionPending));
      if (deletingIds.length > 0) {
        throw new VocabularyPoolWordMembershipError('Cannot assign vocabulary words pending deletion');
      }

      const newIds = validIds;
      const duplicateCount = skipDuplicates ? requestedIds.length - candidateIds.length : 0;
      const updatedWordIds = [...currentWordIds, ...newIds];

      for (const wordId of new Set(newIds)) {
        const index = candidateIds.indexOf(wordId);
        const wordDoc = wordDocs[index];
        const currentRevision = wordDoc.data()?._poolReferenceRevision;
        transaction.update(wordRefs[index], {
          _poolReferenceRevision: Number.isSafeInteger(currentRevision) ? Number(currentRevision) + 1 : 1,
        });
      }

      transaction.update(poolRef, {
        wordDocIds: updatedWordIds,
        'metadata.wordCount': updatedWordIds.length,
        'metadata.updatedAt': new Date(),
        'metadata.updatedBy': actor.uid,
      });

      return { newIds, duplicateCount, invalidIds };
    });

    console.log(`Successfully added ${result.newIds.length} words to pool ${poolId}`);

    const updatedPoolDoc = await poolRef.get();
    const updatedPoolData = updatedPoolDoc.data();

    if (!updatedPoolData) {
      return NextResponse.json({ success: false, error: 'Pool data not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        addedCount: result.newIds.length,
        duplicateCount: result.duplicateCount,
        invalidIds: result.invalidIds,
        pool: {
          id: poolId,
          ...updatedPoolData,
          metadata: {
            ...updatedPoolData.metadata,
            createdAt: updatedPoolData.metadata.createdAt.toDate(),
            updatedAt: updatedPoolData.metadata.updatedAt.toDate(),
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof VocabularyPoolWordMembershipError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Error adding words to pool:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { poolId } = await params;
    const { wordDocIds } = await request.json();

    if (!wordDocIds || !Array.isArray(wordDocIds) || wordDocIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'wordDocIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    const poolRef = adminDb.collection('vocabulary_pools').doc(poolId);

    const removedCount = await runVocabularyContentMutation(adminDb, async transaction => {
      const poolDoc = await transaction.get(poolRef);
      if (!poolDoc.exists) {
        throw new Error('Pool not found');
      }

      const poolData = poolDoc.data() as VocabularyPool;
      const currentWordIds = poolData.wordDocIds || [];
      const updatedWordIds = currentWordIds.filter(id => !wordDocIds.includes(id));
      const removed = currentWordIds.length - updatedWordIds.length;

      transaction.update(poolRef, {
        wordDocIds: updatedWordIds,
        'metadata.wordCount': updatedWordIds.length,
        'metadata.updatedAt': new Date(),
        'metadata.updatedBy': actor.uid,
      });

      return removed;
    });

    console.log(`Successfully removed ${removedCount} words from pool ${poolId}`);

    const updatedPoolDoc = await poolRef.get();
    const updatedPoolData = updatedPoolDoc.data();

    if (!updatedPoolData) {
      return NextResponse.json({ success: false, error: 'Pool data not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        removedCount,
        pool: {
          id: poolId,
          ...updatedPoolData,
          metadata: {
            ...updatedPoolData.metadata,
            createdAt: updatedPoolData.metadata.createdAt.toDate(),
            updatedAt: updatedPoolData.metadata.updatedAt.toDate(),
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error removing words from pool:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
