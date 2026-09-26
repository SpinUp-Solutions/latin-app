import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { LEARNING_UNITS_COLLECTION } from '@/shared/constants/firestore';
import type { FeedbackLessonOption, FeedbackLessonSnapshot } from '@/shared/student-feedback';
import { isLessonDocumentData, normalizeLearningUnit } from '@/src/lib/learning-units/domain';
import { studentDashboardService } from '@/src/lib/learning-units/student-dashboard-service';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';
import { FeedbackError } from './http.server';

export function boundedFeedbackTitle(title: string): string {
  return (title.length <= 500 ? title : stripHtmlTags(title).slice(0, 500)).trim() || 'Untitled lesson';
}

/** The dashboard already applies the student's progression and live-practice policy. */
export async function listAccessibleFeedbackLessons(uid: string): Promise<FeedbackLessonOption[]> {
  const dashboard = await studentDashboardService.getDashboard(uid);
  return [...dashboard.learningPath, ...dashboard.practiceLessons]
    .filter(unit => unit.kind === 'lesson' && unit.status !== 'locked')
    .map(unit => ({ id: unit.id, title: boundedFeedbackTitle(unit.title) }));
}

function lessonUnavailable(): never {
  throw new FeedbackError('FEEDBACK_LESSON_UNAVAILABLE', 'This lesson is no longer available', 409);
}

/** Snapshots the lesson and page title. A page that no longer exists is dropped rather than rejected. */
export async function readFeedbackLessonInTransaction(
  transaction: Transaction,
  db: Firestore,
  lessonId: string,
  pageId: string | null | undefined
): Promise<FeedbackLessonSnapshot> {
  const snapshot = await transaction.get(db.collection(LEARNING_UNITS_COLLECTION).doc(lessonId));
  const raw = snapshot.data();
  if (!snapshot.exists || !isLessonDocumentData(raw) || raw._deletionPending === true) lessonUnavailable();

  let unit: ReturnType<typeof normalizeLearningUnit>;
  try {
    unit = normalizeLearningUnit(raw, snapshot.id);
  } catch {
    lessonUnavailable();
  }
  if (unit.kind !== 'lesson') lessonUnavailable();

  const pageIndex = pageId ? unit.pages.findIndex(page => page.id === pageId) : -1;
  const page = pageIndex >= 0 ? unit.pages[pageIndex] : null;
  return {
    id: unit.id,
    title: boundedFeedbackTitle(unit.title),
    pageId: page?.id ?? null,
    pageIndex: page ? pageIndex : null,
    pageTitle: page?.title ? boundedFeedbackTitle(page.title) : null,
  };
}

export async function getCurrentFeedbackLesson(lessonId: string | undefined, db: Firestore = adminDb) {
  if (!lessonId) return null;
  const snapshot = await db.collection(LEARNING_UNITS_COLLECTION).doc(lessonId).get();
  const data = snapshot.data();
  if (!snapshot.exists || !isLessonDocumentData(data) || data._deletionPending === true) return null;
  return { id: lessonId, title: boundedFeedbackTitle(typeof data.title === 'string' ? data.title : '') };
}
