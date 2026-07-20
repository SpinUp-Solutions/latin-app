import type { Lesson, LessonSummary } from '@/src/types/lesson';
import type { PracticeLessonType } from '@/src/types/practice-category';
import { PRACTICE_LESSON_TYPES } from '@/src/types/practice-category';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';

export type PracticeCategoryFilter = 'all' | 'uncategorized' | string;

export function isPracticeLessonType(type: Lesson['type']): type is PracticeLessonType {
  return (PRACTICE_LESSON_TYPES as readonly string[]).includes(type);
}

/**
 * Explicit IDs are authoritative, including an empty array after the admin
 * removes every assignment. Joined objects are only a response fallback.
 */
export function getLessonPracticeCategoryIds(
  lesson: Pick<Lesson, 'practiceCategoryIds' | 'practiceCategories'>
): string[] {
  return lesson.practiceCategoryIds ?? lesson.practiceCategories?.map(category => category.id) ?? [];
}

export function lessonMatchesPracticeCategory(
  lesson: Pick<Lesson, 'practiceCategoryIds' | 'practiceCategories'>,
  categoryFilter: PracticeCategoryFilter
): boolean {
  if (categoryFilter === 'all') return true;
  const assignedIds = getLessonPracticeCategoryIds(lesson);
  if (categoryFilter === 'uncategorized') return assignedIds.length === 0;
  return assignedIds.includes(categoryFilter);
}

export function lessonMatchesTextSearch(
  lesson: Pick<LessonSummary, 'title' | 'description'>,
  searchQuery: string
): boolean {
  const query = searchQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  const title = stripHtmlTags(lesson.title).toLocaleLowerCase();
  const description = stripHtmlTags(lesson.description ?? '').toLocaleLowerCase();
  return title.includes(query) || description.includes(query);
}

/** Strip response-only category data while retaining the desired ID set. */
export function buildLessonMutationPayload(lesson: Lesson): Omit<
  Lesson,
  'practiceCategories' | 'practiceCategoryPlacements'
> & {
  practiceCategoryIds: string[];
} {
  const { practiceCategories, practiceCategoryPlacements: _practiceCategoryPlacements, ...lessonData } = lesson;
  return {
    ...lessonData,
    practiceCategoryIds: lesson.practiceCategoryIds ?? practiceCategories?.map(category => category.id) ?? [],
  };
}
