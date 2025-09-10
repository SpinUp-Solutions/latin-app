import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { LiveLessonWithData } from '@/src/types/live-lesson';
import { Lesson } from '@/src/types/lesson';
import { liveLessonService } from '@/src/services/liveLessonService';

interface LiveLessonState {
  // Admin state
  liveLessons: LiveLessonWithData[];
  availableLessons: Lesson[];

  // Student state
  studentLessons: LiveLessonWithData[];

  // Individual lesson state
  currentLesson: Lesson | null;
  lessonLoading: boolean;

  // Common state
  loading: boolean;
  error: string | null;
}

const initialState: LiveLessonState = {
  liveLessons: [],
  availableLessons: [],
  studentLessons: [],
  currentLesson: null,
  lessonLoading: false,
  loading: false,
  error: null,
};

// Admin thunks
export const fetchAdminLiveLessons = createAsyncThunk(
  'liveLesson/fetchAdminLiveLessons',
  async (_, { rejectWithValue }) => {
    try {
      const result = await liveLessonService.getAdminLiveLessons();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch live lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const publishLesson = createAsyncThunk(
  'liveLesson/publishLesson',
  async ({ lessonId, order }: { lessonId: string; order?: number }, { rejectWithValue }) => {
    try {
      const result = await liveLessonService.publishLesson(lessonId, order);
      return { ...result, lessonId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const unpublishLesson = createAsyncThunk(
  'liveLesson/unpublishLesson',
  async (lessonId: string, { rejectWithValue }) => {
    try {
      const result = await liveLessonService.unpublishLesson(lessonId);
      return { ...result, lessonId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unpublish lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const reorderLiveLessons = createAsyncThunk(
  'liveLesson/reorderLiveLessons',
  async (lessons: { lessonId: string; order: number }[], { rejectWithValue }) => {
    try {
      const result = await liveLessonService.reorderLiveLessons(lessons);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reorder lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const batchPublishLessons = createAsyncThunk(
  'liveLesson/batchPublish',
  async (lessonIds: string[], { rejectWithValue }) => {
    try {
      const result = await liveLessonService.batchPublish(lessonIds);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const batchUnpublishLessons = createAsyncThunk(
  'liveLesson/batchUnpublish',
  async (lessonIds: string[], { rejectWithValue }) => {
    try {
      const result = await liveLessonService.batchUnpublish(lessonIds);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unpublish lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

// Student thunks
export const fetchStudentLiveLessons = createAsyncThunk(
  'liveLesson/fetchStudentLiveLessons',
  async (_, { rejectWithValue }) => {
    try {
      const result = await liveLessonService.getStudentLiveLessons();
      return result.lessons;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const fetchLessonById = createAsyncThunk(
  'liveLesson/fetchLessonById',
  async (lessonId: string, { rejectWithValue }) => {
    try {
      const result = await liveLessonService.getLessonById(lessonId);
      return result.lessonData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

const liveLessonSlice = createSlice({
  name: 'liveLesson',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },

    // Local reordering for optimistic UI
    localReorderLiveLessons: (state, action: PayloadAction<{ fromIndex: number; toIndex: number }>) => {
      const { fromIndex, toIndex } = action.payload;
      const [removed] = state.liveLessons.splice(fromIndex, 1);
      state.liveLessons.splice(toIndex, 0, removed);

      // Update order values
      state.liveLessons.forEach((lesson, index) => {
        lesson.order = index;
      });
    },
  },
  extraReducers: builder => {
    // Fetch admin live lessons
    builder
      .addCase(fetchAdminLiveLessons.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdminLiveLessons.fulfilled, (state, action) => {
        state.loading = false;
        state.liveLessons = action.payload.liveLessons;
        state.availableLessons = action.payload.availableLessons;
      })
      .addCase(fetchAdminLiveLessons.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Publish lesson
    builder
      .addCase(publishLesson.pending, state => {
        state.error = null;
      })
      .addCase(publishLesson.fulfilled, (state, action) => {
        // Move lesson from available to live
        const lessonToPublish = state.availableLessons.find(l => l.id === action.meta.arg.lessonId);
        if (lessonToPublish) {
          state.availableLessons = state.availableLessons.filter(l => l.id !== action.meta.arg.lessonId);

          const newLiveLesson: LiveLessonWithData = {
            lessonId: lessonToPublish.id,
            order: action.meta.arg.order ?? state.liveLessons.length,
            publishedAt: new Date().toISOString(),
            publishedBy: '', // Will be set by backend
            lessonData: lessonToPublish,
          };

          state.liveLessons.push(newLiveLesson);
          state.liveLessons.sort((a, b) => a.order - b.order);
        }
      })
      .addCase(publishLesson.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Unpublish lesson
    builder
      .addCase(unpublishLesson.pending, state => {
        state.error = null;
      })
      .addCase(unpublishLesson.fulfilled, (state, action) => {
        // Move lesson from live to available
        const lessonToUnpublish = state.liveLessons.find(l => l.lessonId === action.meta.arg);
        if (lessonToUnpublish) {
          state.liveLessons = state.liveLessons.filter(l => l.lessonId !== action.meta.arg);
          state.availableLessons.unshift(lessonToUnpublish.lessonData);
        }
      })
      .addCase(unpublishLesson.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Reorder live lessons
    builder
      .addCase(reorderLiveLessons.pending, state => {
        state.error = null;
      })
      .addCase(reorderLiveLessons.rejected, (state, action) => {
        state.error = action.payload as string;
        // Could revert order here if needed
      });

    // Batch operations
    builder
      .addCase(batchPublishLessons.pending, state => {
        state.error = null;
      })
      .addCase(batchPublishLessons.fulfilled, () => {
        // Will be handled by fetchAdminLiveLessons refresh
      })
      .addCase(batchPublishLessons.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    builder
      .addCase(batchUnpublishLessons.pending, state => {
        state.error = null;
      })
      .addCase(batchUnpublishLessons.fulfilled, () => {
        // Will be handled by fetchAdminLiveLessons refresh
      })
      .addCase(batchUnpublishLessons.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Fetch student live lessons
    builder
      .addCase(fetchStudentLiveLessons.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStudentLiveLessons.fulfilled, (state, action) => {
        state.loading = false;
        state.studentLessons = action.payload;
      })
      .addCase(fetchStudentLiveLessons.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch lesson by ID
    builder
      .addCase(fetchLessonById.pending, state => {
        state.lessonLoading = true;
        state.error = null;
      })
      .addCase(fetchLessonById.fulfilled, (state, action) => {
        state.lessonLoading = false;
        state.currentLesson = action.payload;
      })
      .addCase(fetchLessonById.rejected, (state, action) => {
        state.lessonLoading = false;
        state.error = action.payload as string;
        state.currentLesson = null;
      });
  },
});

export const { clearError, localReorderLiveLessons } = liveLessonSlice.actions;

export default liveLessonSlice.reducer;
