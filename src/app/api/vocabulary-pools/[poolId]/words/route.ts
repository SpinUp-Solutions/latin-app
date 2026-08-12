import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import type { Word } from '@/src/types/admin-vocabulary';
import { AdminAccessError, verifyAuthenticatedAccess } from '@/src/lib/verifyAdminAccess';
import { getReadableVocabularyPool, loadVocabularyPoolWords } from '@/src/lib/vocabulary-pools/archive.server';
import { toVocabularyPoolStudyItems } from '@/src/utils/vocabularyPoolStudy';

export const dynamic = 'force-dynamic';
const MAX_STUDY_POOL_WORDS = 200;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    await verifyAuthenticatedAccess(request);
    const { poolId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const rawLimit = searchParams.get('limit') ?? String(MAX_STUDY_POOL_WORDS);
    const rawOffset = searchParams.get('offset') ?? '0';
    if (!/^\d+$/.test(rawLimit) || !/^\d+$/.test(rawOffset)) {
      return NextResponse.json({ success: false, error: 'Invalid pagination parameters' }, { status: 400 });
    }
    const limit = Number(rawLimit);
    const offset = Number(rawOffset);
    if (limit < 1 || limit > MAX_STUDY_POOL_WORDS) {
      return NextResponse.json(
        { success: false, error: `Page size must be between 1 and ${MAX_STUDY_POOL_WORDS}` },
        { status: 400 }
      );
    }
    const pool = await getReadableVocabularyPool(adminDb, poolId);
    if (!pool) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 });
    }

    const poolWordIds = Array.isArray(pool.data.wordDocIds)
      ? pool.data.wordDocIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
      : [];
    const pageWordIds = poolWordIds.slice(offset, offset + limit);
    const words = (await loadVocabularyPoolWords(pool, pageWordIds)).map(document => {
      const data = document.data();
      return { id: document.id, ...data, wordType: data.part_of_speech } as Word;
    });

    return NextResponse.json({
      success: true,
      data: {
        id: poolId,
        name: typeof pool.data.name === 'string' && pool.data.name.trim() ? pool.data.name : 'Vocabulary Pool',
        items: toVocabularyPoolStudyItems(words),
        totalCount: poolWordIds.length,
        hasMore: offset + pageWordIds.length < poolWordIds.length,
        nextOffset: offset + pageWordIds.length,
      },
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error fetching vocabulary pool words:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
