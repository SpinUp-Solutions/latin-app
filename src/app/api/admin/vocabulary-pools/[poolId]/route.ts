import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { Word } from '@/src/types/admin-vocabulary';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { buildPoolSearchTokens } from '@/src/utils/vocabularyPoolSummary';

export const dynamic = 'force-dynamic';

const serializePoolMetadata = (metadata: FirebaseFirestore.DocumentData) => ({
  ...metadata,
  createdAt: metadata.createdAt?.toDate ? metadata.createdAt.toDate() : metadata.createdAt,
  updatedAt: metadata.updatedAt?.toDate ? metadata.updatedAt.toDate() : metadata.updatedAt,
});

export async function GET(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  try {
    const { poolId } = params;

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

      if (missingWordIds.length > 0) {
        // Fire-and-forget cleanup - don't block the response
        adminDb
          .collection('vocabulary_pools')
          .doc(poolId)
          .update({
            wordDocIds: orderedWords.map(w => w.id),
            'metadata.wordCount': orderedWords.length,
            'metadata.updatedAt': new Date(),
          })
          .catch(err => console.error('Auto-cleanup of dangling word references failed:', err));
      }

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
    console.error('Error fetching vocabulary pool:', error);
    const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: statusCode }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  try {
    const { poolId } = params;
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
      'metadata.updatedBy': 'admin',
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
    await poolRef.update(updateData);

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
    console.error('Error updating vocabulary pool:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  try {
    const { poolId } = params;

    const lessonsQuery = await adminDb.collection('lessons').where('vocabulary_pool', '==', poolId).limit(1).get();

    if (!lessonsQuery.empty) {
      const lessonData = lessonsQuery.docs[0].data();
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete pool that is assigned to lessons. Found in lesson: ${lessonData.title}`,
        },
        { status: 400 }
      );
    }

    await adminDb.runTransaction(async transaction => {
      const poolRef = adminDb.collection('vocabulary_pools').doc(poolId);
      const poolDoc = await transaction.get(poolRef);
      if (!poolDoc.exists) {
        throw new Error('Pool not found');
      }
      transaction.delete(poolRef);
    });

    console.log(`Vocabulary pool ${poolId} deleted successfully`);

    return NextResponse.json({
      success: true,
      message: 'Pool deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting vocabulary pool:', error);
    const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: statusCode }
    );
  }
}
