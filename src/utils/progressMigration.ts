import { Lesson, UserProgress } from '@/src/types/lesson';
import {
  getFurthestPageIndex,
  isValidExerciseScore,
  isStoredLessonComplete,
  resolveExerciseId,
  STABLE_ID_PROGRESS_SCHEMA_VERSION,
  summarizeLessonCompletion,
  toPersistedProgressSummary,
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
    const completedAt = typeof record.completedAt === 'string' ? record.completedAt : '';
    const previous = normalizedRecords.get(stableId);
    if (previous) deduplicatedExerciseRecords++;
    if (!previous || completedAt >= previous.completedAt) {
      normalizedRecords.set(stableId, { ...record, exerciseId: stableId, completedAt });
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

export interface ExerciseProgressV4MigrationResult extends Omit<ProgressMigrationResult, 'progress'> {
  progress: Partial<UserProgress>;
  resetIncompleteProgressToZero: boolean;
}

export function migrateUserProgressToExerciseBasis(
  lesson: Lesson,
  existing: Partial<UserProgress>,
  now: string
): ExerciseProgressV4MigrationResult {
  const stable = migrateUserProgress(lesson, existing, now);
  const summary = summarizeLessonCompletion(lesson, stable.progress);
  const furthestPageIndex = getFurthestPageIndex(stable.progress, lesson.pages.length);
  const persisted = toPersistedProgressSummary(summary, existing, now, lesson.version);

  return {
    ...stable,
    progress: {
      ...existing,
      furthestPageIndex,
      currentPageIndex: furthestPageIndex,
      ...persisted,
    },
    resetIncompleteProgressToZero:
      !summary.isCompleted && summary.requiredExerciseCount > 0 && summary.completedExerciseCount === 0,
  };
}
