import { NextRequest, NextResponse } from 'next/server';
import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import {
  GeneratedExercisePlaybackRequestSchema,
  GeneratedExercisePreviewRequestSchema,
} from '@/src/lib/tests/generated-preview-schema';
import type { GeneratedExercise } from '@/src/lib/tests/generated-exercises';
import { collectWordsForGeneratedExerciseRequest } from '@/src/lib/tests/generated-word-loader.server';
import { GeneratedVocabularySourceError } from '@/src/lib/tests/generated-word-composition.server';
import { studentDashboardService } from '@/src/lib/learning-units/student-dashboard-service';
import { adminDb } from '@/src/services/firebase-admin';

export const dynamic = 'force-dynamic';

const routeErrorResponse = createRouteErrorResponse(GeneratedVocabularySourceError);

export async function handleGeneratedExerciseWordsPOST(request: NextRequest, audience: 'admin' | 'generated') {
  try {
    let exercise: GeneratedExercise;

    if (audience === 'admin') {
      await verifyAdminAccess(request);
      const requestBody = await request.json().catch(() => null);
      exercise = GeneratedExercisePreviewRequestSchema.parse(requestBody) as unknown as GeneratedExercise;
    } else {
      const student = await verifyRequestAuth(request);
      if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const requestBody = await request.json().catch(() => null);
      const source = GeneratedExercisePlaybackRequestSchema.parse(requestBody);
      const lesson = await studentDashboardService.getLesson(student.uid, source.lessonId);
      const item = lesson.pages[source.pageIndex]?.items[source.itemIndex];
      if (
        !item ||
        item.id !== source.exerciseId ||
        (item.type !== 'generated-translation' && item.type !== 'generated-form-identification')
      ) {
        throw new GeneratedVocabularySourceError(
          'Generated exercise was not found in the authorized lesson',
          404,
          'GENERATED_EXERCISE_NOT_FOUND'
        );
      }

      const parsedExercise = GeneratedExercisePreviewRequestSchema.safeParse(item);
      if (!parsedExercise.success) {
        throw new GeneratedVocabularySourceError(
          'Generated exercise contains invalid persisted data',
          409,
          'INVALID_GENERATED_EXERCISE'
        );
      }
      exercise = parsedExercise.data as unknown as GeneratedExercise;
    }

    const result = await collectWordsForGeneratedExerciseRequest(adminDb, exercise);

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
