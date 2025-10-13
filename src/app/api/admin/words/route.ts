import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query } from 'firebase-admin/firestore';

const serializeTimestamp = (value: unknown): string | undefined => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return undefined;
};

const serializeWord = (data: Record<string, unknown>) => {
  const serialized: Record<string, unknown> = { ...data };
  if ('createdAt' in serialized) {
    const createdAt = serializeTimestamp(serialized.createdAt);
    if (createdAt) {
      serialized.createdAt = createdAt;
    }
  }
  if ('updatedAt' in serialized) {
    const updatedAt = serializeTimestamp(serialized.updatedAt);
    if (updatedAt) {
      serialized.updatedAt = updatedAt;
    }
  }
  return serialized;
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const wordType = searchParams.get('wordType');
    const limit = parseInt(searchParams.get('limit') || '20');
    const lastWordId = searchParams.get('lastWordId');
    const search = searchParams.get('search');
    const countsOnly = searchParams.get('countsOnly') === 'true';
    const collection = searchParams.get('collection') || 'vocabulary_words_v2';

    if (countsOnly) {
      const wordTypeCounts = await getWordTypeCounts(collection);
      return NextResponse.json({
        success: true,
        data: {
          wordTypeCounts,
        },
      });
    }

    let query: Query = adminDb.collection(collection).orderBy('word');

    if (wordType) {
      query = query.where('part_of_speech', '==', wordType);
    }

    if (search) {
      query = query.where('word', '>=', search).where('word', '<=', search + '\uf8ff');
    }

    if (lastWordId) {
      const lastDocSnapshot = await adminDb.collection(collection).doc(lastWordId).get();
      if (lastDocSnapshot.exists) {
        query = query.startAfter(lastDocSnapshot);
      }
    }

    query = query.limit(limit);

    const snapshot = await query.get();

    const words = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...serializeWord(data as Record<string, unknown>),
      };
    });

    const hasMore = snapshot.docs.length === limit;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        words,
        hasMore,
        lastWordId: lastDoc?.id || null,
        limit,
        filters: { wordType, search },
        collection,
      },
    });
  } catch (error) {
    console.error('Error fetching words:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { wordId, updates, collection = 'vocabulary_words_v2' } = body;

    if (!wordId || !updates) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId and updates are required',
        },
        { status: 400 }
      );
    }

    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    await adminDb.collection(collection).doc(wordId).update(updateData);

    const updatedDoc = await adminDb.collection(collection).doc(wordId).get();
    const updatedData = {
      id: updatedDoc.id,
      ...serializeWord(updatedDoc.data() as Record<string, unknown>),
    };

    return NextResponse.json({
      success: true,
      message: 'Word updated successfully',
      updatedData: updatedData,
    });
  } catch (error) {
    console.error('Error updating word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

async function getWordTypeCounts(collection: string) {
  try {
    const snapshot = await adminDb.collection(collection).limit(1000).get();

    const counts = {
      noun: 0,
      verb: 0,
      adjective: 0,
      adverb: 0,
      preposition: 0,
      pronoun: 0,
      conjunction: 0,
      interjection: 0,
      other: 0,
    };

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const partOfSpeech = data.part_of_speech as string;
      if (counts.hasOwnProperty(partOfSpeech)) {
        counts[partOfSpeech as keyof typeof counts]++;
      } else {
        counts.other++;
      }
    });

    const sampleSize = snapshot.docs.length;
    const scaleFactor = sampleSize < 1000 ? 1 : Math.ceil(sampleSize / 1000);

    Object.keys(counts).forEach(key => {
      counts[key as keyof typeof counts] *= scaleFactor;
    });

    return counts;
  } catch (error) {
    console.error('Error getting word type counts:', error);
    return {
      noun: 0,
      verb: 0,
      adjective: 0,
      adverb: 0,
      preposition: 0,
      pronoun: 0,
      conjunction: 0,
      interjection: 0,
      other: 0,
    };
  }
}
