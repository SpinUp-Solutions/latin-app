import type { NextRequest } from 'next/server';
import { handleVocabularyWordsGET } from '@/src/app/api/admin/words/route';

export const dynamic = 'force-dynamic';

/** Authenticated, exercise-only vocabulary projection for student lesson playback. */
export async function GET(request: NextRequest) {
  return handleVocabularyWordsGET(request, 'generated');
}
