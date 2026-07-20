import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { Lesson, UserProgress } from '@/src/types/lesson';
import {
  getMissingExercises,
  getRequiredExercises,
  isStoredLessonComplete,
  normalizeExerciseProgress,
  PROGRESS_SCHEMA_VERSION,
} from '@/src/utils/lessonProgress';

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

    const lessonRef = adminDb.collection('lessons').doc(lessonId);
    const progressRef = adminDb.collection('userProgress').doc(`${userId}_${lessonId}`);
    const now = new Date().toISOString();

    const result = await adminDb.runTransaction(async transaction => {
      const [lessonSnapshot, progressSnapshot] = await Promise.all([
        transaction.get(lessonRef),
        transaction.get(progressRef),
      ]);
      if (!lessonSnapshot.exists) return { kind: 'lesson-not-found' as const };
      if (!isLessonDocumentData(lessonSnapshot.data())) return { kind: 'lesson-not-found' as const };

      const lesson = { id: lessonSnapshot.id, ...lessonSnapshot.data() } as Lesson;
      const finalPage = lesson.pages.at(-1);
      if (!finalPage || finalPage.id !== finalPageId) return { kind: 'invalid-final-page' as const };

      const existing = (progressSnapshot.data() || {}) as Partial<UserProgress>;
      const exerciseProgress = normalizeExerciseProgress(lesson, existing.exerciseProgress);
      const alreadyCompleted = isStoredLessonComplete(existing, lesson.pages.length);
      const missingExercises = alreadyCompleted
        ? []
        : getMissingExercises(getRequiredExercises(lesson), exerciseProgress);

      if (missingExercises.length > 0) {
        return { kind: 'missing-exercises' as const, missingExercises };
      }

      const furthestPageIndex = lesson.pages.length - 1;
      transaction.set(
        progressRef,
        {
          ...existing,
          userId,
          lessonId,
          furthestPageIndex,
          currentPageIndex: furthestPageIndex,
          exerciseProgress,
          status: 'completed',
          completedAt: existing.completedAt || now,
          lastAccessedAt: now,
          updatedAt: now,
          progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
        },
        { merge: true }
      );

      return { kind: 'completed' as const, alreadyCompleted };
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

    return NextResponse.json({ success: true, lessonCompleted: true, alreadyCompleted: result.alreadyCompleted });
  } catch (error) {
    console.error('Error completing lesson:', error);
    return NextResponse.json({ error: 'Failed to complete lesson' }, { status: 500 });
  }
}
