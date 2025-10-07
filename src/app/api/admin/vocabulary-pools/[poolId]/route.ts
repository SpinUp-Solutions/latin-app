import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { Word } from '@/src/types/admin-vocabulary';

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
        batches.push(adminDb.collection('words').where(FieldPath.documentId(), 'in', batch).get());
      }

      const batchResults = await Promise.all(batches);
      batchResults.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          words.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          } as Word);
        });
      });

      const wordMap = new Map(words.map(word => [word.id, word]));
      const orderedWords = wordIds.map((id: string) => wordMap.get(id)).filter(Boolean);

      return NextResponse.json({
        success: true,
        data: {
          pool: { ...pool, words: orderedWords },
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        pool: { ...pool, words: [] },
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

    // Check if pool exists
    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 });
    }

    // Validate updates
    if (updates.name && updates.name.length > 100) {
      return NextResponse.json({ success: false, error: 'Name must be less than 100 characters' }, { status: 400 });
    }

    if (updates.description && updates.description.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Description must be less than 500 characters' },
        { status: 400 }
      );
    }

    // If updating wordDocIds, validate they exist
    if (updates.wordDocIds && Array.isArray(updates.wordDocIds)) {
      if (updates.wordDocIds.length > 0) {
        const validationPromises = updates.wordDocIds.map(async (wordId: string) => {
          const wordDoc = await adminDb.collection('words').doc(wordId).get();
          return { id: wordId, exists: wordDoc.exists };
        });

        const validationResults = await Promise.all(validationPromises);
        const invalidIds = validationResults.filter(result => !result.exists).map(result => result.id);

        if (invalidIds.length > 0) {
          return NextResponse.json(
            { success: false, error: `Invalid word IDs: ${invalidIds.join(', ')}` },
            { status: 400 }
          );
        }
      }
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

    await adminDb.collection('vocabulary_pools').doc(poolId).update(updateData);

    // Fetch updated document
    const updatedDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    const updatedData = updatedDoc.data();

    if (!updatedData) {
      return NextResponse.json({ success: false, error: 'Pool data not found' }, { status: 404 });
    }

    console.log(`Vocabulary pool ${poolId} updated successfully`);

    return NextResponse.json({
      success: true,
      data: {
        pool: {
          id: updatedDoc.id,
          ...updatedData,
          metadata: {
            ...updatedData.metadata,
            createdAt: updatedData.metadata.createdAt.toDate(),
            updatedAt: updatedData.metadata.updatedAt.toDate(),
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

    // Check if pool exists
    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 });
    }

    // Check if pool is used by any lessons
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
