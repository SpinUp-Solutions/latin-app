import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Lesson, IntroductionPage, ExercisePage } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';
import { lessonService } from '@/src/services/lessonService';

export { TooltipData } from '@/src/types/tooltip';

interface LessonWithMetadata extends Lesson {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
  published?: boolean;
}

interface LessonEditState {
  currentLesson: Lesson | null;
  draft: {
    lesson: Lesson;
    lastModified: string;
  } | null;
  editingContent: {
    content: RenderableContentItem;
    pageType: 'introduction' | 'exercises';
    pageIndex: number;
    itemIndex: number;
  } | null;
  isModalOpen: boolean;

  lessons: LessonWithMetadata[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  lastSavedLesson: LessonWithMetadata | null;

  tooltips: Record<string, TooltipData>;
}

const initialState: LessonEditState = {
  currentLesson: null,
  draft: null,
  editingContent: null,
  isModalOpen: false,

  lessons: [],
  loading: false,
  saving: false,
  error: null,
  lastSavedLesson: null,

  tooltips: {},
};

const DRAFT_KEY = 'lesson_draft';
const DRAFT_TIMESTAMP_KEY = 'lesson_draft_timestamp';

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

export const loadLessonById = createAsyncThunk(
  'lesson/loadLessonById',
  async (lessonId: string, { rejectWithValue }) => {
    try {
      const lesson = await lessonService.getLesson(lessonId);
      return lesson as LessonWithMetadata;
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

export const loadDraft = createAsyncThunk('lesson/loadDraft', (_, { rejectWithValue }) => {
  try {
    const draftData = sessionStorage.getItem(DRAFT_KEY);
    const timestamp = sessionStorage.getItem(DRAFT_TIMESTAMP_KEY);
    if (draftData && timestamp) {
      return {
        lesson: JSON.parse(draftData) as Lesson,
        lastModified: timestamp,
      };
    }
    return null;
  } catch (error) {
    console.error('Error loading draft from storage:', error);
    return rejectWithValue('Failed to load draft');
  }
});

export const clearDraft = createAsyncThunk('lesson/clearDraft', (_, { rejectWithValue }) => {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_TIMESTAMP_KEY);
  } catch (error) {
    console.error('Error clearing draft from storage:', error);
    return rejectWithValue('Failed to clear draft');
  }
});

const lessonSlice = createSlice({
  name: 'lessonEdit',
  initialState,
  reducers: {
    setLesson: (state, action: PayloadAction<Lesson | undefined>) => {
      state.currentLesson = action.payload || {
        id: `lesson-${Date.now()}`,
        title: 'New Lesson',
        description: '',
        introduction: [],
        exercises: [],
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

        // Also update the corresponding content in currentLesson for live preview
        if (state.currentLesson) {
          const { pageType, pageIndex, itemIndex } = state.editingContent;
          // Immer handles immutability - we can directly mutate the nested state
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

    resetLessonState: state => {
      state.currentLesson = null;
      state.draft = null;
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
  },
  extraReducers: builder => {
    // Save Lesson
    builder
      .addCase(saveLesson.pending, state => {
        state.saving = true;
        state.error = null;
      })
      .addCase(saveLesson.fulfilled, (state, action) => {
        state.saving = false;
        state.error = null;
        state.lastSavedLesson = action.payload.lesson as LessonWithMetadata;
        state.draft = null; // Clear draft from state

        // Update the current lesson with the saved data (includes metadata)
        if (state.currentLesson && state.currentLesson.id === action.payload.lesson.id) {
          state.currentLesson = action.payload.lesson;
        }

        // Update or add to lessons list
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
      });

    // Load Lessons
    builder
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
      });

    // Load Lesson by ID
    builder
      .addCase(loadLessonById.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadLessonById.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.currentLesson = action.payload;
      })
      .addCase(loadLessonById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Draft handling
    builder
      .addCase(loadDraft.fulfilled, (state, action) => {
        state.draft = action.payload;
      })
      .addCase(clearDraft.fulfilled, state => {
        state.draft = null;
      });

    // Delete Lesson
    builder
      .addCase(deleteLesson.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteLesson.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        // Remove from lessons list
        state.lessons = state.lessons.filter(l => l.id !== action.payload);

        // Clear current lesson if it was deleted
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
  resetLessonState,
  addTooltip,
  removeTooltip,
  clearTooltips,
} = lessonSlice.actions;

export default lessonSlice.reducer;
