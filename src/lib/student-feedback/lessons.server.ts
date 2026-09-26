import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { z } from 'zod';
import { adminDb } from '@/src/services/firebase-admin';
import { LEARNING_UNITS_COLLECTION, USER_PROGRESS_COLLECTION } from '@/shared/constants/firestore';
import { feedbackLessonSnapshotSchema, type FeedbackLessonOption, type FeedbackSubmitRequest } from '@/shared/student-feedback';
import { getLessonProgressAccessInTransaction } from '@/src/lib/learning-units/progression-access';
import { isLessonDocumentData, normalizeLearningUnit } from '@/src/lib/learning-units/domain';
import { studentDashboardService } from '@/src/lib/learning-units/student-dashboard-service';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';
import { FeedbackError, invalidFeedbackDocument } from './http.server';

export function boundedFeedbackTitle(title: string): string {
  return (title.length <= 500 ? title : stripHtmlTags(title).slice(0, 500)).trim() || 'Untitled lesson';
}

/** The dashboard already applies the student's progression and live-practice policy. */
export async function listAccessibleFeedbackLessons(uid: string, db: Firestore = adminDb): Promise<FeedbackLessonOption[]> {
  const dashboard = await studentDashboardService.getDashboard(uid);
  const candidates = [...dashboard.learningPath, ...dashboard.practiceLessons].filter(
    unit => unit.kind === 'lesson' && unit.status !== 'locked'
  );
  const options: FeedbackLessonOption[] = [];
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const chunk = candidates.slice(offset, offset + 100);
    const snapshots = await db.getAll(...chunk.map(unit => db.collection(LEARNING_UNITS_COLLECTION).doc(unit.id)));
    snapshots.forEach((snapshot, index) => {
      const data = snapshot.data();
      if (!snapshot.exists || !isLessonDocumentData(data) || data._deletionPending === true) return;
      const candidate = chunk[index];
      if (candidate.kind !== 'lesson') return;
      if (candidate.type !== 'normal' && data.isLive !== true) return;
      options.push({
        id: candidate.id,
        title: boundedFeedbackTitle(candidate.title),
        revision: typeof data.version === 'number' && Number.isSafeInteger(data.version) ? data.version : 0,
      });
    });
  }
  return options;
}

export async function validateFeedbackLessonInTransaction(
  transaction: Transaction,
  db: Firestore,
  uid: string,
  lessonId: NonNullable<FeedbackSubmitRequest['lessonId']>,
  pageContext: FeedbackSubmitRequest['pageContext']
): Promise<z.infer<typeof feedbackLessonSnapshotSchema>> {
  const lessonRef = db.collection(LEARNING_UNITS_COLLECTION).doc(lessonId);
  const progressRef = db.collection(USER_PROGRESS_COLLECTION).doc(`${uid}_${lessonId}`);
  const [lessonSnapshot, progressSnapshot] = await Promise.all([
    transaction.get(lessonRef),
    transaction.get(progressRef),
  ]);
  const raw = lessonSnapshot.data();
  if (!lessonSnapshot.exists || !isLessonDocumentData(raw) || raw._deletionPending === true) {
    throw new FeedbackError('FEEDBACK_LESSON_INACCESSIBLE', 'This lesson is no longer available', 409);
  }

  let unit: ReturnType<typeof normalizeLearningUnit>;
  try {
    unit = normalizeLearningUnit(raw, lessonSnapshot.id);
  } catch {
    return invalidFeedbackDocument('The selected lesson contains invalid data');
  }
  if (unit.kind !== 'lesson') {
    throw new FeedbackError('FEEDBACK_LESSON_INACCESSIBLE', 'This lesson is no longer available', 409);
  }
  const access = await getLessonProgressAccessInTransaction(
    transaction,
    db,
    unit,
    uid,
    progressSnapshot.exists
  );
  if (access !== 'allowed') {
    throw new FeedbackError('FEEDBACK_LESSON_INACCESSIBLE', 'This lesson is no longer accessible', 409);
  }

  const revision = typeof unit.version === 'number' && Number.isSafeInteger(unit.version) ? unit.version : 0;
  let pageId: string | null = null;
  let pageIndex: number | null = null;
  let pageTitle: string | null = null;
  if (pageContext) {
    const page = unit.pages[pageContext.pageIndex];
    if (pageContext.revision !== revision || !page || page.id !== pageContext.pageId) {
      throw new FeedbackError('FEEDBACK_STALE_LESSON_CONTEXT', 'The lesson page changed. Please refresh the context.', 409);
    }
    pageId = page.id;
    pageIndex = pageContext.pageIndex;
    pageTitle = page.title ? boundedFeedbackTitle(page.title) : null;
  }

  return {
    id: unit.id,
    title: boundedFeedbackTitle(unit.title),
    pageId,
    pageIndex,
    pageTitle,
    revision,
  };
}
