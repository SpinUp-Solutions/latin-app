import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { Word } from '@/src/types/admin-vocabulary';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

export const dynamic = 'force-dynamic';

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
        ...poolData.metadata,
        createdAt: poolData.metadata.createdAt.toDate(),
        updatedAt: poolData.metadata.updatedAt.toDate(),
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

    if (updates.name && updates.name.length > 100) {
      return NextResponse.json({ success: false, error: 'Name must be less than 100 characters' }, { status: 400 });
    }

    if (updates.description && updates.description.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Description must be less than 500 characters' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      ...updates,
      'metadata.updatedAt': new Date(),
      'metadata.updatedBy': 'admin',
    };

    // Update word count if wordDocIds is being updated
    if (updates.wordDocIds) {
      updateData['metadata.wordCount'] = updates.wordDocIds.length;
    }

    // Clean up tags if provided
    if (updates.tags) {
      updateData['metadata.tags'] = updates.tags.map((tag: string) => tag.toLowerCase().trim()).filter(Boolean);
    }

    if (updates.metadata) {
      if (updates.metadata.difficulty) {
        updateData['metadata.difficulty'] = updates.metadata.difficulty;
      }
      delete updateData.metadata;
    }

    if (updates.difficulty) {
      updateData['metadata.difficulty'] = updates.difficulty;
    }

    await adminDb.collection('vocabulary_pools').doc(poolId).update(updateData);

    console.log(`Vocabulary pool ${poolId} updated successfully`);

    return NextResponse.json({
      success: true,
      data: {
        pool: {
          id: poolId,
          ...updates,
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

    await adminDb.collection('vocabulary_pools').doc(poolId).delete();

    console.log(`Vocabulary pool ${poolId} deleted successfully`);

    return NextResponse.json({
      success: true,
      message: 'Pool deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting vocabulary pool:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
