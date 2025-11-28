import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';

interface POSSummaryResponse {
  success: boolean;
  data: {
    summary: Record<PartOfSpeech, number>;
    totalWords: number;
    poolId: string;
  };
}

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { poolId: string } }
): Promise<NextResponse<POSSummaryResponse>> {
  try {
    const { poolId } = params;

    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();

    if (!poolDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          data: {
            summary: {} as Record<PartOfSpeech, number>,
            totalWords: 0,
            poolId,
          },
        },
        { status: 404 }
      );
    }

    const poolData = poolDoc.data();
    const wordDocIds = (poolData?.wordDocIds || []) as string[];

    if (wordDocIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          summary: {} as Record<PartOfSpeech, number>,
          totalWords: 0,
          poolId,
        },
      });
    }

    const batches = [];
    for (let i = 0; i < wordDocIds.length; i += 10) {
      const chunk = wordDocIds.slice(i, i + 10);
      const batchQuery = adminDb
        .collection('vocabulary_words_v4')
        .where('__name__', 'in', chunk)
        .select('part_of_speech');
      batches.push(batchQuery.get());
    }

    const batchResults = await Promise.all(batches);
    const allDocs = batchResults.flatMap(result => result.docs);

    const summary: Record<string, number> = {};
    let totalWords = 0;

    allDocs.forEach(doc => {
      const data = doc.data();
      const pos = data.part_of_speech as string;
      if (pos) {
        summary[pos] = (summary[pos] || 0) + 1;
        totalWords++;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        summary: summary as Record<PartOfSpeech, number>,
        totalWords,
        poolId,
      },
    });
  } catch (error) {
    console.error('Error fetching POS summary:', error);
    return NextResponse.json(
      {
        success: false,
        data: {
          summary: {} as Record<PartOfSpeech, number>,
          totalWords: 0,
          poolId: params.poolId,
        },
      },
      { status: 500 }
    );
  }
}
