import { createSlice, createAsyncThunk, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { Lesson, Page, LessonWithProgress } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';
import { lessonService } from '@/src/services/lessonService';
import { TooltipData } from '@/src/types/tooltip';
import { extractTooltipsFromLesson } from '@/src/utils/tooltipUtils';
import { getLiveLessonsSorted } from '@/src/utils/lessonUtils';

interface LessonState {
  currentLesson: Lesson | null;
  drafts: Record<string, { lesson: Lesson; lastModified: string }>;
  editingContent: {
    content: RenderableContentItem;
    pageIndex: number;
    itemIndex: number;
  } | null;
  isModalOpen: boolean;

  lessons: Lesson[];
  studentLessons: LessonWithProgress[];

  loading: boolean;
  saving: boolean;
  error: string | null;
  lastSavedLesson: Lesson | null;

  tooltips: Record<string, TooltipData>;
}

const initialState: LessonState = {
  currentLesson: null,
  drafts: {},
  editingContent: null,
  isModalOpen: false,
  lessons: [],
  studentLessons: [],
  loading: false,
  saving: false,
  error: null,
  lastSavedLesson: null,
  tooltips: {},
};

const DRAFTS_KEY = 'lesson_drafts';

export const saveLesson = createAsyncThunk(
  'lesson/saveLesson',
  async ({ lesson, isUpdate }: { lesson: Lesson; isUpdate?: boolean }, { rejectWithValue }) => {
    try {
      const result = await lessonService.saveLesson(lesson, isUpdate);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const loadLessons = createAsyncThunk('lesson/loadLessons', async (_, { rejectWithValue }) => {
  try {
    const result = await lessonService.getLessons();
    return result.lessons as Lesson[];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load lessons';
    return rejectWithValue(errorMessage);
  }
});

export const loadStudentLessons = createAsyncThunk('lesson/loadStudentLessons', async (_, { rejectWithValue }) => {
  try {
    const result = await lessonService.getStudentLessons();
    return result.lessons;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load lessons';
    return rejectWithValue(errorMessage);
  }
});

export const loadLessonById = createAsyncThunk(
  'lesson/loadLessonById',
  async ({ lessonId, isStudent = false }: { lessonId: string; isStudent?: boolean }, { rejectWithValue }) => {
    try {
      let lesson;
      if (isStudent) {
        lesson = await lessonService.getLessonById(lessonId);
      } else {
        lesson = await lessonService.getLesson(lessonId);
      }
      const tooltips = extractTooltipsFromLesson(lesson);
      return { lesson: lesson as Lesson, tooltips };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const deleteLesson = createAsyncThunk('lesson/deleteLesson', async (lessonId: string, { rejectWithValue }) => {
  try {
    await lessonService.deleteLesson(lessonId);
    return lessonId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete lesson';
    return rejectWithValue(errorMessage);
  }
});

export const updateLessonsPublishStatus = createAsyncThunk(
  'lesson/updatePublishStatus',
  async (
    { lessonIds, isLive, startOrder }: { lessonIds: string[]; isLive: boolean; startOrder?: number },
    { rejectWithValue }
  ) => {
    try {
      const result = await lessonService.updatePublishStatus(lessonIds, isLive, startOrder);
      return { ...result, lessonIds, isLive };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const reorderLessons = createAsyncThunk(
  'lesson/reorderLessons',
  async (updates: { lessonId: string; liveOrder: number }[], { rejectWithValue }) => {
    try {
      const result = await lessonService.reorderLessons(updates);
      return { ...result, updates };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reorder lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const loadDrafts = createAsyncThunk('lesson/loadDrafts', (_, { rejectWithValue }) => {
  try {
    const draftsData = sessionStorage.getItem(DRAFTS_KEY);
    return draftsData ? JSON.parse(draftsData) : {};
  } catch (error) {
    console.error('Error loading drafts from storage:', error);
    return rejectWithValue('Failed to load drafts');
  }
});

export const saveDraft = createAsyncThunk('lesson/saveDraft', async (lesson: Lesson, { getState, rejectWithValue }) => {
  try {
    const state = getState() as { lesson: LessonState };
    const drafts = { ...state.lesson.drafts };
    const timestamp = new Date().toISOString();

    drafts[lesson.id] = { lesson, lastModified: timestamp };

    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    return { lessonId: lesson.id, draft: { lesson, lastModified: timestamp } };
  } catch (error) {
    console.error('Error saving draft to storage:', error);
    return rejectWithValue('Failed to save draft');
  }
});

export const clearDraft = createAsyncThunk(
  'lesson/clearDraft',
  async (lessonId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { lesson: LessonState };
      const drafts = { ...state.lesson.drafts };
      delete drafts[lessonId];

      sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      return lessonId;
    } catch (error) {
      console.error('Error clearing draft from storage:', error);
      return rejectWithValue('Failed to clear draft');
    }
  }
);

const lessonSlice = createSlice({
  name: 'lesson',
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

    clearLastSavedLesson: state => {
      state.lastSavedLesson = null;
    },

    resetLessonState: state => {
      state.currentLesson = null;
      state.editingContent = null;
      state.error = null;
      state.lastSavedLesson = null;
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

    localReorderLiveLessons: (state, action: PayloadAction<{ fromIndex: number; toIndex: number }>) => {
      const { fromIndex, toIndex } = action.payload;
      const liveLessons = getLiveLessonsSorted(state.lessons);

      if (fromIndex < liveLessons.length && toIndex < liveLessons.length) {
        const [removed] = liveLessons.splice(fromIndex, 1);
        liveLessons.splice(toIndex, 0, removed);

        liveLessons.forEach((lesson, index) => {
          const lessonInState = state.lessons.find(l => l.id === lesson.id);
          if (lessonInState) {
            lessonInState.liveOrder = index;
          }
        });
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(saveLesson.pending, state => {
        state.saving = true;
        state.error = null;
      })
      .addCase(saveLesson.fulfilled, (state, action) => {
        state.saving = false;
        state.error = null;
        state.lastSavedLesson = action.payload.lesson as Lesson;
        delete state.drafts[action.payload.lesson.id];

        if (state.currentLesson && state.currentLesson.id === action.payload.lesson.id) {
          state.currentLesson = action.payload.lesson;
        }

        const existingIndex = state.lessons.findIndex(l => l.id === action.payload.lesson.id);
        if (existingIndex >= 0) {
          state.lessons[existingIndex] = action.payload.lesson as Lesson;
        } else {
          state.lessons.unshift(action.payload.lesson as Lesson);
        }
      })
      .addCase(saveLesson.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      })

      .addCase(loadLessons.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadLessons.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.lessons = action.payload;
      })
      .addCase(loadLessons.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      .addCase(loadStudentLessons.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadStudentLessons.fulfilled, (state, action) => {
        state.loading = false;
        state.studentLessons = action.payload;
      })
      .addCase(loadStudentLessons.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      .addCase(loadLessonById.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadLessonById.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.currentLesson = action.payload.lesson;
        state.tooltips = action.payload.tooltips;
      })
      .addCase(loadLessonById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      .addCase(updateLessonsPublishStatus.pending, state => {
        state.error = null;
      })
      .addCase(updateLessonsPublishStatus.fulfilled, (state, action) => {
        const { lessonIds, isLive } = action.payload;
        let orderCounter = 0;

        if (isLive) {
          // Get current max order for new live lessons
          const maxOrder = Math.max(...state.lessons.filter(l => l.isLive).map(l => l.liveOrder || 0), -1);
          orderCounter = maxOrder + 1;
        }

        lessonIds.forEach(id => {
          const lesson = state.lessons.find(l => l.id === id);
          if (lesson) {
            lesson.isLive = isLive;
            lesson.liveOrder = isLive ? orderCounter++ : null;
            lesson.publishedAt = isLive ? new Date().toISOString() : null;
            lesson.publishedBy = isLive ? 'admin' : null;
          }
        });
      })
      .addCase(updateLessonsPublishStatus.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(reorderLessons.pending, state => {
        state.error = null;
      })
      .addCase(reorderLessons.fulfilled, (state, action) => {
        const { updates } = action.payload;
        updates.forEach(({ lessonId, liveOrder }) => {
          const lesson = state.lessons.find(l => l.id === lessonId);
          if (lesson) {
            lesson.liveOrder = liveOrder;
          }
        });
      })
      .addCase(reorderLessons.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(loadDrafts.fulfilled, (state, action) => {
        state.drafts = action.payload;
      })
      .addCase(saveDraft.fulfilled, (state, action) => {
        state.drafts[action.payload.lessonId] = action.payload.draft;
      })
      .addCase(clearDraft.fulfilled, (state, action) => {
        delete state.drafts[action.payload];
      })

      .addCase(deleteLesson.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteLesson.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.lessons = state.lessons.filter(l => l.id !== action.payload);

        if (state.currentLesson?.id === action.payload) {
          state.currentLesson = null;
        }
      })
      .addCase(deleteLesson.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setLesson,
  updateLessonInfo,
  addPage,
  updatePageTitle,
  addContentToPage,
  updateContentItem,
  removeContent,
  removePage,
  startEditingContent,
  updateEditingContent,
  saveEditingContent,
  cancelEditing,
  clearError,
  clearLastSavedLesson,
  resetLessonState,
  addTooltip,
  removeTooltip,
  clearTooltips,
  loadTooltips,
  reorderPages,
  reorderContentItems,
  localReorderLiveLessons,
} = lessonSlice.actions;

export const selectHasDraft = (state: { lesson: LessonState }, lessonId: string) =>
  Boolean(state.lesson.drafts[lessonId]);

export const selectDraftLastModified = (state: { lesson: LessonState }, lessonId: string) =>
  state.lesson.drafts[lessonId]?.lastModified;

export const selectDraft = (state: { lesson: LessonState }, lessonId: string) => state.lesson.drafts[lessonId];

// Base selector for lessons
const selectLessons = (state: { lesson: LessonState }) => state.lesson.lessons;

// Parameterized selector for filtering lessons
export const selectFilteredLessons = createSelector(
  [
    selectLessons,
    (_: { lesson: LessonState }, filter: 'all' | 'live' | 'draft') => filter,
    (_: { lesson: LessonState }, __: 'all' | 'live' | 'draft', searchQuery: string = '') => searchQuery,
  ],
  (lessons, filter, searchQuery) => {
    let filtered = lessons;

    // Filter by status
    if (filter === 'live') {
      filtered = filtered.filter(l => l.isLive);
    } else if (filter === 'draft') {
      filtered = filtered.filter(l => !l.isLive);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        l => l.title.toLowerCase().includes(query) || l.description?.toLowerCase().includes(query) || false
      );
    }

    // Sort live lessons by order
    if (filter === 'live' || filter === 'all') {
      filtered = [...filtered].sort((a, b) => {
        if (a.isLive && b.isLive) {
          return (a.liveOrder || 0) - (b.liveOrder || 0);
        }
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        return 0;
      });
    }

    return filtered;
  }
);

// Convenience selectors using the parameterized selector
export const selectLiveLessons = (state: { lesson: LessonState }) => selectFilteredLessons(state, 'live', '');

export const selectAvailableLessons = (state: { lesson: LessonState }) => selectFilteredLessons(state, 'draft', '');

export const selectLessonById = (state: { lesson: LessonState }, lessonId: string) =>
  state.lesson.lessons.find(l => l.id === lessonId);

export default lessonSlice.reducer;
