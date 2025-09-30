import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Lesson, Page } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';
import { TooltipData } from '@/src/types/tooltip';

interface LessonEditorState {
  currentLesson: Lesson | null;
  drafts: Record<string, { lesson: Lesson; lastModified: string }>;
  editingContent: {
    content: RenderableContentItem;
    pageIndex: number;
    itemIndex: number;
  } | null;
  isModalOpen: boolean;
  tooltips: Record<string, TooltipData>;
  saving: boolean;
  error: string | null;
}

const initialState: LessonEditorState = {
  currentLesson: null,
  drafts: {},
  editingContent: null,
  isModalOpen: false,
  tooltips: {},
  saving: false,
  error: null,
};

const DRAFTS_KEY = 'lesson_drafts';

export const loadDrafts = createAsyncThunk('lessonEditor/loadDrafts', (_, { rejectWithValue }) => {
  try {
    const draftsData = sessionStorage.getItem(DRAFTS_KEY);
    return draftsData ? JSON.parse(draftsData) : {};
  } catch (error) {
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

      drafts[lesson.id] = { lesson, lastModified: timestamp };
      sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      return { lessonId: lesson.id, draft: { lesson, lastModified: timestamp } };
    } catch (error) {
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
      delete drafts[lessonId];
      sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      return lessonId;
    } catch (error) {
      return rejectWithValue('Failed to clear draft');
    }
  }
);

const lessonEditorSlice = createSlice({
  name: 'lessonEditor',
  initialState,
  reducers: {
    setLesson: (state, action: PayloadAction<Lesson | undefined>) => {
      state.currentLesson = action.payload || {
        id: `lesson-${Date.now()}`,
        title: 'New Lesson',
        description: '',
        pages: [],
        isLive: false,
        liveOrder: null,
        publishedAt: null,
        publishedBy: null,
      };
      state.error = null;
    },

    updateLessonInfo: (state, action: PayloadAction<Partial<Pick<Lesson, 'id' | 'title' | 'description'>>>) => {
      if (state.currentLesson) {
        Object.assign(state.currentLesson, action.payload);
      }
    },

    addPage: state => {
      if (state.currentLesson) {
        const newPage: Page = {
          id: `page-${Date.now()}`,
          title: 'New Page',
          items: [],
          audioPath: null,
        };
        state.currentLesson.pages.push(newPage);
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
      if (state.currentLesson) {
        state.currentLesson.pages[pageIndex].title = title;
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
      if (state.currentLesson?.pages[pageIndex]) {
        state.currentLesson.pages[pageIndex].autoAdvance = autoAdvance;
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
      if (state.currentLesson) {
        state.currentLesson.pages[pageIndex].items.push(content);
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
      if (state.currentLesson) {
        state.currentLesson.pages[pageIndex].items[itemIndex] = content;
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
      if (state.currentLesson) {
        state.currentLesson.pages[pageIndex].items.splice(itemIndex, 1);
      }
    },

    removePage: (
      state,
      action: PayloadAction<{
        pageIndex: number;
      }>
    ) => {
      const { pageIndex } = action.payload;
      if (state.currentLesson) {
        state.currentLesson.pages.splice(pageIndex, 1);
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
      if (state.currentLesson) {
        state.editingContent = {
          content: JSON.parse(JSON.stringify(state.currentLesson.pages[pageIndex].items[itemIndex])),
          pageIndex,
          itemIndex,
        };
        state.isModalOpen = true;
      }
    },

    updateEditingContent: (state, action: PayloadAction<RenderableContentItem>) => {
      if (state.editingContent) {
        state.editingContent.content = action.payload;
        if (state.currentLesson) {
          const { pageIndex, itemIndex } = state.editingContent;
          state.currentLesson.pages[pageIndex].items[itemIndex] = action.payload;
        }
      }
    },

    saveEditingContent: state => {
      if (state.editingContent && state.currentLesson) {
        const { pageIndex, itemIndex, content } = state.editingContent;
        state.currentLesson.pages[pageIndex].items[itemIndex] = content;
        state.editingContent = null;
        state.isModalOpen = false;
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
      state.editingContent = null;
      state.error = null;
    },

    addTooltip: (state, action: PayloadAction<{ id: string; data: Omit<TooltipData, 'id'> }>) => {
      const { id, data } = action.payload;
      state.tooltips[id] = { ...data, id };
    },

    removeTooltip: (state, action: PayloadAction<string>) => {
      delete state.tooltips[action.payload];
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
      if (state.currentLesson && fromIndex !== toIndex) {
        const pages = state.currentLesson.pages;
        const [movedPage] = pages.splice(fromIndex, 1);
        pages.splice(toIndex, 0, movedPage);
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
      if (state.currentLesson && fromIndex !== toIndex) {
        const items = state.currentLesson.pages[pageIndex].items;
        const [movedItem] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, movedItem);
      }
    },

    setSaving: (state, action: PayloadAction<boolean>) => {
      state.saving = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadDrafts.fulfilled, (state, action) => {
        state.drafts = action.payload;
      })
      .addCase(saveDraft.fulfilled, (state, action) => {
        state.drafts[action.payload.lessonId] = action.payload.draft;
      })
      .addCase(clearDraft.fulfilled, (state, action) => {
        delete state.drafts[action.payload];
      });
  },
});

export const {
  setLesson,
  updateLessonInfo,
  addPage,
  updatePageTitle,
  updatePageAutoAdvance,
  addContentToPage,
  updateContentItem,
  removeContent,
  removePage,
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
  setSaving,
} = lessonEditorSlice.actions;

export const selectHasDraft = (state: { lessonEditor: LessonEditorState }, lessonId: string) =>
  Boolean(state.lessonEditor.drafts[lessonId]);

export const selectDraftLastModified = (state: { lessonEditor: LessonEditorState }, lessonId: string) =>
  state.lessonEditor.drafts[lessonId]?.lastModified;

export const selectDraft = (state: { lessonEditor: LessonEditorState }, lessonId: string) =>
  state.lessonEditor.drafts[lessonId];

export default lessonEditorSlice.reducer;
