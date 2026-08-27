import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { LEARNING_UNITS_COLLECTION, USER_PROGRESS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { getLessonProgressAccessInTransaction } from '@/src/lib/learning-units/progression-access';
import { Lesson, UserProgress } from '@/src/types/lesson';
import {
  getFurthestPageIndex,
  resolveExerciseId,
  summarizeLessonCompletion,
  toPersistedProgressSummary,
} from '@/src/utils/lessonProgress';
import { reportServerUnexpectedError } from '@/src/lib/report-unexpected-error';

const progressRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('complete-exercise'),
    exerciseId: z.string().min(1),
    score: z.number().finite().min(0).max(100),
  }),
  z
    .object({
      action: z.literal('visit-page'),
      pageId: z.string().min(1).optional(),
      currentPageIndex: z.number().int().optional(),
    })
    .refine(data => data.pageId !== undefined || data.currentPageIndex !== undefined),
  z.object({ action: z.literal('legacy-finish') }),
]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string; lessonId: string }> }) {
  try {
    const { userId, lessonId } = await params;
    const currentUser = await verifyRequestAuth(request);

    if (!currentUser || currentUser.uid !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const progressDoc = await adminDb.collection(USER_PROGRESS_COLLECTION).doc(`${userId}_${lessonId}`).get();
    return NextResponse.json(progressDoc.exists ? progressDoc.data() : null);
  } catch (error) {
    console.error('Error fetching user progress:', error);
    reportServerUnexpectedError(error, {
      tags: { surface: 'progress_get' },
    });
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
  }
}

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

    const rawProgressData: unknown = await request.json().catch(() => null);
    if (!rawProgressData || typeof rawProgressData !== 'object' || Array.isArray(rawProgressData)) {
      return NextResponse.json({ error: 'Invalid progress request' }, { status: 400 });
    }

    const rawRecord = rawProgressData as Record<string, unknown>;
    const action =
      rawRecord.action ??
      (typeof rawRecord.exerciseId === 'string' && typeof rawRecord.score === 'number'
        ? 'complete-exercise'
        : rawRecord.currentPageIndex !== undefined
          ? 'visit-page'
          : rawRecord.status === 'completed'
            ? 'legacy-finish'
            : null);
    const parsedProgressData = progressRequestSchema.safeParse({ ...rawRecord, action });
    if (!parsedProgressData.success) {
      return NextResponse.json({ error: 'Invalid progress request' }, { status: 400 });
    }

    const progressData = parsedProgressData.data;
    const lessonRef = adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId);
    const progressRef = adminDb.collection(USER_PROGRESS_COLLECTION).doc(`${userId}_${lessonId}`);
    const now = new Date().toISOString();

    if (progressData.action === 'complete-exercise') {
      const result = await adminDb.runTransaction(async transaction => {
        const [lessonSnapshot, progressSnapshot] = await Promise.all([
          transaction.get(lessonRef),
          transaction.get(progressRef),
        ]);
        if (!lessonSnapshot.exists) throw new Error('LESSON_NOT_FOUND');
        if (!isLessonDocumentData(lessonSnapshot.data())) throw new Error('LESSON_NOT_FOUND');

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
        const exerciseId = resolveExerciseId(lesson, progressData.exerciseId);
        if (!exerciseId) throw new Error('EXERCISE_NOT_FOUND');

        const existing = (progressSnapshot.data() || {}) as Partial<UserProgress>;
        const summary = summarizeLessonCompletion(lesson, {
          ...existing,
          exerciseProgress: [
            ...(Array.isArray(existing.exerciseProgress) ? existing.exerciseProgress : []),
            { exerciseId, completedAt: now, score: progressData.score },
          ],
        });
        const persisted = toPersistedProgressSummary(summary, existing, now);
        const furthestPageIndex = getFurthestPageIndex(existing, lesson.pages.length);

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
          lessonCompleted: persisted.status === 'completed',
          progress: persisted.progress,
          completedExerciseCount: persisted.completedExerciseCount,
          requiredExerciseCount: persisted.requiredExerciseCount,
        };
      });

      return NextResponse.json({ success: true, ...result });
    }

    if (progressData.action === 'visit-page') {
      const result = await adminDb.runTransaction(async transaction => {
        const [lessonSnapshot, progressSnapshot] = await Promise.all([
          transaction.get(lessonRef),
          transaction.get(progressRef),
        ]);
        if (!lessonSnapshot.exists) throw new Error('LESSON_NOT_FOUND');
        if (!isLessonDocumentData(lessonSnapshot.data())) throw new Error('LESSON_NOT_FOUND');

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
        const submittedIndex =
          typeof progressData.pageId === 'string'
            ? lesson.pages.findIndex(page => page.id === progressData.pageId)
            : Number(progressData.currentPageIndex);
        if (!Number.isInteger(submittedIndex) || submittedIndex < 0 || submittedIndex >= lesson.pages.length) {
          throw new Error('PAGE_NOT_FOUND');
        }

        const existing = (progressSnapshot.data() || {}) as Partial<UserProgress>;
        const furthestPageIndex = Math.max(getFurthestPageIndex(existing, lesson.pages.length), submittedIndex);
        const summary = summarizeLessonCompletion(lesson, {
          ...existing,
          furthestPageIndex,
          currentPageIndex: furthestPageIndex,
        });
        const persisted = toPersistedProgressSummary(summary, existing, now);

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
          furthestPageIndex,
          lessonCompleted: persisted.status === 'completed',
          progress: persisted.progress,
          completedExerciseCount: persisted.completedExerciseCount,
          requiredExerciseCount: persisted.requiredExerciseCount,
        };
      });

      return NextResponse.json({ success: true, ...result });
    }

    if (progressData.action === 'legacy-finish') {
      const result = await adminDb.runTransaction(async transaction => {
        const [lessonSnapshot, progressSnapshot] = await Promise.all([
          transaction.get(lessonRef),
          transaction.get(progressRef),
        ]);
        if (!lessonSnapshot.exists) throw new Error('LESSON_NOT_FOUND');
        if (!isLessonDocumentData(lessonSnapshot.data())) throw new Error('LESSON_NOT_FOUND');

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
        const existing = (progressSnapshot.data() || {}) as Partial<UserProgress>;
        const furthestPageIndex = Math.max(lesson.pages.length - 1, 0);
        const summary = summarizeLessonCompletion(lesson, {
          ...existing,
          furthestPageIndex,
          currentPageIndex: furthestPageIndex,
        });
        if (!summary.isCompleted && summary.missingExercises.length > 0) {
          return { missingExercises: summary.missingExercises };
        }

        const persisted = toPersistedProgressSummary({ ...summary, isCompleted: true, progress: 100 }, existing, now);

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
          missingExercises: [],
          lessonCompleted: true as const,
          progress: persisted.progress,
          completedExerciseCount: persisted.completedExerciseCount,
          requiredExerciseCount: persisted.requiredExerciseCount,
        };
      });

      if (result.missingExercises.length > 0) {
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
        progress: result.progress,
        completedExerciseCount: result.completedExerciseCount,
        requiredExerciseCount: result.requiredExerciseCount,
      });
    }

    return NextResponse.json({ error: 'Unsupported progress action' }, { status: 400 });
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
    const message = error instanceof Error ? error.message : '';
    if (message === 'LESSON_NOT_FOUND') return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    if (message === 'PAGE_NOT_FOUND') return NextResponse.json({ error: 'Page not found' }, { status: 400 });
    if (message === 'EXERCISE_NOT_FOUND') return NextResponse.json({ error: 'Exercise not found' }, { status: 400 });

    console.error('Error updating user progress:', error);
    reportServerUnexpectedError(error, {
      tags: { surface: 'progress_post' },
    });
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 });
  }
}
