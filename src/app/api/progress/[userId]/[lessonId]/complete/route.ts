import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { LEARNING_UNITS_COLLECTION, USER_PROGRESS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { getLessonProgressAccessInTransaction } from '@/src/lib/learning-units/progression-access';
import { Lesson, UserProgress } from '@/src/types/lesson';
import { isStoredLessonComplete, summarizeLessonCompletion, toPersistedProgressSummary } from '@/src/utils/lessonProgress';
import { reportServerUnexpectedError } from '@/src/lib/report-unexpected-error';

const finishRequestSchema = z.object({ finalPageId: z.string().min(1) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; lessonId: string }> }
) {
  try {
    const { userId, lessonId } = await params;
    const currentUser = await verifyRequestAuth(request);
    if (!currentUser || currentUser.uid !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsedRequest = finishRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsedRequest.success) {
      return NextResponse.json({ error: 'finalPageId is required' }, { status: 400 });
    }
    const { finalPageId } = parsedRequest.data;

    const lessonRef = adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId);
    const progressRef = adminDb.collection(USER_PROGRESS_COLLECTION).doc(`${userId}_${lessonId}`);
    const now = new Date().toISOString();

    const result = await adminDb.runTransaction(async transaction => {
      const [lessonSnapshot, progressSnapshot] = await Promise.all([
        transaction.get(lessonRef),
        transaction.get(progressRef),
      ]);
      if (!lessonSnapshot.exists) return { kind: 'lesson-not-found' as const };
      if (!isLessonDocumentData(lessonSnapshot.data())) return { kind: 'lesson-not-found' as const };

      const lesson = { id: lessonSnapshot.id, ...lessonSnapshot.data() } as Lesson;
      const access = await getLessonProgressAccessInTransaction(
        transaction,
        adminDb,
        lesson,
        userId,
        progressSnapshot.exists
      );
      if (access !== 'allowed') {
        throw Object.assign(new Error(access), {
          code: access === 'locked' ? 'LESSON_LOCKED' : 'LESSON_NOT_FOUND',
        });
      }
      const finalPage = lesson.pages.at(-1);
      if (!finalPage || finalPage.id !== finalPageId) return { kind: 'invalid-final-page' as const };

      const existing = (progressSnapshot.data() || {}) as Partial<UserProgress>;
      const alreadyCompleted = isStoredLessonComplete(existing, lesson.pages.length);
      const furthestPageIndex = lesson.pages.length - 1;
      const summary = summarizeLessonCompletion(lesson, {
        ...existing,
        furthestPageIndex,
        currentPageIndex: furthestPageIndex,
      });
      const missingExercises = alreadyCompleted ? [] : summary.missingExercises;

      if (missingExercises.length > 0) {
        return { kind: 'missing-exercises' as const, missingExercises };
      }

      const persisted = toPersistedProgressSummary(
        { ...summary, isCompleted: true, progress: 100 },
        existing,
        now,
        lesson.version
      );

      transaction.set(
        progressRef,
        {
          ...existing,
          userId,
          lessonId,
          furthestPageIndex,
          currentPageIndex: furthestPageIndex,
          ...persisted,
          lastAccessedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        kind: 'completed' as const,
        alreadyCompleted,
        progress: persisted.progress,
        completedExerciseCount: persisted.completedExerciseCount,
        requiredExerciseCount: persisted.requiredExerciseCount,
      };
    });

    if (result.kind === 'lesson-not-found') {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }
    if (result.kind === 'invalid-final-page') {
      return NextResponse.json(
        { error: 'Finish the authored final page before completing this lesson.' },
        { status: 400 }
      );
    }
    if (result.kind === 'missing-exercises') {
      return NextResponse.json(
        {
          error: 'Complete all required exercises before finishing the lesson.',
          missingExercises: result.missingExercises,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      lessonCompleted: true,
      alreadyCompleted: result.alreadyCompleted,
      progress: result.progress,
      completedExerciseCount: result.completedExerciseCount,
      requiredExerciseCount: result.requiredExerciseCount,
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'LESSON_LOCKED' || error.code === 'LESSON_NOT_FOUND')
    ) {
      return NextResponse.json(
        { error: error.code === 'LESSON_LOCKED' ? 'Lesson is locked' : 'Lesson not found' },
        { status: error.code === 'LESSON_LOCKED' ? 403 : 404 }
      );
    }
    console.error('Error completing lesson:', error);
    reportServerUnexpectedError(error, {
      tags: { surface: 'finish_lesson' },
    });
    return NextResponse.json({ error: 'Failed to complete lesson' }, { status: 500 });
  }
}
