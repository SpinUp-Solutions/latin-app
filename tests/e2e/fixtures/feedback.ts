import { getE2EAdmin, E2E_USERS } from './seed';

export const FEEDBACK_LESSON_ID = 'e2e-feedback-lesson';
export const FEEDBACK_PAGE_ID = 'e2e-feedback-page-1';

export async function seedFeedbackLesson() {
  const { db } = getE2EAdmin();
  await db.collection('lessons').doc(FEEDBACK_LESSON_ID).set({
    id: FEEDBACK_LESSON_ID,
    kind: 'lesson',
    title: '<strong>Feedback lesson</strong>',
    description: 'A practice lesson for feedback acceptance',
    type: 'normal',
    pages: [
      { id: FEEDBACK_PAGE_ID, title: 'Opening page', items: [] },
      { id: 'e2e-feedback-page-2', title: 'Second page', items: [] },
    ],
    isLive: true,
    liveOrder: 0,
    publishedAt: '2026-09-24T10:00:00.000Z',
    publishedBy: E2E_USERS.admin.uid,
    version: 1,
    createdAt: '2026-09-24T10:00:00.000Z',
    createdBy: E2E_USERS.admin.uid,
    updatedAt: '2026-09-24T10:00:00.000Z',
    updatedBy: E2E_USERS.admin.uid,
  });
  const pathRef = db.collection('learningPaths').doc('default');
  const path = await pathRef.get();
  const unitIds = path.data()?.unitIds;
  if (!Array.isArray(unitIds)) throw new Error('Assessment acceptance path must be seeded first');
  await pathRef.update({ unitIds: [FEEDBACK_LESSON_ID, ...unitIds.filter((id): id is string => typeof id === 'string' && id !== FEEDBACK_LESSON_ID)] });
}
