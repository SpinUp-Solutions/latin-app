import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

async function findPoolsReferencingWord(wordId: string) {
  const poolsSnapshot = await adminDb
    .collection('vocabulary_pools')
    .where('wordDocIds', 'array-contains', wordId)
    .get();

  return poolsSnapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name as string,
  }));
}

export async function DELETE(request: NextRequest, { params }: { params: { wordId: string } }): Promise<NextResponse> {
  try {
    const { wordId } = params;
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get('collection') || VOCABULARY_WORDS_COLLECTION;
    const confirm = searchParams.get('confirm') === 'true';

    if (!wordId) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId is required',
        },
        { status: 400 }
      );
    }

    const referencedPools = await findPoolsReferencingWord(wordId);

    if (referencedPools.length > 0 && !confirm) {
      return NextResponse.json(
        {
          success: false,
          warning: true,
          referencedPools,
          message: `This word is referenced by ${referencedPools.length} vocabulary pool(s). Deleting it will remove it from those pools.`,
        },
        { status: 409 }
      );
    }

    if (referencedPools.length > 0 && confirm) {
      const batch = adminDb.batch();

      batch.delete(adminDb.collection(collection).doc(wordId));

      for (const pool of referencedPools) {
        const poolRef = adminDb.collection('vocabulary_pools').doc(pool.id);
        const poolDoc = await poolRef.get();
        const poolData = poolDoc.data();
        if (poolData) {
          const updatedWordIds = (poolData.wordDocIds || []).filter((id: string) => id !== wordId);
          batch.update(poolRef, {
            wordDocIds: updatedWordIds,
            'metadata.wordCount': updatedWordIds.length,
            'metadata.updatedAt': new Date(),
          });
        }
      }

      await batch.commit();

      return NextResponse.json({
        success: true,
        message: 'Word deleted and removed from referencing pools',
        cleanedPools: referencedPools.map(p => p.name),
      });
    }

    await adminDb.collection(collection).doc(wordId).delete();

    return NextResponse.json({
      success: true,
      message: 'Word deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
