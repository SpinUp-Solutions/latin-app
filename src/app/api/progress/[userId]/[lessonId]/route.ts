import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { getLessonProgressAccessInTransaction } from '@/src/lib/learning-units/progression-access';
import { Lesson, UserProgress } from '@/src/types/lesson';
import {
  getFurthestPageIndex,
  getMissingExercises,
  getRequiredExercises,
  isStoredLessonComplete,
  normalizeExerciseProgress,
  PROGRESS_SCHEMA_VERSION,
  resolveExerciseId,
} from '@/src/utils/lessonProgress';
import { reportServerUnexpectedError } from '@/src/lib/report-unexpected-error';

const progressRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('complete-exercise'),
    exerciseId: z.string().min(1),
    score: z.number().finite(),
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

    const progressDoc = await adminDb.collection('userProgress').doc(`${userId}_${lessonId}`).get();
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
    const lessonRef = adminDb.collection('lessons').doc(lessonId);
    const progressRef = adminDb.collection('userProgress').doc(`${userId}_${lessonId}`);
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
        const exerciseProgress = normalizeExerciseProgress(lesson, existing.exerciseProgress);
        const existingIndex = exerciseProgress.findIndex(record => record.exerciseId === exerciseId);
        const completedExercise = {
          exerciseId,
          completedAt: now,
          score: progressData.score,
        };

        if (existingIndex >= 0) exerciseProgress[existingIndex] = completedExercise;
        else exerciseProgress.push(completedExercise);

        const requiredExercises = getRequiredExercises(lesson);
        const missingExercises = getMissingExercises(requiredExercises, exerciseProgress);
        const wasCompleted = isStoredLessonComplete(existing, lesson.pages.length);
        const isCompleted = wasCompleted || (requiredExercises.length > 0 && missingExercises.length === 0);
        const furthestPageIndex = getFurthestPageIndex(existing, lesson.pages.length);

        transaction.set(
          progressRef,
          {
            ...existing,
            userId,
            lessonId,
            furthestPageIndex,
            currentPageIndex: furthestPageIndex,
            exerciseProgress,
            status: isCompleted ? 'completed' : 'in-progress',
            ...(isCompleted ? { completedAt: existing.completedAt || now } : {}),
            lastAccessedAt: now,
            updatedAt: now,
            progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
          },
          { merge: true }
        );

        return { lessonCompleted: isCompleted };
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
        const isCompleted = isStoredLessonComplete(existing, lesson.pages.length);

        transaction.set(
          progressRef,
          {
            ...existing,
            userId,
            lessonId,
            furthestPageIndex,
            currentPageIndex: furthestPageIndex,
            status: isCompleted ? 'completed' : 'in-progress',
            exerciseProgress: normalizeExerciseProgress(lesson, existing.exerciseProgress),
            lastAccessedAt: now,
            updatedAt: now,
            progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
          },
          { merge: true }
        );

        return { furthestPageIndex };
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
        const exerciseProgress = normalizeExerciseProgress(lesson, existing.exerciseProgress);
        const missingExercises = getMissingExercises(getRequiredExercises(lesson), exerciseProgress);
        if (!isStoredLessonComplete(existing, lesson.pages.length) && missingExercises.length > 0) {
          return { missingExercises };
        }

        const furthestPageIndex = Math.max(lesson.pages.length - 1, 0);
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
        return { missingExercises: [] };
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
      return NextResponse.json({ success: true, lessonCompleted: true });
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
