import { ExerciseProgress, Lesson, UserProgress } from '@/src/types/lesson';
import { isExerciseType, parsePageIndex } from './lessonUtils';

export const PROGRESS_SCHEMA_VERSION = 2;

export interface RequiredExercise {
  exerciseId: string;
  title: string;
  pageId: string;
  pageIndex: number;
}

interface StableIdPage {
  id: string;
  items: readonly { id: string }[];
}

export function validatePageDocumentIds(pages: readonly StableIdPage[], documentName: string = 'Lesson'): string[] {
  const errors: string[] = [];
  if (pages.length === 0) {
    return [`${documentName} must contain at least one page.`];
  }

  const pageIds = new Set<string>();
  const itemIds = new Set<string>();
  pages.forEach((page, pageIndex) => {
    const pageId = page.id?.trim();
    if (!pageId) errors.push(`Page ${pageIndex + 1} is missing an ID.`);
    else if (pageIds.has(pageId)) errors.push(`Page ${pageIndex + 1} has a duplicate ID.`);
    else pageIds.add(pageId);

    page.items.forEach((item, itemIndex) => {
      const itemId = item.id?.trim();
      if (!itemId) errors.push(`Item ${itemIndex + 1} on page ${pageIndex + 1} is missing an ID.`);
      else if (itemIds.has(itemId)) errors.push(`Item ${itemIndex + 1} on page ${pageIndex + 1} has a duplicate ID.`);
      else itemIds.add(itemId);
    });
  });

  return errors;
}

export function validateLessonProgression(lesson: Pick<Lesson, 'pages'>): string[] {
  return validatePageDocumentIds(lesson.pages);
}

export function getRequiredExercises(lesson: Pick<Lesson, 'pages'>): RequiredExercise[] {
  return (lesson.pages || []).flatMap((page, pageIndex) =>
    (page.items || [])
      .filter(item => isExerciseType(item.type))
      .map(item => ({
        exerciseId: item.id,
        title: item.title || `Exercise on page ${pageIndex + 1}`,
        pageId: page.id,
        pageIndex,
      }))
  );
}

export function getMissingExercises(
  requiredExercises: RequiredExercise[],
  exerciseProgress: Pick<ExerciseProgress, 'exerciseId'>[]
): RequiredExercise[] {
  const completedIds = new Set(exerciseProgress.map(progress => progress.exerciseId));
  return requiredExercises.filter(exercise => !completedIds.has(exercise.exerciseId));
}

export function resolveExerciseId(lesson: Pick<Lesson, 'pages'>, exerciseId: string): string | null {
  const requiredIds = new Set(getRequiredExercises(lesson).map(exercise => exercise.exerciseId));
  if (requiredIds.has(exerciseId)) return exerciseId;

  const pageIndex = parsePageIndex(exerciseId);
  const itemIndexMatch = exerciseId.match(/-item(\d+)$/);
  if (pageIndex === null || !itemIndexMatch) return null;

  const item = lesson.pages?.[pageIndex]?.items?.[Number.parseInt(itemIndexMatch[1], 10)];
  return item && isExerciseType(item.type) ? item.id : null;
}

export function normalizeExerciseProgress(
  lesson: Pick<Lesson, 'pages'>,
  progress: ExerciseProgress[] | undefined
): ExerciseProgress[] {
  const normalized = new Map<string, ExerciseProgress>();

  for (const record of progress || []) {
    const stableId = resolveExerciseId(lesson, record.exerciseId);
    if (!stableId) continue;

    const previous = normalized.get(stableId);
    if (!previous || record.completedAt >= previous.completedAt) {
      normalized.set(stableId, { ...record, exerciseId: stableId });
    }
  }

  return [...normalized.values()];
}

export function getFurthestPageIndex(progress: Partial<UserProgress> | undefined, totalPages: number): number {
  if (totalPages <= 0) return -1;

  const rawIndex =
    typeof progress?.furthestPageIndex === 'number'
      ? progress.furthestPageIndex
      : typeof progress?.currentPageIndex === 'number'
        ? progress.currentPageIndex
        : -1;

  return Math.max(-1, Math.min(rawIndex, totalPages - 1));
}

export function hasLegacyCompletion(progress: Partial<UserProgress> | undefined, totalPages: number): boolean {
  return Boolean(
    progress &&
      progress.progressSchemaVersion !== PROGRESS_SCHEMA_VERSION &&
      typeof progress.currentPageIndex === 'number' &&
      progress.currentPageIndex >= totalPages &&
      totalPages > 0
  );
}

export function isStoredLessonComplete(progress: Partial<UserProgress> | undefined, totalPages: number): boolean {
  return progress?.status === 'completed' || hasLegacyCompletion(progress, totalPages);
}

export function calculateStoredProgress(progress: Partial<UserProgress> | undefined, totalPages: number): number {
  if (!progress || totalPages <= 0) return 0;
  if (isStoredLessonComplete(progress, totalPages)) return 100;

  const furthestPageIndex = getFurthestPageIndex(progress, totalPages);
  if (furthestPageIndex < 0) return 0;
  return Math.min(99, Math.round(((furthestPageIndex + 1) / totalPages) * 100));
}
