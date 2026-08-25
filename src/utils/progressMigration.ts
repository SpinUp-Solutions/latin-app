import { Lesson, UserProgress } from '@/src/types/lesson';
import {
  getFurthestPageIndex,
  isValidExerciseScore,
  isStoredLessonComplete,
  resolveExerciseId,
  STABLE_ID_PROGRESS_SCHEMA_VERSION,
} from './lessonProgress';

export interface ProgressMigrationResult {
  progress: Partial<UserProgress> & { progressSchemaVersion: typeof STABLE_ID_PROGRESS_SCHEMA_VERSION };
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

  for (const candidate of Array.isArray(existing.exerciseProgress) ? existing.exerciseProgress : []) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof candidate.exerciseId !== 'string' ||
      !isValidExerciseScore(candidate.score)
    ) {
      unmappedExerciseRecords++;
      continue;
    }

    const record = candidate;
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
      progressSchemaVersion: STABLE_ID_PROGRESS_SCHEMA_VERSION,
    },
    mappedExerciseRecords,
    unmappedExerciseRecords,
    deduplicatedExerciseRecords,
    derivedCompletion: isCompleted && !wasExplicitlyCompleted,
  };
}
