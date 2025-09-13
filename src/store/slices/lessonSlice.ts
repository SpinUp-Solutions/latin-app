import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Lesson, IntroductionPage, ExercisePage, LessonWithProgress } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';
import { lessonService } from '@/src/services/lessonService';
import { TooltipData } from '@/src/types/tooltip';
import { extractTooltipsFromLesson } from '@/src/utils/tooltipUtils';

interface LessonWithMetadata extends Lesson {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
}

interface LessonState {
  currentLesson: Lesson | null;
  drafts: Record<string, { lesson: Lesson; lastModified: string }>;
  editingContent: {
    content: RenderableContentItem;
    pageType: 'introduction' | 'exercises';
    pageIndex: number;
    itemIndex: number;
  } | null;
  isModalOpen: boolean;

  lessons: LessonWithMetadata[];
  studentLessons: LessonWithProgress[];
  
  loading: boolean;
  saving: boolean;
  error: string | null;
  lastSavedLesson: LessonWithMetadata | null;

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
    return result.lessons as LessonWithMetadata[];
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
      return { lesson: lesson as LessonWithMetadata, tooltips };
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

export const publishLesson = createAsyncThunk(
  'lesson/publishLesson',
  async ({ lessonId, order }: { lessonId: string; order?: number }, { rejectWithValue }) => {
    try {
      const result = await lessonService.publishLesson(lessonId, order);
      return { ...result, lessonId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const unpublishLesson = createAsyncThunk(
  'lesson/unpublishLesson',
  async (lessonId: string, { rejectWithValue }) => {
    try {
      const result = await lessonService.unpublishLesson(lessonId);
      return { ...result, lessonId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unpublish lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const reorderLiveLessons = createAsyncThunk(
  'lesson/reorderLiveLessons',
  async (lessons: { lessonId: string; order: number }[], { rejectWithValue }) => {
    try {
      const result = await lessonService.reorderLiveLessons(lessons);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reorder lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const batchPublishLessons = createAsyncThunk(
  'lesson/batchPublish',
  async (lessonIds: string[], { rejectWithValue }) => {
    try {
      const result = await lessonService.batchPublish(lessonIds);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const batchUnpublishLessons = createAsyncThunk(
  'lesson/batchUnpublish',
  async (lessonIds: string[], { rejectWithValue }) => {
    try {
      const result = await lessonService.batchUnpublish(lessonIds);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unpublish lessons';
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
        introduction: [],
        exercises: [],
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

    addIntroductionPage: state => {
      if (state.currentLesson) {
        const newPage: IntroductionPage = {
          id: `intro-page-${Date.now()}`,
          title: 'New Introduction Page',
          items: [],
          audioPath: null,
        };
        state.currentLesson.introduction.push(newPage);
      }
    },

    addExercisePage: state => {
      if (state.currentLesson) {
        const newPage: ExercisePage = {
          id: `exercise-page-${Date.now()}`,
          title: 'New Exercise Page',
          items: [],
          audioPath: null,
        };
        state.currentLesson.exercises.push(newPage);
      }
    },

    updatePageTitle: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        title: string;
      }>
    ) => {
      const { pageType, pageIndex, title } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType][pageIndex].title = title;
      }
    },

    addContentToPage: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        content: RenderableContentItem;
      }>
    ) => {
      const { pageType, pageIndex, content } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType][pageIndex].items.push(content);
      }
    },

    updateContentItem: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        itemIndex: number;
        content: RenderableContentItem;
      }>
    ) => {
      const { pageType, pageIndex, itemIndex, content } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType][pageIndex].items[itemIndex] = content;
      }
    },

    removeContent: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        itemIndex: number;
      }>
    ) => {
      const { pageType, pageIndex, itemIndex } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType][pageIndex].items.splice(itemIndex, 1);
      }
    },

    removePage: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
      }>
    ) => {
      const { pageType, pageIndex } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType].splice(pageIndex, 1);
      }
    },

    startEditingContent: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        itemIndex: number;
      }>
    ) => {
      const { pageType, pageIndex, itemIndex } = action.payload;
      if (state.currentLesson) {
        state.editingContent = {
          content: JSON.parse(JSON.stringify(state.currentLesson[pageType][pageIndex].items[itemIndex])),
          pageType,
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
          const { pageType, pageIndex, itemIndex } = state.editingContent;
          state.currentLesson[pageType][pageIndex].items[itemIndex] = action.payload;
        }
      }
    },

    saveEditingContent: state => {
      if (state.editingContent && state.currentLesson) {
        const { pageType, pageIndex, itemIndex, content } = state.editingContent;
        state.currentLesson[pageType][pageIndex].items[itemIndex] = content;
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
        pageType: 'introduction' | 'exercises';
        fromIndex: number;
        toIndex: number;
      }>
    ) => {
      const { pageType, fromIndex, toIndex } = action.payload;
      if (state.currentLesson && fromIndex !== toIndex) {
        const pages = state.currentLesson[pageType];
        const [movedPage] = pages.splice(fromIndex, 1);
        pages.splice(toIndex, 0, movedPage);
      }
    },

    reorderContentItems: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        fromIndex: number;
        toIndex: number;
      }>
    ) => {
      const { pageType, pageIndex, fromIndex, toIndex } = action.payload;
      if (state.currentLesson && fromIndex !== toIndex) {
        const items = state.currentLesson[pageType][pageIndex].items;
        const [movedItem] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, movedItem);
      }
    },

    localReorderLiveLessons: (state, action: PayloadAction<{ fromIndex: number; toIndex: number }>) => {
      const { fromIndex, toIndex } = action.payload;
      const liveLessons = state.lessons.filter(l => l.isLive).sort((a, b) => (a.liveOrder || 0) - (b.liveOrder || 0));
      
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
        state.lastSavedLesson = action.payload.lesson as LessonWithMetadata;
        delete state.drafts[action.payload.lesson.id];

        if (state.currentLesson && state.currentLesson.id === action.payload.lesson.id) {
          state.currentLesson = action.payload.lesson;
        }

        const existingIndex = state.lessons.findIndex(l => l.id === action.payload.lesson.id);
        if (existingIndex >= 0) {
          state.lessons[existingIndex] = action.payload.lesson as LessonWithMetadata;
        } else {
          state.lessons.unshift(action.payload.lesson as LessonWithMetadata);
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

      .addCase(publishLesson.pending, state => {
        state.error = null;
      })
      .addCase(publishLesson.fulfilled, (state, action) => {
        const lesson = state.lessons.find(l => l.id === action.meta.arg.lessonId);
        if (lesson) {
          lesson.isLive = true;
          lesson.publishedAt = new Date().toISOString();
          lesson.publishedBy = 'admin';
          lesson.liveOrder = action.meta.arg.order ?? state.lessons.filter(l => l.isLive).length;
        }
      })
      .addCase(publishLesson.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(unpublishLesson.pending, state => {
        state.error = null;
      })
      .addCase(unpublishLesson.fulfilled, (state, action) => {
        const lesson = state.lessons.find(l => l.id === action.meta.arg);
        if (lesson) {
          lesson.isLive = false;
          lesson.liveOrder = null;
          lesson.publishedAt = null;
          lesson.publishedBy = null;
        }
      })
      .addCase(unpublishLesson.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(reorderLiveLessons.pending, state => {
        state.error = null;
      })
      .addCase(reorderLiveLessons.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(batchPublishLessons.pending, state => {
        state.error = null;
      })
      .addCase(batchPublishLessons.fulfilled, () => {
      })
      .addCase(batchPublishLessons.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(batchUnpublishLessons.pending, state => {
        state.error = null;
      })
      .addCase(batchUnpublishLessons.fulfilled, () => {
      })
      .addCase(batchUnpublishLessons.rejected, (state, action) => {
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
  addIntroductionPage,
  addExercisePage,
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

export const selectLiveLessons = (state: { lesson: LessonState }) => 
  state.lesson.lessons.filter(l => l.isLive).sort((a, b) => (a.liveOrder || 0) - (b.liveOrder || 0));

export const selectAvailableLessons = (state: { lesson: LessonState }) =>
  state.lesson.lessons.filter(l => !l.isLive);

export const selectLessonById = (state: { lesson: LessonState }, lessonId: string) =>
  state.lesson.lessons.find(l => l.id === lessonId);

export default lessonSlice.reducer;