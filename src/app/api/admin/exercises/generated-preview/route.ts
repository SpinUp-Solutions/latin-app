import { NextRequest, NextResponse } from 'next/server';
import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { verifyAdminAccess, verifyAuthenticatedAccess } from '@/src/lib/verifyAdminAccess';
import { GeneratedExercisePreviewRequestSchema } from '@/src/lib/tests/generated-preview-schema';
import type { GeneratedExercise } from '@/src/lib/tests/generated-exercises';
import { collectWordsForGeneratedExerciseRequest } from '@/src/lib/tests/generated-word-loader.server';
import { GeneratedVocabularySourceError } from '@/src/lib/tests/generated-word-composition.server';
import { adminDb } from '@/src/services/firebase-admin';

export const dynamic = 'force-dynamic';

const routeErrorResponse = createRouteErrorResponse(GeneratedVocabularySourceError);

export async function handleGeneratedExerciseWordsPOST(
  request: NextRequest,
  audience: 'admin' | 'generated'
) {
  try {
    if (audience === 'admin') await verifyAdminAccess(request);
    else await verifyAuthenticatedAccess(request);

    const body = GeneratedExercisePreviewRequestSchema.parse(await request.json().catch(() => null));
    const result = await collectWordsForGeneratedExerciseRequest(adminDb, body as unknown as GeneratedExercise);

    return NextResponse.json({
      words: result.words,
      diagnostics: result.diagnostics,
      requestedCount: result.requestedCount,
      collected: result.words.length,
      globalScanLimitReached: result.globalScanLimitReached,
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      audience === 'admin' ? 'preview generated exercise' : 'collect generated exercise words'
    );
  }
}

export async function POST(request: NextRequest) {
  return handleGeneratedExerciseWordsPOST(request, 'admin');
}
