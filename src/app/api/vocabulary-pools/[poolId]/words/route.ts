import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { VocabularyPool } from '@/src/types/vocabulary-pool';
import type { Word } from '@/src/types/admin-vocabulary';

const WORDS_COLLECTION = 'vocabulary_words_v4';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  try {
    const { poolId } = params;

    // Get pool data
    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 });
    }

    const poolData = poolDoc.data();
    if (!poolData) {
      return NextResponse.json({ success: false, error: 'Pool data not found' }, { status: 404 });
    }

    const pool = poolData as VocabularyPool;

    // If pool has no words, return empty array
    if (!pool.wordDocIds || pool.wordDocIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          words: [],
          poolName: pool.name,
        },
      });
    }

    const words: Word[] = [];
    const batches = [];

    for (let i = 0; i < pool.wordDocIds.length; i += 10) {
      const batch = pool.wordDocIds.slice(i, i + 10);
      batches.push(adminDb.collection(WORDS_COLLECTION).where(FieldPath.documentId(), 'in', batch).get());
    }

    const batchResults = await Promise.all(batches);
    batchResults.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        words.push({
          id: doc.id,
          ...data,
          wordType: data.part_of_speech,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        } as Word);
      });
    });

    // Sort words to match the original order in wordDocIds
    const wordMap = new Map(words.map(word => [word.id, word]));
    const orderedWords = pool.wordDocIds.map(id => wordMap.get(id)).filter(Boolean) as Word[];

    return NextResponse.json({
      success: true,
      data: {
        words: orderedWords,
        poolName: pool.name,
      },
    });
  } catch (error) {
    console.error('Error fetching vocabulary pool words:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
