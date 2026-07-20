import { Lesson, LessonSummary, LessonWithProgress } from '@/src/types/lesson';
import { extractTooltipsFromLesson } from '@/src/utils/tooltipUtils';
import { TooltipData } from '@/src/types/tooltip';
import { buildLessonMutationPayload } from '@/src/utils/practiceCategoryLessons';
import { appApi } from './appApi';
import { PRACTICE_CATEGORY_ASSIGNMENTS_TAG } from './tags';

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

    getStudentLessons: builder.query<LessonWithProgress[], string | void>({
      query: () => '/lessons',
      transformResponse: (response: { lessons: LessonWithProgress[] }) => response.lessons,
      providesTags: [{ type: 'StudentLesson', id: 'LIST' }],
    }),

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
      invalidatesTags: [{ type: 'LessonList', id: 'LIST' }],
    }),

    updateLesson: builder.mutation<{ lesson: Lesson }, Lesson>({
      query: lesson => ({
        url: '/admin/lessons',
        method: 'PUT',
        body: buildLessonMutationPayload(lesson),
      }),
      invalidatesTags: (result, error, lesson) => [
        { type: 'Lesson', id: lesson.id },
        { type: 'LessonList', id: 'LIST' },
      ],
    }),

    deleteLesson: builder.mutation<void, string>({
      query: lessonId => ({
        url: `/admin/lessons/${lessonId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, lessonId) => [
        { type: 'Lesson', id: lessonId },
        { type: 'LessonList', id: 'LIST' },
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
      invalidatesTags: (result, error, { lessonIds }) => [
        ...lessonIds.map(id => ({ type: 'Lesson' as const, id })),
        { type: 'LessonList', id: 'LIST' },
      ],
    }),

    reorderLessons: builder.mutation<{ success: boolean }, { lessonId: string; liveOrder: number }[]>({
      query: updates => ({
        url: '/admin/lessons/reorder',
        method: 'POST',
        body: { updates },
      }),
      invalidatesTags: [{ type: 'LessonList', id: 'LIST' }],
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
      invalidatesTags: () => [{ type: 'StudentLesson', id: 'LIST' }],
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
      invalidatesTags: () => [{ type: 'StudentLesson', id: 'LIST' }],
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
      invalidatesTags: () => [{ type: 'StudentLesson', id: 'LIST' }],
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
  useGetStudentLessonsQuery,
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
