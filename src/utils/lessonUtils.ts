import { Lesson, ExerciseProgress } from '@/src/types/lesson';

export interface LessonContentCount {
  introPages: number;
  exercisePages: number;
  introItems: number;
  exerciseItems: number;
  totalPages: number;
  totalItems: number;
}

export function getContentCount(lesson: Lesson): LessonContentCount {
  const introPages = lesson.introduction.length;
  const exercisePages = lesson.exercises.length;
  const introItems = lesson.introduction.reduce((count, page) => count + page.items.length, 0);
  const exerciseItems = lesson.exercises.reduce((count, page) => count + page.items.length, 0);

  return {
    introPages,
    exercisePages,
    introItems,
    exerciseItems,
    totalPages: introPages + exercisePages,
    totalItems: introItems + exerciseItems,
  };
}

export function hasLessonContent(lesson: Lesson): boolean {
  return lesson.introduction.length > 0 || lesson.exercises.length > 0;
}

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
