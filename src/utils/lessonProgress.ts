import { ExerciseProgress, Lesson, UserProgress } from '@/src/types/lesson';
import { isExerciseType, parsePageIndex } from './lessonUtils';

export const PROGRESS_SCHEMA_VERSION = 4;
export const STABLE_ID_PROGRESS_SCHEMA_VERSION = 2;

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
  exerciseProgress: unknown
): RequiredExercise[] {
  const completedIds = new Set<string>();
  if (Array.isArray(exerciseProgress)) {
    for (const candidate of exerciseProgress) {
      if (
        candidate &&
        typeof candidate === 'object' &&
        !Array.isArray(candidate) &&
        typeof (candidate as Partial<ExerciseProgress>).exerciseId === 'string' &&
        isValidExerciseScore((candidate as Partial<ExerciseProgress>).score)
      ) {
        completedIds.add((candidate as Partial<ExerciseProgress>).exerciseId as string);
      }
    }
  }
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
  progress: unknown
): ExerciseProgress[] {
  const normalized = new Map<string, ExerciseProgress>();

  if (!Array.isArray(progress)) return [];

  for (const candidate of progress) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const record = candidate as Partial<ExerciseProgress>;
    if (typeof record.exerciseId !== 'string' || !isValidExerciseScore(record.score)) continue;

    const stableId = resolveExerciseId(lesson, record.exerciseId);
    if (!stableId) continue;

    const normalizedRecord: ExerciseProgress = {
      exerciseId: stableId,
      completedAt: typeof record.completedAt === 'string' ? record.completedAt : '',
      score: record.score,
    };

    const previous = normalized.get(stableId);
    if (!previous || normalizedRecord.completedAt >= previous.completedAt) {
      normalized.set(stableId, normalizedRecord);
    }
  }

  return [...normalized.values()];
}

/** Scores are persisted input, so never let malformed values satisfy completion. */
export function isValidExerciseScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
}

export function getFurthestPageIndex(progress: Partial<UserProgress> | undefined, totalPages: number): number {
  if (totalPages <= 0) return -1;

  const rawIndex =
    typeof progress?.furthestPageIndex === 'number'
      ? progress.furthestPageIndex
      : typeof progress?.currentPageIndex === 'number'
        ? progress.currentPageIndex
        : -1;

  if (!Number.isFinite(rawIndex)) return -1;
  return Math.max(-1, Math.min(rawIndex, totalPages - 1));
}

export function hasLegacyCompletion(progress: Partial<UserProgress> | undefined, totalPages: number): boolean {
  const rawVersion = progress?.progressSchemaVersion;
  const version =
    rawVersion === undefined
      ? 1
      : typeof rawVersion === 'number' && Number.isFinite(rawVersion)
        ? rawVersion
        : STABLE_ID_PROGRESS_SCHEMA_VERSION;
  return Boolean(
    progress &&
      version < STABLE_ID_PROGRESS_SCHEMA_VERSION &&
      typeof progress.currentPageIndex === 'number' &&
      progress.currentPageIndex >= totalPages &&
      totalPages > 0
  );
}

export function isStoredLessonComplete(progress: Partial<UserProgress> | undefined, totalPages: number): boolean {
  return progress?.status === 'completed' || hasLegacyCompletion(progress, totalPages);
}

export interface LessonCompletionSummary {
  exerciseProgress: ExerciseProgress[];
  completedExerciseCount: number;
  requiredExerciseCount: number;
  progress: number;
  isCompleted: boolean;
  missingExercises: RequiredExercise[];
}

export interface StoredProgressCalculationOptions {
  totalPages: number;
  totalExercises?: number;
  lessonVersion?: number;
}

function normalizedLessonVersion(version: unknown): number {
  return Number.isSafeInteger(version) && (version as number) >= 0 ? (version as number) : 0;
}

function exerciseCompletionPercentage(completedExerciseCount: number, requiredExerciseCount: number): number {
  if (requiredExerciseCount <= 0) return 0;
  if (completedExerciseCount >= requiredExerciseCount) return 100;
  return Math.min(99, Math.round((completedExerciseCount / requiredExerciseCount) * 100));
}

export function hasTrustedExerciseProgressSummary(
  progress: Partial<UserProgress> | undefined,
  options: StoredProgressCalculationOptions
): boolean {
  const totalExercises = options.totalExercises ?? 0;
  return Boolean(
    progress &&
      totalExercises > 0 &&
      typeof progress.progressSchemaVersion === 'number' &&
      progress.progressSchemaVersion === PROGRESS_SCHEMA_VERSION &&
      progress.progressLessonVersion === normalizedLessonVersion(options.lessonVersion) &&
      Number.isSafeInteger(progress.requiredExerciseCount) &&
      progress.requiredExerciseCount === totalExercises &&
      Number.isSafeInteger(progress.completedExerciseCount) &&
      (progress.completedExerciseCount as number) >= 0 &&
      (progress.completedExerciseCount as number) <= totalExercises
  );
}

export function summarizeLessonCompletion(
  lesson: Pick<Lesson, 'pages'>,
  stored: Partial<UserProgress> | undefined
): LessonCompletionSummary {
  const exerciseProgress = normalizeExerciseProgress(lesson, stored?.exerciseProgress);
  const requiredExercises = getRequiredExercises(lesson);
  const missingExercises = getMissingExercises(requiredExercises, exerciseProgress);
  const requiredExerciseCount = requiredExercises.length;
  const completedExerciseCount = requiredExerciseCount - missingExercises.length;
  const totalPages = lesson.pages.length;
  const reachedFinalPage = totalPages > 0 && getFurthestPageIndex(stored, totalPages) >= totalPages - 1;
  const requirementsComplete = requiredExerciseCount > 0 ? missingExercises.length === 0 : reachedFinalPage;
  const isCompleted = isStoredLessonComplete(stored, totalPages) || requirementsComplete;
  const furthestPageIndex = getFurthestPageIndex(stored, totalPages);
  const progress = isCompleted
    ? 100
    : requiredExerciseCount > 0
      ? exerciseCompletionPercentage(completedExerciseCount, requiredExerciseCount)
      : furthestPageIndex < 0
        ? 0
        : Math.min(99, Math.round(((furthestPageIndex + 1) / totalPages) * 100));

  return {
    exerciseProgress,
    completedExerciseCount,
    requiredExerciseCount,
    progress,
    isCompleted,
    missingExercises,
  };
}

export function canonicalizeLessonProgressForRead(
  lesson: Pick<Lesson, 'pages' | 'version'>,
  stored: Partial<UserProgress>
): Partial<UserProgress> {
  const summary = summarizeLessonCompletion(lesson, stored);
  return {
    ...stored,
    exerciseProgress: summary.exerciseProgress,
    completedExerciseCount: summary.completedExerciseCount,
    requiredExerciseCount: summary.requiredExerciseCount,
    progress: summary.progress,
    status: summary.isCompleted ? 'completed' : 'in-progress',
    progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
    progressLessonVersion: normalizedLessonVersion(lesson.version),
  };
}

export function toPersistedProgressSummary(
  summary: LessonCompletionSummary,
  existing: Partial<UserProgress> | undefined,
  now: string,
  lessonVersion: number | undefined
) {
  return {
    exerciseProgress: summary.exerciseProgress,
    progress: summary.progress,
    completedExerciseCount: summary.completedExerciseCount,
    requiredExerciseCount: summary.requiredExerciseCount,
    progressLessonVersion: normalizedLessonVersion(lessonVersion),
    status: summary.isCompleted ? ('completed' as const) : ('in-progress' as const),
    ...(summary.isCompleted ? { completedAt: existing?.completedAt || now } : {}),
    progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
  };
}

export function calculateStoredProgress(
  progress: Partial<UserProgress> | undefined,
  totalPagesOrOptions: number | StoredProgressCalculationOptions
): number {
  const options =
    typeof totalPagesOrOptions === 'number'
      ? { totalPages: totalPagesOrOptions, totalExercises: 0, lessonVersion: 0 }
      : totalPagesOrOptions;
  const totalPages = options.totalPages;
  if (!progress || totalPages <= 0) return 0;
  if (isStoredLessonComplete(progress, totalPages)) return 100;

  const totalExercises = options.totalExercises ?? 0;
  if (totalExercises > 0) {
    if (!hasTrustedExerciseProgressSummary(progress, options)) return 0;
    return exerciseCompletionPercentage(progress.completedExerciseCount as number, totalExercises);
  }

  const furthestPageIndex = getFurthestPageIndex(progress, totalPages);
  if (furthestPageIndex < 0) return 0;
  return Math.min(99, Math.round(((furthestPageIndex + 1) / totalPages) * 100));
}
