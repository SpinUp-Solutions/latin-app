import type { UserProgress } from '@/src/types/lesson';
import { isStoredLessonComplete } from '@/src/utils/lessonProgress';

export interface ProgressionUnit {
  id: string;
  kind: 'lesson' | 'test';
  /** Lesson page count for the legacy completion fallback; undefined means unknown. */
  totalPages?: number;
}

export interface ProgressionActivity {
  /** Server-authored progress records keyed by unit ID. */
  progressByUnitId: ReadonlyMap<string, Partial<UserProgress>>;
  /** Normal tests with any persisted in-progress or submitted attempt. */
  attemptedTestIds: ReadonlySet<string>;
}

export function isProgressionLockingDisabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_PROGRESSION_LOCK === 'true';
}

export function isProgressionUnitComplete(unit: ProgressionUnit, activity: ProgressionActivity): boolean {
  const progress = activity.progressByUnitId.get(unit.id);
  if (unit.kind === 'test' || unit.totalPages === undefined) return progress?.status === 'completed';
  return isStoredLessonComplete(progress, unit.totalPages);
}

function hasReachedUnit(unit: ProgressionUnit, activity: ProgressionActivity): boolean {
  if (activity.progressByUnitId.has(unit.id)) return true;
  return unit.kind === 'test' && activity.attemptedTestIds.has(unit.id);
}

/**
 * The sticky-frontier progression rule shared by the dashboard projection and
 * the transactional write authorization: the first unit, every unit at or
 * behind the furthest reached unit, and the unit directly after a completed
 * one are unlocked.
 */
export function isProgressionUnitUnlocked(
  units: readonly ProgressionUnit[],
  targetIndex: number,
  activity: ProgressionActivity
): boolean {
  if (targetIndex < 0 || targetIndex >= units.length) return false;
  if (isProgressionLockingDisabled() || targetIndex === 0) return true;
  const reachedFrontier = units.reduce(
    (frontier, unit, index) => (hasReachedUnit(unit, activity) ? Math.max(frontier, index) : frontier),
    -1
  );
  if (targetIndex <= reachedFrontier) return true;
  return isProgressionUnitComplete(units[targetIndex - 1], activity);
}

interface AttemptActivityRecord {
  origin?: { kind?: unknown; testId?: unknown };
  status?: unknown;
}

/** Projects persisted attempt records onto the sticky-frontier attempt signal. */
export function collectAttemptedNormalTestIds(attempts: readonly AttemptActivityRecord[]): Set<string> {
  const attempted = new Set<string>();
  for (const attempt of attempts) {
    if (
      attempt.origin?.kind === 'normal-test' &&
      typeof attempt.origin.testId === 'string' &&
      (attempt.status === 'in-progress' || attempt.status === 'submitted')
    ) {
      attempted.add(attempt.origin.testId);
    }
  }
  return attempted;
}
