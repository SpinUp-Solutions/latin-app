import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query } from 'firebase-admin/firestore';
import type { VocabularyPool, CreatePoolRequest } from '@/src/types/vocabulary-pool';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const lastPoolId = searchParams.get('lastPoolId');
    const search = searchParams.get('search');
    const difficulty = searchParams.get('difficulty');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);
    const isActiveParam = searchParams.get('isActive');
    const isActive = isActiveParam ? isActiveParam === 'true' : null;

    console.log('Fetching pools with filters:', { limit, lastPoolId, search, difficulty, tags, isActive });

    let query: Query = adminDb.collection('vocabulary_pools').orderBy('metadata.createdAt', 'desc');

    // Apply filters
    if (difficulty) {
      query = query.where('metadata.difficulty', '==', difficulty);
    }

    if (isActive !== null) {
      query = query.where('metadata.isActive', '==', isActive);
    }

    if (tags && tags.length > 0) {
      // Note: Firestore array-contains can only filter by one tag at a time
      // For multiple tags, we'd need to filter on the client side or use array-contains-any
      query = query.where('metadata.tags', 'array-contains-any', tags);
    }

    // Apply search if provided (simplified - searches in name only)
    if (search) {
      query = query.where('name', '>=', search).where('name', '<=', search + '\uf8ff');
    }

    // Apply cursor-based pagination
    if (lastPoolId) {
      const lastDoc = await adminDb.collection('vocabulary_pools').doc(lastPoolId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    query = query.limit(limit);
    const snapshot = await query.get();

    const pools = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore Timestamps to Dates
      metadata: {
        ...doc.data().metadata,
        createdAt: doc.data().metadata.createdAt.toDate(),
        updatedAt: doc.data().metadata.updatedAt.toDate(),
      },
    })) as VocabularyPool[];

    const hasMore = snapshot.docs.length === limit;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        pools,
        total: pools.length,
        hasMore,
        lastPoolId: lastDoc?.id || null,
      },
    });
  } catch (error) {
    console.error('Error fetching vocabulary pools:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { name, description, wordDocIds = [], difficulty, tags = [] }: CreatePoolRequest = await request.json();

    // Validation
    if (!name?.trim() || !description?.trim()) {
      return NextResponse.json({ success: false, error: 'Name and description are required' }, { status: 400 });
    }

    if (name.length > 100) {
      return NextResponse.json({ success: false, error: 'Name must be less than 100 characters' }, { status: 400 });
    }

    if (description.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Description must be less than 500 characters' },
        { status: 400 }
      );
    }

    // Validate word document IDs exist (if provided)
    if (wordDocIds.length > 0) {
      const validationPromises = wordDocIds.map(async wordId => {
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

    const now = new Date();
    const poolData = {
      name: name.trim(),
      description: description.trim(),
      wordDocIds,
      metadata: {
        createdAt: now,
        createdBy: 'admin',
        updatedAt: now,
        updatedBy: 'admin',
        wordCount: wordDocIds.length,
        isActive: true,
        tags: tags.map(tag => tag.toLowerCase().trim()).filter(Boolean),
        difficulty: difficulty || 'beginner',
      },
    };

    const docRef = await adminDb.collection('vocabulary_pools').add(poolData);

    console.log(`Vocabulary pool "${name}" created successfully`);

    return NextResponse.json({
      success: true,
      data: {
        pool: {
          id: docRef.id,
          ...poolData,
        },
      },
    });
  } catch (error) {
    console.error('Error creating vocabulary pool:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
