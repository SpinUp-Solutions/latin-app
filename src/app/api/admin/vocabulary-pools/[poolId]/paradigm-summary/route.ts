import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import type { FormParadigm } from '@/src/types/exercises/paradigm';
import { deriveParadigm } from '@/src/utils/paradigm';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

interface ParadigmSummaryResponse {
  success: boolean;
  data: {
    paradigmSummary: Partial<Record<FormParadigm, number>>;
    posSummary: Partial<Record<PartOfSpeech, number>>;
    totalWords: number;
    poolId: string;
  };
}

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { poolId: string } }
): Promise<NextResponse<ParadigmSummaryResponse>> {
  try {
    const { poolId } = params;

    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();

    if (!poolDoc.exists) {
      return NextResponse.json(
        {
          success: false,
          data: {
            paradigmSummary: {},
            posSummary: {},
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
          paradigmSummary: {},
          posSummary: {},
          totalWords: 0,
          poolId,
        },
      });
    }

    const batches = [];
    for (let i = 0; i < wordDocIds.length; i += 30) {
      const chunk = wordDocIds.slice(i, i + 30);
      const batchQuery = adminDb
        .collection(VOCABULARY_WORDS_COLLECTION)
        .where(FieldPath.documentId(), 'in', chunk)
        .select('part_of_speech', 'pronoun_type', 'person');
      batches.push(batchQuery.get());
    }

    const batchResults = await Promise.all(batches);
    const allDocs = batchResults.flatMap(result => result.docs);

    const paradigmSummary: Partial<Record<FormParadigm, number>> = {};
    const posSummary: Partial<Record<PartOfSpeech, number>> = {};
    let totalWords = 0;

    allDocs.forEach(doc => {
      const data = doc.data();
      const pos = data.part_of_speech as PartOfSpeech;

      if (pos) {
        posSummary[pos] = (posSummary[pos] || 0) + 1;

        const paradigm = deriveParadigm(pos, data.pronoun_type, data.person);
        if (paradigm) {
          paradigmSummary[paradigm] = (paradigmSummary[paradigm] || 0) + 1;
        }

        totalWords++;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        paradigmSummary,
        posSummary,
        totalWords,
        poolId,
      },
    });
  } catch (error) {
    console.error('Error fetching paradigm summary:', error);
    return NextResponse.json(
      {
        success: false,
        data: {
          paradigmSummary: {},
          posSummary: {},
          totalWords: 0,
          poolId: params.poolId,
        },
      },
      { status: 500 }
    );
  }
}
