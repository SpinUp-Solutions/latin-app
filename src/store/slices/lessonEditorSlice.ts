import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Lesson, Page } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';
import { TooltipData } from '@/src/types/tooltip';
import { regeneratePageIds } from '@/src/utils/idUtils';
import type { TestVersion } from '@/src/types/test';
import {
  getPageDocumentDraftKey,
  lessonToPageDocumentDraft,
  testVersionToPageDocumentDraft,
  type PageDocumentDraft,
} from '@/src/lib/page-document-draft';

interface PageDocumentDraftRecord {
  document: PageDocumentDraft;
  lastModified: string;
}

interface LessonEditorState {
  currentLesson: Lesson | null;
  currentPageDocument: PageDocumentDraft | null;
  drafts: Record<string, PageDocumentDraftRecord>;
  editingContent: {
    content: RenderableContentItem;
    pageIndex: number;
    itemIndex: number;
  } | null;
  isModalOpen: boolean;
  tooltips: Record<string, TooltipData>;
  dirty: boolean;
  error: string | null;
}

const initialState: LessonEditorState = {
  currentLesson: null,
  currentPageDocument: null,
  drafts: {},
  editingContent: null,
  isModalOpen: false,
  tooltips: {},
  dirty: false,
  error: null,
};

const DRAFTS_KEY = 'page_document_drafts';
const LEGACY_DRAFTS_KEY = 'lesson_drafts';

function getEditablePages(state: LessonEditorState) {
  return state.currentPageDocument?.pages ?? state.currentLesson?.pages;
}

export const loadDrafts = createAsyncThunk('lessonEditor/loadDrafts', (_, { rejectWithValue }) => {
  try {
    const draftsData = sessionStorage.getItem(DRAFTS_KEY);
    if (draftsData) return JSON.parse(draftsData) as Record<string, PageDocumentDraftRecord>;

    const legacyData = sessionStorage.getItem(LEGACY_DRAFTS_KEY);
    if (!legacyData) return {};
    const legacyDrafts = JSON.parse(legacyData) as Record<string, { lesson: Lesson; lastModified: string }>;
    const migratedDrafts = Object.fromEntries(
      Object.values(legacyDrafts).map(draft => {
        const document = lessonToPageDocumentDraft(draft.lesson);
        return [getPageDocumentDraftKey('lesson', draft.lesson.id), { document, lastModified: draft.lastModified }];
      })
    );
    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(migratedDrafts));
    sessionStorage.removeItem(LEGACY_DRAFTS_KEY);
    return migratedDrafts;
  } catch {
    return rejectWithValue('Failed to load drafts');
  }
});

export const saveDraft = createAsyncThunk(
  'lessonEditor/saveDraft',
  async (lesson: Lesson, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { lessonEditor: LessonEditorState };
      const drafts = { ...state.lessonEditor.drafts };
      const timestamp = new Date().toISOString();

      const document = lessonToPageDocumentDraft(lesson, state.lessonEditor.tooltips);
      const draftKey = getPageDocumentDraftKey('lesson', lesson.id);
      drafts[draftKey] = { document, lastModified: timestamp };
      sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      return { draftKey, draft: { document, lastModified: timestamp } };
    } catch {
      return rejectWithValue('Failed to save draft');
    }
  }
);

export const clearDraft = createAsyncThunk(
  'lessonEditor/clearDraft',
  async (lessonId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { lessonEditor: LessonEditorState };
      const drafts = { ...state.lessonEditor.drafts };
      const draftKey = getPageDocumentDraftKey('lesson', lessonId);
      delete drafts[draftKey];
      sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      return draftKey;
    } catch {
      return rejectWithValue('Failed to clear draft');
    }
  }
);

export const savePageDocumentDraft = createAsyncThunk(
  'lessonEditor/savePageDocumentDraft',
  async (document: PageDocumentDraft, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { lessonEditor: LessonEditorState };
      const drafts = { ...state.lessonEditor.drafts };
      const lastModified = new Date().toISOString();
      const draftKey = getPageDocumentDraftKey(document.editorKind, document.ownerId);
      const draft = { document, lastModified };
      drafts[draftKey] = draft;
      sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      return { draftKey, draft };
    } catch {
      return rejectWithValue('Failed to save draft');
    }
  }
);

export const clearPageDocumentDraft = createAsyncThunk(
  'lessonEditor/clearPageDocumentDraft',
  async ({ editorKind, ownerId }: Pick<PageDocumentDraft, 'editorKind' | 'ownerId'>, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { lessonEditor: LessonEditorState };
      const drafts = { ...state.lessonEditor.drafts };
      const draftKey = getPageDocumentDraftKey(editorKind, ownerId);
      delete drafts[draftKey];
      sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      return draftKey;
    } catch {
      return rejectWithValue('Failed to clear draft');
    }
  }
);

const lessonEditorSlice = createSlice({
  name: 'lessonEditor',
  initialState,
  reducers: {
    setLesson: (state, action: PayloadAction<Lesson | undefined>) => {
      state.currentPageDocument = null;
      state.currentLesson = action.payload
        ? {
            ...action.payload,
            practiceCategoryIds:
              action.payload.practiceCategoryIds ??
              action.payload.practiceCategories?.map(category => category.id) ??
              [],
          }
        : {
            id: `lesson-${Date.now()}`,
            title: 'New Lesson',
            description: '',
            type: 'normal',
            pages: [],
            isLive: false,
            liveOrder: null,
            publishedAt: null,
            publishedBy: null,
            practiceCategoryIds: [],
            practiceCategories: [],
          };
      state.error = null;
      state.dirty = false;
    },

    setTestVersion: (state, action: PayloadAction<TestVersion>) => {
      state.currentLesson = null;
      state.currentPageDocument = testVersionToPageDocumentDraft(action.payload);
      state.tooltips = {};
      state.error = null;
      state.dirty = false;
    },

    updatePageDocumentInfo: (state, action: PayloadAction<Partial<Pick<PageDocumentDraft, 'ownerId' | 'title' | 'description'>>>) => {
      if (!state.currentPageDocument) return;
      Object.assign(state.currentPageDocument, action.payload);
      state.dirty = true;
    },

    updateLessonInfo: (
      state,
      action: PayloadAction<
        Partial<
          Pick<
            Lesson,
            'id' | 'title' | 'description' | 'type' | 'vocabulary_pool' | 'practiceCategoryIds' | 'practiceCategories'
          >
        >
      >
    ) => {
      if (state.currentLesson) {
        Object.assign(state.currentLesson, action.payload);
        state.dirty = true;
      }
    },

    addPage: state => {
      const pages = getEditablePages(state);
      if (pages) {
        const newPage: Page = {
          id: `page-${Date.now()}`,
          title: 'New Page',
          items: [],
          audioPath: null,
        };
        pages.push(newPage);
        state.dirty = true;
      }
    },

    updatePageTitle: (
      state,
      action: PayloadAction<{
        pageIndex: number;
        title: string;
      }>
    ) => {
      const { pageIndex, title } = action.payload;
      const pages = getEditablePages(state);
      if (pages?.[pageIndex]) {
        pages[pageIndex].title = title;
        state.dirty = true;
      }
    },

    updatePageAutoAdvance: (
      state,
      action: PayloadAction<{
        pageIndex: number;
        autoAdvance: { enabled: boolean; delay: number };
      }>
    ) => {
      const { pageIndex, autoAdvance } = action.payload;
      const pages = getEditablePages(state);
      if (pages?.[pageIndex]) {
        pages[pageIndex].autoAdvance = autoAdvance;
        state.dirty = true;
      }
    },

    addContentToPage: (
      state,
      action: PayloadAction<{
        pageIndex: number;
        content: RenderableContentItem;
      }>
    ) => {
      const { pageIndex, content } = action.payload;
      const pages = getEditablePages(state);
      if (pages?.[pageIndex]) {
        pages[pageIndex].items.push(content);
        state.dirty = true;
      }
    },

    updateContentItem: (
      state,
      action: PayloadAction<{
        pageIndex: number;
        itemIndex: number;
        content: RenderableContentItem;
      }>
    ) => {
      const { pageIndex, itemIndex, content } = action.payload;
      const pages = getEditablePages(state);
      if (pages?.[pageIndex]) {
        pages[pageIndex].items[itemIndex] = content;
        state.dirty = true;
      }
    },

    removeContent: (
      state,
      action: PayloadAction<{
        pageIndex: number;
        itemIndex: number;
      }>
    ) => {
      const { pageIndex, itemIndex } = action.payload;
      const pages = getEditablePages(state);
      if (pages?.[pageIndex]) {
        pages[pageIndex].items.splice(itemIndex, 1);
        state.dirty = true;
      }
    },

    removePage: (
      state,
      action: PayloadAction<{
        pageIndex: number;
      }>
    ) => {
      const { pageIndex } = action.payload;
      const pages = getEditablePages(state);
      if (pages?.[pageIndex]) {
        pages.splice(pageIndex, 1);
        state.dirty = true;
      }
    },

    duplicatePage: (
      state,
      action: PayloadAction<{
        pageIndex: number;
      }>
    ) => {
      const { pageIndex } = action.payload;
      const pages = getEditablePages(state);
      if (pages?.[pageIndex]) {
        const pageToDuplicate = pages[pageIndex];
        const { page: newPage, tooltips: newTooltips } = regeneratePageIds(pageToDuplicate, state.tooltips);
        pages.splice(pageIndex + 1, 0, newPage);
        state.tooltips = { ...state.tooltips, ...newTooltips };
        state.dirty = true;
      }
    },

    startEditingContent: (
      state,
      action: PayloadAction<{
        pageIndex: number;
        itemIndex: number;
      }>
    ) => {
      const { pageIndex, itemIndex } = action.payload;
      const pages = getEditablePages(state);
      if (pages?.[pageIndex]?.items[itemIndex]) {
        state.editingContent = {
          content: JSON.parse(JSON.stringify(pages[pageIndex].items[itemIndex])),
          pageIndex,
          itemIndex,
        };
        state.isModalOpen = true;
      }
    },

    updateEditingContent: (state, action: PayloadAction<RenderableContentItem>) => {
      if (state.editingContent) {
        state.editingContent.content = action.payload;
        const pages = getEditablePages(state);
        if (pages) {
          const { pageIndex, itemIndex } = state.editingContent;
          pages[pageIndex].items[itemIndex] = action.payload;
          state.dirty = true;
        }
      }
    },

    saveEditingContent: state => {
      const pages = getEditablePages(state);
      if (state.editingContent && pages) {
        const { pageIndex, itemIndex, content } = state.editingContent;
        pages[pageIndex].items[itemIndex] = content;
        state.editingContent = null;
        state.isModalOpen = false;
        state.dirty = true;
      }
    },

    cancelEditing: state => {
      state.editingContent = null;
      state.isModalOpen = false;
    },

    clearError: state => {
      state.error = null;
    },

    resetLessonState: state => {
      state.currentLesson = null;
      state.currentPageDocument = null;
      state.editingContent = null;
      state.error = null;
      state.dirty = false;
    },

    addTooltip: (state, action: PayloadAction<{ id: string; data: Omit<TooltipData, 'id'> }>) => {
      const { id, data } = action.payload;
      state.tooltips[id] = { ...data, id };
      state.dirty = true;
    },

    removeTooltip: (state, action: PayloadAction<string>) => {
      delete state.tooltips[action.payload];
      state.dirty = true;
    },

    clearTooltips: state => {
      state.tooltips = {};
    },

    loadTooltips: (state, action: PayloadAction<Record<string, TooltipData>>) => {
      state.tooltips = { ...state.tooltips, ...action.payload };
    },

    reorderPages: (
      state,
      action: PayloadAction<{
        fromIndex: number;
        toIndex: number;
      }>
    ) => {
      const { fromIndex, toIndex } = action.payload;
      const pages = getEditablePages(state);
      if (pages && fromIndex !== toIndex) {
        const [movedPage] = pages.splice(fromIndex, 1);
        pages.splice(toIndex, 0, movedPage);
        state.dirty = true;
      }
    },

    reorderContentItems: (
      state,
      action: PayloadAction<{
        pageIndex: number;
        fromIndex: number;
        toIndex: number;
      }>
    ) => {
      const { pageIndex, fromIndex, toIndex } = action.payload;
      const pages = getEditablePages(state);
      if (pages && fromIndex !== toIndex) {
        const items = pages[pageIndex].items;
        const [movedItem] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, movedItem);
        state.dirty = true;
      }
    },

    setDirty: (state, action: PayloadAction<boolean>) => {
      state.dirty = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadDrafts.fulfilled, (state, action) => {
        state.drafts = action.payload;
      })
      .addCase(saveDraft.fulfilled, (state, action) => {
        state.drafts[action.payload.draftKey] = action.payload.draft;
      })
      .addCase(clearDraft.fulfilled, (state, action) => {
        delete state.drafts[action.payload];
      })
      .addCase(savePageDocumentDraft.fulfilled, (state, action) => {
        state.drafts[action.payload.draftKey] = action.payload.draft;
      })
      .addCase(clearPageDocumentDraft.fulfilled, (state, action) => {
        delete state.drafts[action.payload];
      });
  },
});

export const {
  setLesson,
  setTestVersion,
  updatePageDocumentInfo,
  updateLessonInfo,
  addPage,
  updatePageTitle,
  updatePageAutoAdvance,
  addContentToPage,
  updateContentItem,
  removeContent,
  removePage,
  duplicatePage,
  startEditingContent,
  updateEditingContent,
  saveEditingContent,
  cancelEditing,
  clearError,
  resetLessonState,
  addTooltip,
  removeTooltip,
  clearTooltips,
  loadTooltips,
  reorderPages,
  reorderContentItems,
  setDirty,
} = lessonEditorSlice.actions;

export const selectHasDraft = (state: { lessonEditor: LessonEditorState }, lessonId: string) =>
  Boolean(state.lessonEditor.drafts[getPageDocumentDraftKey('lesson', lessonId)]);

export const selectDraftLastModified = (state: { lessonEditor: LessonEditorState }, lessonId: string) =>
  state.lessonEditor.drafts[getPageDocumentDraftKey('lesson', lessonId)]?.lastModified;

export const selectDraft = (state: { lessonEditor: LessonEditorState }, lessonId: string) =>
  state.lessonEditor.drafts[getPageDocumentDraftKey('lesson', lessonId)];

export const selectPageDocumentDraft = (
  state: { lessonEditor: LessonEditorState },
  editorKind: PageDocumentDraft['editorKind'],
  ownerId: string
) => state.lessonEditor.drafts[getPageDocumentDraftKey(editorKind, ownerId)];

export default lessonEditorSlice.reducer;
