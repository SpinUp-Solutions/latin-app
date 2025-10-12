import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query } from 'firebase-admin/firestore';

type TimestampLike = {
  seconds?: number;
  nanoseconds?: number;
  _seconds?: number;
  _nanoseconds?: number;
  toDate?: () => Date;
};

const serializeTimestamp = (value: unknown) => {
  const ts = value as TimestampLike | undefined;
  if (!ts) return undefined;

  if (typeof ts.seconds === 'number' && typeof ts.nanoseconds === 'number') {
    return {
      seconds: ts.seconds,
      nanoseconds: ts.nanoseconds,
    };
  }

  if (typeof ts._seconds === 'number' && typeof ts._nanoseconds === 'number') {
    return {
      seconds: ts._seconds,
      nanoseconds: ts._nanoseconds,
    };
  }

  return undefined;
};

const serializeWord = (data: Record<string, unknown>) => {
  const serialized: Record<string, unknown> = { ...data };
  if ('createdAt' in serialized) {
    const createdAt = serializeTimestamp(serialized.createdAt);
    if (createdAt) serialized.createdAt = createdAt;
  }
  if ('updatedAt' in serialized) {
    const updatedAt = serializeTimestamp(serialized.updatedAt);
    if (updatedAt) serialized.updatedAt = updatedAt;
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

    console.log('Fetching words with filters:', { wordType, limit, lastWordId, search, countsOnly, collection });

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
    console.log('PUT /api/admin/words body', JSON.stringify(body));
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

    console.log('Updating word:', wordId, 'in collection:', collection);
    console.log('Updates data:', JSON.stringify(updates, null, 2));

    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    console.log('Final update data:', JSON.stringify(updateData, null, 2));

    await adminDb.collection(collection).doc(wordId).update(updateData);

    console.log(`Word ${wordId} updated successfully in ${collection}`);

    const updatedDoc = await adminDb.collection(collection).doc(wordId).get();
    const updatedData = {
      id: updatedDoc.id,
      ...serializeWord(updatedDoc.data() as Record<string, unknown>),
    };
    console.log('Updated document data with id:', JSON.stringify(updatedData, null, 2));

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
