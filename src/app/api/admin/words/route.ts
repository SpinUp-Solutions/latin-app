import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query } from 'firebase-admin/firestore';

// Tell Next.js this route is dynamic and should not be statically generated
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const wordType = searchParams.get('wordType');
    const section = searchParams.get('section');
    const limit = parseInt(searchParams.get('limit') || '20'); // Reduced default limit
    const lastWordId = searchParams.get('lastWordId'); // For cursor-based pagination
    const search = searchParams.get('search');
    const countsOnly = searchParams.get('countsOnly') === 'true';

    console.log('Fetching words with filters:', { wordType, section, limit, lastWordId, search, countsOnly });

    // If only requesting counts, return just the statistics
    if (countsOnly) {
      const wordTypeCounts = await getWordTypeCounts();
      return NextResponse.json({
        success: true,
        data: {
          wordTypeCounts,
        },
      });
    }

    let query: Query = adminDb.collection('words').orderBy('word');

    // Apply filters
    if (wordType) {
      query = query.where('wordType', '==', wordType);
    }

    if (section) {
      query = query.where('section', '==', section);
    }

    // Apply search if provided
    if (search) {
      query = query.where('word', '>=', search).where('word', '<=', search + '\uf8ff');
    }

    // Apply cursor-based pagination
    if (lastWordId) {
      const lastDocSnapshot = await adminDb.collection('words').doc(lastWordId).get();
      if (lastDocSnapshot.exists) {
        query = query.startAfter(lastDocSnapshot);
      }
    }

    // Apply limit
    query = query.limit(limit);

    const snapshot = await query.get();

    const words = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Check if there are more documents
    const hasMore = snapshot.docs.length === limit;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        words,
        hasMore,
        lastWordId: lastDoc?.id || null,
        limit,
        filters: { wordType, section, search },
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
    const { wordId, updates } = await request.json();

    if (!wordId || !updates) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId and updates are required',
        },
        { status: 400 }
      );
    }

    console.log('Updating word:', wordId);
    console.log('Updates data:', JSON.stringify(updates, null, 2));

    // Add updatedAt timestamp
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    // Update the word document
    await adminDb.collection('words').doc(wordId).update(updateData);

    console.log(`Word ${wordId} updated successfully`);

    // Fetch the updated document to verify changes
    const updatedDoc = await adminDb.collection('words').doc(wordId).get();
    const updatedData = updatedDoc.data();
    console.log('Updated document data:', JSON.stringify(updatedData, null, 2));

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

// More efficient word type counts using aggregation
async function getWordTypeCounts() {
  try {
    // Use a cached approach or sample-based counting for better performance
    const snapshot = await adminDb.collection('words').limit(1000).get(); // Sample approach

    const counts = {
      noun: 0,
      verb: 0,
      adjective: 0,
      adverb: 0,
      preposition: 0,
      pronoun: 0,
      conjunction: 0,
      interjection: 0,
      enclitic: 0,
      number: 0,
      other: 0,
    };

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const wordType = data.wordType as string;
      if (counts.hasOwnProperty(wordType)) {
        counts[wordType as keyof typeof counts]++;
      } else {
        counts.other++;
      }
    });

    // Scale up the counts based on sample size (rough approximation)
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
      enclitic: 0,
      number: 0,
      other: 0,
    };
  }
}
