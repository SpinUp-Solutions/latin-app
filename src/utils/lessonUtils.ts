import { Lesson, ExerciseProgress } from '@/src/types/lesson';

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

export function calculateProgressFromPageIndex(currentPageIndex: number, totalPages: number): number {
  if (totalPages === 0) return 0;
  return Math.round((currentPageIndex / totalPages) * 100);
}

export function isLessonComplete(currentPageIndex: number, totalPages: number): boolean {
  return currentPageIndex >= totalPages;
}

export function parsePageIndex(exerciseId: string): number | null {
  const match = exerciseId.match(/^page(\d+)-item\d+$/);
  return match ? parseInt(match[1], 10) : null;
}

export function getExerciseCountForPage(lesson: Lesson, pageIndex: number): number {
  if (!lesson.pages[pageIndex]) return 0;
  return lesson.pages[pageIndex].items.filter(item => isExerciseType(item.type)).length;
}

export function getCompletedExercisesForPage(
  exerciseProgress: ExerciseProgress[],
  pageIndex: number
): ExerciseProgress[] {
  return exerciseProgress.filter(ep => {
    const epPageIndex = parsePageIndex(ep.exerciseId);
    return epPageIndex === pageIndex;
  });
}

export { isExerciseType };
