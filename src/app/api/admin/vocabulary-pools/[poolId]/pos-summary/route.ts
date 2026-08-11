import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  let poolId = '';
  try {
    await verifyAdminAccess(request);
    ({ poolId } = await params);
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
        .collection(VOCABULARY_WORDS_COLLECTION)
        .where(FieldPath.documentId(), 'in', chunk)
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
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error fetching POS summary:', error);
    return NextResponse.json(
      {
        success: false,
        data: {
          summary: {} as Record<PartOfSpeech, number>,
          totalWords: 0,
          poolId,
        },
      },
      { status: 500 }
    );
  }
}
