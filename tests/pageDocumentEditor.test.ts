import reducer, {
  addContentToPage,
  addPage,
  setLesson,
  setTestVersion,
  updateContentItem,
} from '@/src/store/slices/lessonEditorSlice';
import { createNewContent } from '@/src/utils/contentFactory';
import { getPageDocumentDraftKey, pageDocumentDraftToTestVersion } from '@/src/lib/page-document-draft';
import { getTestVersionSummaryFields } from '@/src/lib/tests/domain';
import type { Lesson } from '@/src/types/lesson';
import type { TestVersion } from '@/src/types/test';

const version: TestVersion = {
  id: 'version-a',
  name: 'Version A',
  pages: [],
  totalPages: 0,
  totalItems: 0,
  totalExercises: 0,
  totalPoints: 0,
};

describe('shared page document editor', () => {
  it('keeps lesson and test-version draft identities separate', () => {
    expect(getPageDocumentDraftKey('lesson', 'same-id')).toBe('lesson:same-id');
    expect(getPageDocumentDraftKey('test-version', 'same-id')).toBe('test-version:same-id');
  });

  it('stores points inline and derives the saved version summary from pages', () => {
    let state = reducer(undefined, setTestVersion(version));
    state = reducer(state, addPage());

    const exercise = createNewContent('multiple-choice', 'test-version');
    state = reducer(state, addContentToPage({ pageIndex: 0, content: exercise }));
    state = reducer(state, updateContentItem({
      pageIndex: 0,
      itemIndex: 0,
      content: { ...exercise, maxPoints: 4 },
    }));

    expect(state.currentLesson).toBeNull();
    expect(state.currentPageDocument?.pages[0].items[0].maxPoints).toBe(4);

    const document = state.currentPageDocument!;
    const saved = pageDocumentDraftToTestVersion(document, getTestVersionSummaryFields(document.pages));
    expect(saved).toMatchObject({ totalPages: 1, totalItems: 1, totalExercises: 1, totalPoints: 4 });
  });

  it('does not add scoring metadata in the lesson editor', () => {
    const lesson: Lesson = {
      id: 'lesson-a',
      title: 'Lesson',
      description: '',
      type: 'normal',
      pages: [],
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
    };
    let state = reducer(undefined, setLesson(lesson));
    state = reducer(state, addPage());
    const exercise = createNewContent('multiple-choice');
    state = reducer(state, addContentToPage({ pageIndex: 0, content: exercise }));

    expect(state.currentLesson?.pages[0].items[0].maxPoints).toBeUndefined();
    expect(state.currentPageDocument).toBeNull();
  });
});
