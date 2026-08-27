import type { NextRequest } from 'next/server';
import { handleGeneratedExerciseWordsPOST } from '@/src/app/api/admin/exercises/generated-preview/route';

export const dynamic = 'force-dynamic';

/** Authenticated lesson-playback collection using the same engine as frozen tests and admin preview. */
export async function POST(request: NextRequest) {
  return handleGeneratedExerciseWordsPOST(request, 'generated');
}
