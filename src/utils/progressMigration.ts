import { Lesson, UserProgress } from '@/src/types/lesson';
import {
  getFurthestPageIndex,
  isStoredLessonComplete,
  PROGRESS_SCHEMA_VERSION,
  resolveExerciseId,
} from './lessonProgress';

export interface ProgressMigrationResult {
  progress: Partial<UserProgress> & { progressSchemaVersion: 2 };
  mappedExerciseRecords: number;
  unmappedExerciseRecords: number;
  deduplicatedExerciseRecords: number;
  derivedCompletion: boolean;
}

export function migrateUserProgress(
  lesson: Lesson,
  existing: Partial<UserProgress>,
  now: string
): ProgressMigrationResult {
  const normalizedRecords = new Map<string, NonNullable<UserProgress['exerciseProgress']>[number]>();
  let mappedExerciseRecords = 0;
  let unmappedExerciseRecords = 0;
  let deduplicatedExerciseRecords = 0;

  for (const record of existing.exerciseProgress || []) {
    const stableId = resolveExerciseId(lesson, record.exerciseId);
    if (!stableId) {
      unmappedExerciseRecords++;
      continue;
    }

    mappedExerciseRecords++;
    const previous = normalizedRecords.get(stableId);
    if (previous) deduplicatedExerciseRecords++;
    if (!previous || record.completedAt >= previous.completedAt) {
      normalizedRecords.set(stableId, { ...record, exerciseId: stableId });
    }
  }

  const wasExplicitlyCompleted = existing.status === 'completed';
  const isCompleted = isStoredLessonComplete(existing, lesson.pages.length);
  const furthestPageIndex = getFurthestPageIndex(existing, lesson.pages.length);

  return {
    progress: {
      ...existing,
      furthestPageIndex,
      currentPageIndex: furthestPageIndex,
      exerciseProgress: [...normalizedRecords.values()],
      status: isCompleted ? 'completed' : 'in-progress',
      ...(isCompleted ? { completedAt: existing.completedAt || now } : {}),
      progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
    },
    mappedExerciseRecords,
    unmappedExerciseRecords,
    deduplicatedExerciseRecords,
    derivedCompletion: isCompleted && !wasExplicitlyCompleted,
  };
}
