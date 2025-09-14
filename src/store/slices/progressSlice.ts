import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { UserProgress, Lesson, LessonStatus } from '@/src/types/lesson';
import { progressService } from '@/src/services/progressService';
import { getContentCount } from '@/src/utils/lessonUtils';

interface ProgressState {
  currentProgress: Record<string, UserProgress>;
  loading: boolean;
  error: string | null;
}

const initialState: ProgressState = {
  currentProgress: {},
  loading: false,
  error: null,
};

export const loadUserProgress = createAsyncThunk(
  'progress/loadUserProgress',
  async ({ userId, lessonId }: { userId: string; lessonId: string }) => {
    const progress = await progressService.getUserProgress(userId, lessonId);
    return { lessonId, progress };
  }
);

export const loadBatchUserProgress = createAsyncThunk('progress/loadBatchUserProgress', async (userId: string) => {
  const progressMap = await progressService.getBatchUserProgress(userId);
  return progressMap;
});

export const markExerciseComplete = createAsyncThunk(
  'progress/markExerciseComplete',
  async ({
    userId,
    lessonId,
    exerciseId,
    score,
    lesson,
  }: {
    userId: string;
    lessonId: string;
    exerciseId: string;
    score: number;
    lesson?: Lesson;
  }) => {
    await progressService.markExerciseComplete(userId, lessonId, exerciseId, score, lesson);
    const updatedProgress = await progressService.getUserProgress(userId, lessonId);
    return { lessonId, progress: updatedProgress };
  }
);

export const markLessonComplete = createAsyncThunk(
  'progress/markLessonComplete',
  async ({ userId, lessonId, score }: { userId: string; lessonId: string; score?: number }) => {
    await progressService.markLessonComplete(userId, lessonId, score);
    const updatedProgress = await progressService.getUserProgress(userId, lessonId);
    return { lessonId, progress: updatedProgress };
  }
);

const progressSlice = createSlice({
  name: 'progress',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },
    resetProgress: state => {
      state.currentProgress = {};
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadUserProgress.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadUserProgress.fulfilled, (state, action) => {
        state.loading = false;
        const { lessonId, progress } = action.payload;
        if (progress) {
          state.currentProgress[lessonId] = progress;
        }
      })
      .addCase(loadUserProgress.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load progress';
      })
      .addCase(loadBatchUserProgress.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadBatchUserProgress.fulfilled, (state, action) => {
        state.loading = false;
        state.currentProgress = { ...state.currentProgress, ...action.payload };
      })
      .addCase(loadBatchUserProgress.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load batch progress';
      })
      .addCase(markExerciseComplete.fulfilled, (state, action) => {
        const { lessonId, progress } = action.payload;
        if (progress) {
          state.currentProgress[lessonId] = progress;
        }
      })
      .addCase(markExerciseComplete.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to mark exercise complete';
      })
      .addCase(markLessonComplete.fulfilled, (state, action) => {
        const { lessonId, progress } = action.payload;
        if (progress) {
          state.currentProgress[lessonId] = progress;
        }
      })
      .addCase(markLessonComplete.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to mark lesson complete';
      });
  },
});

export const { clearError, resetProgress } = progressSlice.actions;

export const selectLessonProgress = (state: { progress: ProgressState }, lessonId: string): UserProgress | undefined =>
  state.progress.currentProgress[lessonId];

export const selectProgressLoading = (state: { progress: ProgressState }): boolean => state.progress.loading;

export const selectProgressError = (state: { progress: ProgressState }): string | null => state.progress.error;

export const selectAllProgress = (state: { progress: ProgressState }) => state.progress.currentProgress;

export const selectLessonsWithProgress = createSelector(
  [
    (state: { lesson: { studentLessons: Lesson[] }; progress: ProgressState }) => state.lesson.studentLessons,
    selectAllProgress,
  ],
  (lessons, progressMap) => {
    return lessons.map(lesson => {
      const userProgress = progressMap[lesson.id];
      const contentCount = getContentCount(lesson);

      let progress = 0;
      let exercisesCompleted = 0;
      let status: LessonStatus = 'available';

      if (userProgress) {
        progress = userProgress.progress || 0;
        exercisesCompleted = userProgress.exerciseProgress?.length || 0;
        status =
          userProgress.status === 'completed'
            ? 'completed'
            : userProgress.status === 'in-progress'
              ? 'in-progress'
              : 'available';
      }

      return {
        ...lesson,
        progress,
        status,
        exercisesCompleted,
        totalExercises: contentCount.exerciseItems,
        totalIntroPages: contentCount.introPages,
        userProgress,
      };
    });
  }
);

export const selectLessonWithProgress = createSelector(
  [
    (state: { lesson: { studentLessons: Lesson[] } }, lessonId: string) =>
      state.lesson.studentLessons.find(l => l.id === lessonId),
    (state: { progress: ProgressState }, lessonId: string) => selectLessonProgress(state, lessonId),
  ],
  (lesson, userProgress) => {
    if (!lesson) return null;

    const contentCount = getContentCount(lesson);
    const progress = userProgress?.progress || 0;
    const exercisesCompleted = userProgress?.exerciseProgress?.length || 0;
    const status: LessonStatus =
      userProgress?.status === 'completed'
        ? 'completed'
        : userProgress?.status === 'in-progress'
          ? 'in-progress'
          : 'available';

    return {
      ...lesson,
      progress,
      status,
      exercisesCompleted,
      totalExercises: contentCount.exerciseItems,
      totalIntroPages: contentCount.introPages,
      userProgress,
    };
  }
);

export default progressSlice.reducer;
