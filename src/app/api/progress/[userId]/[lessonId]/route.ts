import { NextRequest, NextResponse } from 'next/server';
import type { Transaction } from 'firebase-admin/firestore';
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
  toProgressMutationResult,
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
]);

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

    const parsedProgressData = progressRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsedProgressData.success) {
      return NextResponse.json({ error: 'Invalid progress request' }, { status: 400 });
    }

    const progressData = parsedProgressData.data;
    const lessonRef = adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId);
    const progressRef = adminDb.collection(USER_PROGRESS_COLLECTION).doc(`${userId}_${lessonId}`);
    const now = new Date().toISOString();

    // Every action reads the lesson and progress, then re-checks progression access, before any write.
    const readAuthorizedProgress = async (transaction: Transaction) => {
      const [lessonSnapshot, progressSnapshot] = await Promise.all([
        transaction.get(lessonRef),
        transaction.get(progressRef),
      ]);
      if (!lessonSnapshot.exists || !isLessonDocumentData(lessonSnapshot.data())) throw new Error('LESSON_NOT_FOUND');

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
      return { lesson, existing: (progressSnapshot.data() || {}) as Partial<UserProgress> };
    };

    // Writes the summary and returns it as the response, so the two cannot diverge.
    const writeProgress = (
      transaction: Transaction,
      existing: Partial<UserProgress>,
      furthestPageIndex: number,
      persisted: ReturnType<typeof toPersistedProgressSummary>
    ) => {
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
      return toProgressMutationResult(persisted, furthestPageIndex);
    };

    if (progressData.action === 'complete-exercise') {
      const result = await adminDb.runTransaction(async transaction => {
        const { lesson, existing } = await readAuthorizedProgress(transaction);
        const exerciseId = resolveExerciseId(lesson, progressData.exerciseId);
        if (!exerciseId) throw new Error('EXERCISE_NOT_FOUND');

        const summary = summarizeLessonCompletion(lesson, {
          ...existing,
          exerciseProgress: [
            ...(Array.isArray(existing.exerciseProgress) ? existing.exerciseProgress : []),
            { exerciseId, completedAt: now, score: progressData.score },
          ],
        });
        const persisted = toPersistedProgressSummary(summary, existing, now, lesson.version);
        const furthestPageIndex = getFurthestPageIndex(existing, lesson.pages.length);

        return writeProgress(transaction, existing, furthestPageIndex, persisted);
      });

      return NextResponse.json({ success: true, ...result });
    }

    if (progressData.action === 'visit-page') {
      const result = await adminDb.runTransaction(async transaction => {
        const { lesson, existing } = await readAuthorizedProgress(transaction);
        const submittedIndex =
          typeof progressData.pageId === 'string'
            ? lesson.pages.findIndex(page => page.id === progressData.pageId)
            : Number(progressData.currentPageIndex);
        if (!Number.isInteger(submittedIndex) || submittedIndex < 0 || submittedIndex >= lesson.pages.length) {
          throw new Error('PAGE_NOT_FOUND');
        }

        const furthestPageIndex = Math.max(getFurthestPageIndex(existing, lesson.pages.length), submittedIndex);
        const summary = summarizeLessonCompletion(lesson, {
          ...existing,
          furthestPageIndex,
          currentPageIndex: furthestPageIndex,
        });
        const persisted = toPersistedProgressSummary(summary, existing, now, lesson.version);

        return writeProgress(transaction, existing, furthestPageIndex, persisted);
      });

      return NextResponse.json({ success: true, ...result });
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
