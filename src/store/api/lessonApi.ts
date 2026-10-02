import type { TypedMutationOnQueryStarted } from '@reduxjs/toolkit/query';
import { Lesson, LessonSummary, LessonWithProgress, StudentDashboard } from '@/src/types/lesson';
import type { LessonProgressMutationResult } from '@/src/utils/lessonProgress';
import { extractTooltipsFromLesson } from '@/src/utils/tooltipUtils';
import { TooltipData } from '@/src/types/tooltip';
import type { AdminLearningPathView, LearningPathDocument, LessonUnitType } from '@/src/types/learning-unit';
import { buildLessonMutationPayload } from '@/src/utils/practiceCategoryLessons';
import { appApi } from './appApi';
import type { createAuthenticatedBaseQuery } from './baseQuery';
import { getAttemptSummaryTagId, PRACTICE_CATEGORY_ASSIGNMENTS_TAG, STUDENT_DASHBOARD_TAG } from './tags';

interface RecoveryItem {
  id: string;
  lessonId: string;
  lessonTitle: string;
  rawLessonData: Lesson;
  errorMessage: string;
  errorCode?: string;
  createdAt: string;
}

interface ProgressMutationArgs {
  userId: string;
  lessonId: string;
}

/**
 * A progress write returns the persisted summary, so the open lesson and the
 * dashboard adopt it rather than refetching both after every page and exercise.
 * Completing a lesson can unlock the next unit, which only the server decides,
 * so that alone refetches the dashboard.
 */
const adoptPersistedProgress: TypedMutationOnQueryStarted<
  LessonProgressMutationResult,
  ProgressMutationArgs,
  ReturnType<typeof createAuthenticatedBaseQuery>,
  'appApi'
> = async ({ userId, lessonId }, { dispatch, queryFulfilled }) => {
  const result = await queryFulfilled.then(response => response.data).catch(() => null);
  if (!result) return;
  // Concurrent writes can resolve out of order, and persisted progress only grows, so keep the furthest state.
  const adoptSummary = (
    cached: Pick<LessonWithProgress, 'status' | 'progress' | 'furthestPageIndex' | 'currentPageIndex'>
  ) => {
    cached.status = result.lessonCompleted || cached.status === 'completed' ? 'completed' : 'in-progress';
    cached.progress = Math.max(cached.progress ?? 0, result.progress);
    cached.furthestPageIndex = Math.max(cached.furthestPageIndex ?? -1, result.furthestPageIndex);
    cached.currentPageIndex = Math.max(cached.furthestPageIndex, 0);
  };

  dispatch(
    lessonApi.util.updateQueryData('getStudentLesson', { lessonId, userId }, lesson => {
      adoptSummary(lesson);
      if (result.exerciseProgress.length < (lesson.exerciseProgress?.length ?? 0)) return;
      lesson.exerciseProgress = result.exerciseProgress;
      lesson.completedExerciseCount = result.completedExerciseCount;
      lesson.requiredExerciseCount = result.requiredExerciseCount;
    })
  );

  // The recipe runs only against a loaded dashboard. A first dashboard request
  // still in flight predates this write, so a completion must refresh it too.
  let dashboardLoaded = false;
  let completedNow = false;
  dispatch(
    lessonApi.util.updateQueryData('getStudentDashboard', userId, dashboard => {
      dashboardLoaded = true;
      for (const unit of [...dashboard.learningPath, ...dashboard.practiceLessons]) {
        if (unit.kind !== 'lesson' || unit.id !== lessonId) continue;
        completedNow ||= result.lessonCompleted && unit.status !== 'completed';
        adoptSummary(unit);
      }
    })
  );
  // Only the dashboard provides this tag, so the open lesson is not refetched.
  if (completedNow || (result.lessonCompleted && !dashboardLoaded))
    dispatch(lessonApi.util.invalidateTags([{ type: 'StudentLesson', id: 'LIST' }]));
};

/**
 * The dashboard is the costliest student read, and progress writes and tag
 * invalidation already keep its cached copy current. Views that only display
 * it pass these options so that mounting them, or refocusing the tab, does not
 * rebuild it. The dashboard page itself still refreshes it.
 */
export const REUSE_CACHED_STUDENT_DASHBOARD = { refetchOnMountOrArgChange: false, refetchOnFocus: false } as const;

/** How old the dashboard page lets its data get before a tab refocus refreshes it. */
export const STUDENT_DASHBOARD_FOCUS_REFRESH_MS = 5 * 60 * 1000;

export const lessonApi = appApi.injectEndpoints({
  endpoints: builder => ({
    getLessons: builder.query<LessonSummary[], void>({
      query: () => '/admin/lessons',
      transformResponse: (response: { lessons: LessonSummary[] }) => response.lessons,
      providesTags: result =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Lesson' as const, id })),
              { type: 'LessonList', id: 'LIST' },
              PRACTICE_CATEGORY_ASSIGNMENTS_TAG,
            ]
          : [{ type: 'LessonList', id: 'LIST' }, PRACTICE_CATEGORY_ASSIGNMENTS_TAG],
    }),

    getStudentDashboard: builder.query<StudentDashboard, string>({
      query: () => '/student-dashboard',
      extraOptions: { retryNetworkErrors: true },
      transformResponse: (response: { dashboard: StudentDashboard }) => response.dashboard,
      providesTags: (result, error, userId) => [
        { type: 'StudentLearningPath', id: userId },
        { type: 'StudentLesson', id: 'LIST' },
        ...(result?.learningPath
          .filter(unit => unit.kind === 'test')
          .map(test => ({
            type: 'AttemptSummary' as const,
            id: getAttemptSummaryTagId(userId, {
              kind: 'normal-test',
              testId: test.id,
            }),
          })) ?? []),
        ...(result?.mockTests?.map(mock => ({
          type: 'AttemptSummary' as const,
          id: getAttemptSummaryTagId(userId, { kind: 'mock-test', mockTestId: mock.id }),
        })) ?? []),
      ],
    }),

    getStudentLesson: builder.query<LessonWithProgress, { lessonId: string; userId: string }>({
      query: ({ lessonId }) => `/lessons/${encodeURIComponent(lessonId)}`,
      extraOptions: { retryNetworkErrors: true },
      transformResponse: (response: { lesson: LessonWithProgress }) => response.lesson,
      providesTags: (result, error, { lessonId, userId }) => [
        { type: 'StudentLesson', id: lessonId },
        { type: 'StudentLearningPath', id: userId },
      ],
    }),

    getLearningPath: builder.query<AdminLearningPathView, void>({
      query: () => '/admin/learning-path',
      providesTags: [{ type: 'LearningPath', id: 'default' }],
    }),

    saveLearningPath: builder.mutation<{ path: LearningPathDocument }, { expectedRevision: number; unitIds: string[] }>(
      {
        query: input => ({
          url: '/admin/learning-path',
          method: 'PUT',
          body: input,
        }),
        invalidatesTags: result =>
          result
            ? [
                { type: 'LearningPath', id: 'default' },
                { type: 'LearningUnit', id: 'LIST' },
                { type: 'StudentLearningPath' },
              ]
            : [],
      }
    ),

    getLessonById: builder.query<{ lesson: Lesson; tooltips: Record<string, TooltipData> }, { lessonId: string }>({
      query: ({ lessonId }) => `/admin/lessons/${lessonId}`,
      extraOptions: { retryNetworkErrors: true },
      transformResponse: ({ lesson }: { lesson: Lesson }) => ({ lesson, tooltips: extractTooltipsFromLesson(lesson) }),
      providesTags: (result, error, { lessonId }) => [
        { type: 'Lesson', id: lessonId },
        PRACTICE_CATEGORY_ASSIGNMENTS_TAG,
      ],
    }),

    createLesson: builder.mutation<{ lesson: Lesson }, Lesson>({
      query: lesson => ({
        url: '/admin/lessons',
        method: 'POST',
        body: buildLessonMutationPayload(lesson),
      }),
      invalidatesTags: (result, error) =>
        error || !result ? [] : [{ type: 'LessonList', id: 'LIST' }, STUDENT_DASHBOARD_TAG],
    }),

    updateLesson: builder.mutation<{ lesson: Lesson }, Lesson>({
      query: lesson => ({
        url: '/admin/lessons',
        method: 'PUT',
        body: buildLessonMutationPayload(lesson),
      }),
      invalidatesTags: (result, error, lesson) =>
        error || !result
          ? []
          : [
              { type: 'Lesson', id: lesson.id },
              { type: 'LessonList', id: 'LIST' },
              { type: 'StudentLesson', id: lesson.id },
              { type: 'LearningPath', id: 'default' },
              STUDENT_DASHBOARD_TAG,
            ],
    }),

    deleteLesson: builder.mutation<void, string>({
      query: lessonId => ({
        url: `/admin/lessons/${lessonId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, lessonId) =>
        error
          ? []
          : [
              { type: 'Lesson', id: lessonId },
              { type: 'LessonList', id: 'LIST' },
              { type: 'StudentLesson', id: lessonId },
              STUDENT_DASHBOARD_TAG,
            ],
    }),

    updateLessonsPublishStatus: builder.mutation<
      { success: boolean },
      {
        lessonIds: string[];
        isLive: boolean;
        lessonType: LessonUnitType;
        expectedLiveLessonIds: string[];
        startOrder?: number;
      }
    >({
      query: ({ lessonIds, isLive, lessonType, expectedLiveLessonIds, startOrder }) => ({
        url: '/admin/lessons/update-publish-status',
        method: 'POST',
        body: { lessonIds, isLive, lessonType, expectedLiveLessonIds, startOrder },
      }),
      invalidatesTags: (result, error, { lessonIds }) =>
        error || !result
          ? []
          : [
              ...lessonIds.map(id => ({ type: 'Lesson' as const, id })),
              ...lessonIds.map(id => ({ type: 'StudentLesson' as const, id })),
              { type: 'LessonList', id: 'LIST' },
              STUDENT_DASHBOARD_TAG,
            ],
    }),

    reorderLessons: builder.mutation<{ success: boolean }, { lessonId: string; liveOrder: number }[]>({
      query: updates => ({
        url: '/admin/lessons/reorder',
        method: 'POST',
        body: { updates },
      }),
      invalidatesTags: (result, error, updates) =>
        error || !result
          ? []
          : [
              { type: 'LessonList', id: 'LIST' },
              ...updates.map(({ lessonId }) => ({
                type: 'StudentLesson' as const,
                id: lessonId,
              })),
              STUDENT_DASHBOARD_TAG,
            ],
    }),

    markExerciseComplete: builder.mutation<
      LessonProgressMutationResult,
      ProgressMutationArgs & { exerciseId: string; score: number }
    >({
      query: ({ userId, lessonId, exerciseId, score }) => ({
        url: `/progress/${userId}/${lessonId}`,
        method: 'POST',
        body: {
          action: 'complete-exercise',
          exerciseId,
          score,
        },
      }),
      onQueryStarted: adoptPersistedProgress,
    }),

    updatePageProgress: builder.mutation<LessonProgressMutationResult, ProgressMutationArgs & { pageId: string }>({
      query: ({ userId, lessonId, pageId }) => ({
        url: `/progress/${userId}/${lessonId}`,
        method: 'POST',
        body: {
          action: 'visit-page',
          pageId,
        },
      }),
      onQueryStarted: adoptPersistedProgress,
    }),

    finishLesson: builder.mutation<LessonProgressMutationResult, ProgressMutationArgs & { finalPageId: string }>({
      query: ({ userId, lessonId, finalPageId }) => ({
        url: `/progress/${userId}/${lessonId}/complete`,
        method: 'POST',
        body: { finalPageId },
      }),
      onQueryStarted: adoptPersistedProgress,
    }),

    getRecoveryItems: builder.query<RecoveryItem[], void>({
      query: () => '/admin/lessons/recovery',
      transformResponse: (response: { recoveryItems: RecoveryItem[] }) => response.recoveryItems,
      providesTags: [{ type: 'Recovery', id: 'LIST' }],
    }),

    saveToRecovery: builder.mutation<
      { success: boolean; recoveryId: string },
      { lesson: Lesson; errorMessage: string; errorCode?: string }
    >({
      query: data => ({
        url: '/admin/lessons/recovery',
        method: 'POST',
        body: { ...data, lesson: buildLessonMutationPayload(data.lesson) },
      }),
      invalidatesTags: [{ type: 'Recovery', id: 'LIST' }],
    }),

    retryFromRecovery: builder.mutation<{ success: boolean; lesson: Lesson }, string>({
      query: recoveryId => ({
        url: `/admin/lessons/recovery/${recoveryId}`,
        method: 'POST',
      }),
      invalidatesTags: [
        { type: 'Recovery', id: 'LIST' },
        { type: 'LessonList', id: 'LIST' },
      ],
    }),

    deleteRecoveryItem: builder.mutation<{ success: boolean }, string>({
      query: recoveryId => ({
        url: `/admin/lessons/recovery/${recoveryId}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Recovery', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetLessonsQuery,
  useGetStudentDashboardQuery,
  useGetStudentLessonQuery,
  useGetLearningPathQuery,
  useSaveLearningPathMutation,
  useGetLessonByIdQuery,
  useLazyGetLessonByIdQuery,
  useCreateLessonMutation,
  useUpdateLessonMutation,
  useDeleteLessonMutation,
  useUpdateLessonsPublishStatusMutation,
  useReorderLessonsMutation,
  useMarkExerciseCompleteMutation,
  useUpdatePageProgressMutation,
  useFinishLessonMutation,
  useGetRecoveryItemsQuery,
  useSaveToRecoveryMutation,
  useRetryFromRecoveryMutation,
  useDeleteRecoveryItemMutation,
} = lessonApi;
