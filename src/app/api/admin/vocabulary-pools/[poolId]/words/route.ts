import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { VocabularyPool, AddWordsRequest } from '@/src/types/vocabulary-pool';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  try {
    const { poolId } = params;
    const { wordDocIds, skipDuplicates = true }: AddWordsRequest = await request.json();

    if (!wordDocIds || !Array.isArray(wordDocIds) || wordDocIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'wordDocIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Get current pool
    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 });
    }

    const poolData = poolDoc.data() as VocabularyPool;
    const currentWordIds = poolData.wordDocIds || [];

    const invalidIds: string[] = [];
    const validIds: string[] = [];

    console.log(`Validating ${wordDocIds.length} word IDs...`);

    for (let i = 0; i < wordDocIds.length; i += 10) {
      const batch = wordDocIds.slice(i, i + 10);
      const snapshot = await adminDb
        .collection(VOCABULARY_WORDS_COLLECTION)
        .where(FieldPath.documentId(), 'in', batch)
        .get();

      const foundIds = snapshot.docs.map(doc => doc.id);
      foundIds.forEach(id => validIds.push(id));

      const missingIds = batch.filter(id => !foundIds.includes(id));
      missingIds.forEach(id => invalidIds.push(id));
    }

    console.log(`Validation complete: ${validIds.length} valid, ${invalidIds.length} invalid`);

    // Handle duplicates
    const newIds = skipDuplicates ? validIds.filter(id => !currentWordIds.includes(id)) : validIds;

    const duplicateCount = validIds.length - newIds.length;

    console.log(
      `Adding ${newIds.length} new words to pool (${duplicateCount} duplicates ${skipDuplicates ? 'skipped' : 'included'})`
    );

    // Update pool
    const updatedWordIds = [...currentWordIds, ...newIds];

    await adminDb.collection('vocabulary_pools').doc(poolId).update({
      wordDocIds: updatedWordIds,
      'metadata.wordCount': updatedWordIds.length,
      'metadata.updatedAt': new Date(),
      'metadata.updatedBy': 'admin',
    });

    // Get updated pool data
    const updatedPoolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    const updatedPoolData = updatedPoolDoc.data();

    if (!updatedPoolData) {
      return NextResponse.json({ success: false, error: 'Pool data not found' }, { status: 404 });
    }

    console.log(`Successfully added ${newIds.length} words to pool ${poolId}`);

    return NextResponse.json({
      success: true,
      data: {
        addedCount: newIds.length,
        duplicateCount,
        invalidIds,
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
    console.error('Error adding words to pool:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  try {
    const { poolId } = params;
    const { wordDocIds } = await request.json();

    if (!wordDocIds || !Array.isArray(wordDocIds) || wordDocIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'wordDocIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Get current pool
    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 });
    }

    const poolData = poolDoc.data() as VocabularyPool;
    const currentWordIds = poolData.wordDocIds || [];

    // Remove specified words
    const updatedWordIds = currentWordIds.filter(id => !wordDocIds.includes(id));
    const removedCount = currentWordIds.length - updatedWordIds.length;

    console.log(`Removing ${removedCount} words from pool ${poolId}`);

    await adminDb.collection('vocabulary_pools').doc(poolId).update({
      wordDocIds: updatedWordIds,
      'metadata.wordCount': updatedWordIds.length,
      'metadata.updatedAt': new Date(),
      'metadata.updatedBy': 'admin',
    });

    // Get updated pool data
    const updatedPoolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    const updatedPoolData = updatedPoolDoc.data();

    if (!updatedPoolData) {
      return NextResponse.json({ success: false, error: 'Pool data not found' }, { status: 404 });
    }

    console.log(`Successfully removed ${removedCount} words from pool ${poolId}`);

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
    console.error('Error removing words from pool:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
