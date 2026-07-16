import { configureStore } from '@reduxjs/toolkit';
import lessonEditorReducer, { saveDraft, setLesson, updateLessonInfo } from '@/src/store/slices/lessonEditorSlice';
import type { Lesson, LessonSummary } from '@/src/types/lesson';
import type { PracticeCategory } from '@/src/types/practice-category';
import {
  buildLessonMutationPayload,
  lessonMatchesPracticeCategory,
  lessonMatchesTextSearch,
} from '@/src/utils/practiceCategoryLessons';

const makeCategory = (id: string, name: string, status: PracticeCategory['status'] = 'active'): PracticeCategory => ({
  id,
  lessonType: 'vocab',
  name,
  normalizedName: name.toLocaleLowerCase(),
  status,
  categoryOrder: status === 'active' ? 0 : 1,
  createdAt: '2026-07-14T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2026-07-14T00:00:00.000Z',
  updatedBy: 'admin',
});

const activeCategory = makeCategory('authors', 'Authors');
const archivedCategory = makeCategory('archived-topics', 'Old topics', 'archived');

const makeLesson = (overrides: Partial<Lesson> = {}): Lesson => ({
  id: 'lesson-1',
  title: 'Caesar vocabulary',
  description: 'Words from Caesar',
  type: 'vocab',
  pages: [],
  isLive: false,
  liveOrder: null,
  publishedAt: null,
  publishedBy: null,
  ...overrides,
});

const makeSummary = (overrides: Partial<LessonSummary>): LessonSummary => ({
  ...makeLesson(),
  totalPages: 0,
  totalItems: 0,
  totalExercises: 0,
  ...overrides,
});

describe('practice-category lesson integration', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('normalizes joined active and archived assignments into editor IDs and preserves them in drafts', async () => {
    const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
    const lesson = makeLesson({ practiceCategories: [activeCategory, archivedCategory] });

    store.dispatch(setLesson(lesson));

    expect(store.getState().lessonEditor.currentLesson?.practiceCategoryIds).toEqual([
      activeCategory.id,
      archivedCategory.id,
    ]);

    store.dispatch(updateLessonInfo({ practiceCategoryIds: [archivedCategory.id] }));
    const currentLesson = store.getState().lessonEditor.currentLesson;
    expect(currentLesson).not.toBeNull();

    await store.dispatch(saveDraft(currentLesson!));

    const persistedDrafts = JSON.parse(sessionStorage.getItem('page_document_drafts') ?? '{}');
    expect(persistedDrafts[`lesson:${lesson.id}`].document.sourceLesson.practiceCategoryIds).toEqual([
      archivedCategory.id,
    ]);
    expect(store.getState().lessonEditor.dirty).toBe(true);
  });

  it('strips joined category objects from lesson writes while retaining the complete desired ID set', () => {
    const payload = buildLessonMutationPayload(
      makeLesson({
        practiceCategories: [activeCategory, archivedCategory],
        practiceCategoryPlacements: [{ categoryId: activeCategory.id, lessonOrder: 2 }],
      })
    );

    expect(payload).not.toHaveProperty('practiceCategories');
    expect(payload).not.toHaveProperty('practiceCategoryPlacements');
    expect(payload.practiceCategoryIds).toEqual([activeCategory.id, archivedCategory.id]);

    const clearedPayload = buildLessonMutationPayload(
      makeLesson({ practiceCategoryIds: [], practiceCategories: [archivedCategory] })
    );
    expect(clearedPayload.practiceCategoryIds).toEqual([]);
  });

  it('treats archived-only assignments as categorized and combines category filtering with search using AND semantics', () => {
    const lessons = [
      makeSummary({
        id: 'authors-lesson',
        title: 'Caesar vocabulary',
        practiceCategoryIds: [activeCategory.id],
        practiceCategories: [activeCategory],
      }),
      makeSummary({
        id: 'archived-lesson',
        title: 'Cicero vocabulary',
        description: 'An oratory collection',
        practiceCategoryIds: [archivedCategory.id],
        practiceCategories: [archivedCategory],
      }),
      makeSummary({
        id: 'uncategorized-lesson',
        title: 'Caesar syntax',
        practiceCategoryIds: [],
        practiceCategories: [],
      }),
    ];

    expect(lessonMatchesPracticeCategory(lessons[1], 'uncategorized')).toBe(false);
    expect(lessonMatchesPracticeCategory(lessons[2], 'uncategorized')).toBe(true);

    const matching = lessons.filter(
      lesson => lessonMatchesTextSearch(lesson, 'Caesar') && lessonMatchesPracticeCategory(lesson, activeCategory.id)
    );
    expect(matching.map(lesson => lesson.id)).toEqual(['authors-lesson']);
  });

  it('searches rich-text content without matching markup', () => {
    const lesson = makeSummary({
      title: '<p>Caesar vocabulary</p>',
      description: '<p>Words from Gaul</p>',
    });

    expect(lessonMatchesTextSearch(lesson, 'Gaul')).toBe(true);
    expect(lessonMatchesTextSearch(lesson, '<p>')).toBe(false);
  });
});
