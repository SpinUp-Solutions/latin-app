export const APP_API_TAG_TYPES = [
  // Compatibility tags used by the existing lesson endpoints.
  'Lesson',
  'LessonList',
  'StudentLesson',
  'Recovery',
  'PracticeCategory',
  'PracticeCategoryAssignments',
  // Shared learning-unit and assessment tags used by the refactor.
  'LearningUnit',
  'LearningPath',
  'StudentLearningPath',
  'TestVersion',
  'MockTest',
  'TestAttempt',
  'AttemptSummary',
] as const;

export const PRACTICE_CATEGORY_ASSIGNMENTS_TAG = {
  type: 'PracticeCategoryAssignments' as const,
  id: 'ALL',
};

/** Invalidates every per-user dashboard projection after curriculum mutations. */
export const STUDENT_DASHBOARD_TAG = {
  type: 'StudentLearningPath' as const,
};

export const getAttemptSummaryTagId = (uid: string, origin: TestAttemptOrigin) =>
  `${origin.kind}:${origin.kind === 'normal-test' ? origin.testId : origin.mockTestId}:${uid}`;
import type { TestAttemptOrigin } from '@/src/types/test';
