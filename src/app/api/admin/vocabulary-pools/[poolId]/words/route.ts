import {
  updateLinkedPoolMembership,
  resolveVocabularyPool,
  assertPoolDocumentSize,
} from '@/src/lib/vocabulary-pools/linked-pools.server';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import type { VocabularyPool, AddWordsRequest } from '@/src/types/vocabulary-pool';
import { VOCABULARY_POOL_COLLECTION } from '@/shared/constants/firestore';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { MAX_VOCABULARY_POOL_WORD_ADDITIONS } from '@/src/lib/vocabulary-pools/limits';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { VocabularyPoolWordMembershipError } from '@/src/lib/vocabulary-pools/word-membership.server';
import {
  isVocabularyPoolCreationPending,
  VocabularyPoolStateError,
} from '@/src/lib/vocabulary-pools/pool-state.server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { poolId } = await params;
    const { wordDocIds }: AddWordsRequest = await request.json();

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

    const poolRef = adminDb.collection(VOCABULARY_POOL_COLLECTION).doc(poolId);
    const requestedIds = [...new Set(wordDocIds)];

    if (requestedIds.length > MAX_VOCABULARY_POOL_WORD_ADDITIONS)
      return NextResponse.json(
        { success: false, error: `Add at most ${MAX_VOCABULARY_POOL_WORD_ADDITIONS} words at once` },
        { status: 400 }
      );
    const result = await updateLinkedPoolMembership(
      adminDb,
      poolId,
      {
        'metadata.updatedAt': new Date(),
        'metadata.updatedBy': actor.uid,
      },
      { addWordDocIds: requestedIds }
    );

    const updatedPoolDoc = await poolRef.get();
    const updatedPoolData = updatedPoolDoc.exists
      ? await resolveVocabularyPool(adminDb, poolId, updatedPoolDoc.data()!)
      : undefined;

    if (!updatedPoolData) {
      return NextResponse.json({ success: false, error: 'Pool data not found' }, { status: 404 });
    }
    const {
      _copyRequest: _privateCopyRequest,
      _creationPending: _pendingCreation,
      ...publicPoolData
    } = updatedPoolData;

    return NextResponse.json({
      success: true,
      data: {
        addedCount: result.addedCount,
        duplicateCount: result.duplicateCount,
        invalidIds: result.invalidIds,
        pool: {
          id: poolId,
          ...publicPoolData,
          metadata: {
            ...updatedPoolData.metadata,
            createdAt: updatedPoolData.metadata.createdAt?.toDate?.() ?? updatedPoolData.metadata.createdAt,
            updatedAt: updatedPoolData.metadata.updatedAt?.toDate?.() ?? updatedPoolData.metadata.updatedAt,
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
    if (error instanceof VocabularyPoolStateError) {
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

    const poolRef = adminDb.collection(VOCABULARY_POOL_COLLECTION).doc(poolId);

    const removedCount = await runVocabularyContentMutation(adminDb, async transaction => {
      const poolDoc = await transaction.get(poolRef);
      if (!poolDoc.exists) {
        throw new Error('Pool not found');
      }
      if (isVocabularyPoolCreationPending(poolDoc.data())) {
        throw new VocabularyPoolStateError(
          'Vocabulary pool creation is still in progress. Try again when it finishes.',
          'VOCABULARY_POOL_PENDING'
        );
      }

      const poolData = poolDoc.data() as VocabularyPool;
      const currentWordIds = poolData.wordDocIds || [];
      const effective = await resolveVocabularyPool(adminDb, poolId, poolDoc.data()!, transaction);
      if ((effective.inheritedWordDocIds ?? []).some((id: string) => wordDocIds.includes(id)))
        throw new VocabularyPoolStateError(
          'Inherited words must be removed in their source pool.',
          'VOCABULARY_POOL_INHERITED_WORD'
        );
      const updatedWordIds = currentWordIds.filter(id => !wordDocIds.includes(id));
      const removed = currentWordIds.length - updatedWordIds.length;

      assertPoolDocumentSize({ ...poolData, wordDocIds: updatedWordIds });
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
    const updatedPoolData = updatedPoolDoc.exists
      ? await resolveVocabularyPool(adminDb, poolId, updatedPoolDoc.data()!)
      : undefined;

    if (!updatedPoolData) {
      return NextResponse.json({ success: false, error: 'Pool data not found' }, { status: 404 });
    }
    const {
      _copyRequest: _privateCopyRequest,
      _creationPending: _pendingCreation,
      ...publicPoolData
    } = updatedPoolData;

    return NextResponse.json({
      success: true,
      data: {
        removedCount,
        pool: {
          id: poolId,
          ...publicPoolData,
          metadata: {
            ...updatedPoolData.metadata,
            createdAt: updatedPoolData.metadata.createdAt?.toDate?.() ?? updatedPoolData.metadata.createdAt,
            updatedAt: updatedPoolData.metadata.updatedAt?.toDate?.() ?? updatedPoolData.metadata.updatedAt,
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof VocabularyPoolStateError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Error removing words from pool:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
