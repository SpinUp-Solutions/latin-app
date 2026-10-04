import { LEARNING_UNITS_COLLECTION, USER_PROGRESS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { RequestError } from '@/src/lib/domain-error';
import type { Lesson, UserProgress } from '@/src/types/lesson';
import {
  getFurthestPageIndex,
  isStoredLessonComplete,
  resolveExerciseId,
  summarizeLessonCompletion,
  toPersistedProgressSummary,
  toProgressMutationResult,
} from '@/src/utils/lessonProgress';
import { isLessonDocumentData } from './domain';
import { getLessonProgressAccessInTransaction } from './progression-access';

export type LessonProgressStep =
  | { action: 'complete-exercise'; exerciseId: string; score: number }
  | { action: 'visit-page'; pageId?: string; currentPageIndex?: number }
  | { action: 'finish'; finalPageId: string };

const lessonNotFound = () => new RequestError(404, 'LESSON_NOT_FOUND', 'Lesson not found');

/**
 * The one lesson-progress write. Every step reads the lesson and the student's
 * progress, re-checks progression access, and stores the summary it returns in
 * the same transaction, so the stored and the returned summary cannot diverge.
 */
export async function recordLessonProgress(userId: string, lessonId: string, step: LessonProgressStep) {
  const lessonRef = adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId);
  const progressRef = adminDb.collection(USER_PROGRESS_COLLECTION).doc(`${userId}_${lessonId}`);
  const now = new Date().toISOString();

  return adminDb.runTransaction(async transaction => {
    const [lessonSnapshot, progressSnapshot] = await Promise.all([
      transaction.get(lessonRef),
      transaction.get(progressRef),
    ]);
    if (!lessonSnapshot.exists || !isLessonDocumentData(lessonSnapshot.data())) throw lessonNotFound();

    const lesson = { id: lessonSnapshot.id, ...lessonSnapshot.data() } as Lesson;
    const access = await getLessonProgressAccessInTransaction(
      transaction,
      adminDb,
      lesson,
      userId,
      progressSnapshot.exists
    );
    if (access === 'locked') throw new RequestError(403, 'LESSON_LOCKED', 'Lesson is locked');
    if (access !== 'allowed') throw lessonNotFound();

    const existing = (progressSnapshot.data() || {}) as Partial<UserProgress>;
    const totalPages = lesson.pages.length;
    let furthestPageIndex = getFurthestPageIndex(existing, totalPages);
    let exerciseProgress = existing.exerciseProgress;
    let alreadyCompleted: boolean | undefined;

    if (step.action === 'complete-exercise') {
      const exerciseId = resolveExerciseId(lesson, step.exerciseId);
      if (!exerciseId) throw new RequestError(400, 'EXERCISE_NOT_FOUND', 'Exercise not found');
      exerciseProgress = [
        ...(Array.isArray(exerciseProgress) ? exerciseProgress : []),
        { exerciseId, completedAt: now, score: step.score },
      ];
    } else if (step.action === 'visit-page') {
      const visitedIndex =
        typeof step.pageId === 'string'
          ? lesson.pages.findIndex(page => page.id === step.pageId)
          : Number(step.currentPageIndex);
      if (!Number.isInteger(visitedIndex) || visitedIndex < 0 || visitedIndex >= totalPages) {
        throw new RequestError(400, 'PAGE_NOT_FOUND', 'Page not found');
      }
      furthestPageIndex = Math.max(furthestPageIndex, visitedIndex);
    } else {
      if (lesson.pages.at(-1)?.id !== step.finalPageId) {
        throw new RequestError(
          400,
          'FINAL_PAGE_REQUIRED',
          'Finish the authored final page before completing this lesson.'
        );
      }
      alreadyCompleted = isStoredLessonComplete(existing, totalPages);
      furthestPageIndex = totalPages - 1;
    }

    // Completing an exercise does not move the student's place in the lesson.
    const summary = summarizeLessonCompletion(
      lesson,
      step.action === 'complete-exercise'
        ? { ...existing, exerciseProgress }
        : { ...existing, furthestPageIndex, currentPageIndex: furthestPageIndex }
    );
    if (step.action === 'finish' && !alreadyCompleted && summary.missingExercises.length > 0) {
      throw new RequestError(422, 'EXERCISES_MISSING', 'Complete all required exercises before finishing the lesson.', {
        missingExercises: summary.missingExercises,
      });
    }

    const persisted = toPersistedProgressSummary(
      step.action === 'finish' ? { ...summary, isCompleted: true, progress: 100 } : summary,
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
      ...(alreadyCompleted === undefined ? {} : { alreadyCompleted }),
      ...toProgressMutationResult(persisted, furthestPageIndex),
    };
  });
}
