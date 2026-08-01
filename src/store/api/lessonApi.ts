import { Lesson, LessonSummary, LessonWithProgress, StudentDashboard } from '@/src/types/lesson';
import { extractTooltipsFromLesson } from '@/src/utils/tooltipUtils';
import { TooltipData } from '@/src/types/tooltip';
import type { AdminLearningPathView, LearningPathDocument } from '@/src/types/learning-unit';
import { buildLessonMutationPayload } from '@/src/utils/practiceCategoryLessons';
import { appApi } from './appApi';
import { getAttemptSummaryTagId, PRACTICE_CATEGORY_ASSIGNMENTS_TAG, STUDENT_DASHBOARD_TAG } from './tags';

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
      transformResponse: (response: { lesson?: Lesson } | Lesson) => {
        const lesson = 'lesson' in response ? response.lesson : (response as Lesson);
        if (!lesson) {
          throw new Error('Lesson not found');
        }
        const tooltips = extractTooltipsFromLesson(lesson);
        return { lesson, tooltips };
      },
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
        lessonType: 'normal' | 'vocab' | 'sentence-diagramming' | 'listening';
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
      { success: boolean; lessonCompleted: boolean },
      { userId: string; lessonId: string; exerciseId: string; score: number }
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
      invalidatesTags: (result, error, { userId, lessonId }) =>
        error || !result
          ? []
          : [
              { type: 'StudentLesson', id: lessonId },
              { type: 'StudentLearningPath', id: userId },
            ],
    }),

    updatePageProgress: builder.mutation<
      { success: boolean; furthestPageIndex: number },
      { userId: string; lessonId: string; pageId: string }
    >({
      query: ({ userId, lessonId, pageId }) => ({
        url: `/progress/${userId}/${lessonId}`,
        method: 'POST',
        body: {
          action: 'visit-page',
          pageId,
        },
      }),
      invalidatesTags: (result, error, { userId, lessonId }) =>
        error || !result
          ? []
          : [
              { type: 'StudentLesson', id: lessonId },
              { type: 'StudentLearningPath', id: userId },
            ],
    }),

    finishLesson: builder.mutation<
      { success: boolean; lessonCompleted: boolean; alreadyCompleted: boolean },
      { userId: string; lessonId: string; finalPageId: string }
    >({
      query: ({ userId, lessonId, finalPageId }) => ({
        url: `/progress/${userId}/${lessonId}/complete`,
        method: 'POST',
        body: { finalPageId },
      }),
      invalidatesTags: (result, error, { userId, lessonId }) =>
        error || !result
          ? []
          : [
              { type: 'StudentLesson', id: lessonId },
              { type: 'StudentLearningPath', id: userId },
            ],
    }),

    // Recovery endpoints
    getRecoveryItems: builder.query<
      {
        id: string;
        lessonId: string;
        lessonTitle: string;
        rawLessonData: Lesson;
        errorMessage: string;
        errorCode?: string;
        createdAt: string;
      }[],
      void
    >({
      query: () => '/admin/lessons/recovery',
      transformResponse: (response: {
        recoveryItems: {
          id: string;
          lessonId: string;
          lessonTitle: string;
          rawLessonData: Lesson;
          errorMessage: string;
          errorCode?: string;
          createdAt: string;
        }[];
      }) => response.recoveryItems,
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
  // Recovery hooks
  useGetRecoveryItemsQuery,
  useSaveToRecoveryMutation,
  useRetryFromRecoveryMutation,
  useDeleteRecoveryItemMutation,
} = lessonApi;
