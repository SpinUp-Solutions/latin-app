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
