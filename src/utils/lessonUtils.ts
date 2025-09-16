import { Lesson, ExerciseProgress, PageProgress } from '@/src/types/lesson';

export interface LessonContentCount {
  totalPages: number;
  totalItems: number;
  totalExercises: number;
}

const EXERCISE_TYPES = [
  'matching',
  'fill',
  'text-selection',
  'verb-analysis',
  'verb-conjugation',
  'multiple-choice',
  'odd-one-out',
  'sentence-diagramming',
];

function isExerciseType(contentType: string): boolean {
  return EXERCISE_TYPES.includes(contentType);
}

export function getContentCount(lesson: Lesson): LessonContentCount {
  const totalPages = lesson.pages.length;
  const totalItems = lesson.pages.reduce((count, page) => count + page.items.length, 0);
  const totalExercises = lesson.pages.reduce(
    (count, page) => count + page.items.filter(item => isExerciseType(item.type)).length,
    0
  );

  return {
    totalPages,
    totalItems,
    totalExercises,
  };
}

export function hasLessonContent(lesson: Lesson): boolean {
  return lesson.pages.length > 0;
}

export function getExerciseCount(lesson: Lesson): number {
  return getContentCount(lesson).totalExercises;
}

export { isExerciseType };

export function sortLessonsByLiveOrder(lessons: Lesson[]): Lesson[] {
  return lessons.sort((a, b) => (a.liveOrder || 0) - (b.liveOrder || 0));
}

export function getLiveLessonsSorted(lessons: Lesson[]): Lesson[] {
  return lessons.filter(l => l.isLive).sort((a, b) => (a.liveOrder || 0) - (b.liveOrder || 0));
}

export function calculateOverallProgress(exerciseProgress: ExerciseProgress[], totalExercises: number): number {
  if (totalExercises === 0) return 0;
  return Math.round((exerciseProgress.length / totalExercises) * 100);
}

export function calculateAverageScore(exerciseProgress: ExerciseProgress[]): number | undefined {
  if (exerciseProgress.length === 0) return undefined;
  const totalScore = exerciseProgress.reduce((sum, ep) => sum + ep.score, 0);
  return Math.round(totalScore / exerciseProgress.length);
}

export function isLessonComplete(exerciseProgress: ExerciseProgress[], totalExercises: number): boolean {
  return exerciseProgress.length >= totalExercises && totalExercises > 0;
}

export function calculatePageProgress(pageProgress: PageProgress[], totalPages: number): number {
  if (totalPages === 0) return 0;
  return Math.round((pageProgress.length / totalPages) * 100);
}

export function isPageComplete(pageProgress: PageProgress[], pageIndex: number): boolean {
  return pageProgress.some(pp => pp.pageIndex === pageIndex);
}

export function getCompletedPagesCount(pageProgress: PageProgress[]): number {
  return pageProgress.length;
}

export function parsePageIndex(exerciseId: string): number | null {
  const match = exerciseId.match(/^page(\d+)-item\d+$/);
  return match ? parseInt(match[1], 10) : null;
}

export function getExerciseCountForPage(lesson: Lesson, pageIndex: number): number {
  if (!lesson.pages[pageIndex]) return 0;
  return lesson.pages[pageIndex].items.filter(item => isExerciseType(item.type)).length;
}

export function getCompletedExercisesForPage(exerciseProgress: ExerciseProgress[], pageIndex: number): ExerciseProgress[] {
  return exerciseProgress.filter(ep => {
    const epPageIndex = parsePageIndex(ep.exerciseId);
    return epPageIndex === pageIndex;
  });
}
