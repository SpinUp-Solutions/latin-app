import type { PracticeLessonType } from '@/src/types/practice-category';
import { PRACTICE_LESSON_TYPES } from '@/src/types/practice-category';

export type CategorisableLessonCandidate = {
  kind?: unknown;
  type?: unknown;
};

export function normalizeCategoryName(name: string): string {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en');
}

export function isPracticeLessonType(type: unknown): type is PracticeLessonType {
  return typeof type === 'string' && (PRACTICE_LESSON_TYPES as readonly string[]).includes(type);
}

/**
 * Legacy lesson documents have no kind. Future persisted units must explicitly be
 * kind=lesson; tests and other learning-unit kinds are never categorisable.
 */
export function isCategorisableLesson(
  candidate: CategorisableLessonCandidate | null | undefined
): candidate is CategorisableLessonCandidate & { kind?: 'lesson'; type: PracticeLessonType } {
  if (!candidate) return false;
  const kind = candidate.kind === undefined ? 'lesson' : candidate.kind;
  return kind === 'lesson' && isPracticeLessonType(candidate.type);
}
