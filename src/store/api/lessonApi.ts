import { createApi } from '@reduxjs/toolkit/query/react';
import { Lesson, LessonWithProgress } from '@/src/types/lesson';
import { extractTooltipsFromLesson } from '@/src/utils/tooltipUtils';
import { TooltipData } from '@/src/types/tooltip';
import { createAuthenticatedBaseQuery } from './baseQuery';

export const lessonApi = createApi({
  reducerPath: 'lessonApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['Lesson', 'LessonList', 'StudentLesson'],
  keepUnusedDataFor: 60 * 5,
  refetchOnMountOrArgChange: 30,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: builder => ({
    getLessons: builder.query<Lesson[], void>({
      query: () => '/admin/lessons',
      transformResponse: (response: { lessons: Lesson[] }) => response.lessons,
      providesTags: result =>
        result
          ? [...result.map(({ id }) => ({ type: 'Lesson' as const, id })), { type: 'LessonList', id: 'LIST' }]
          : [{ type: 'LessonList', id: 'LIST' }],
    }),

    getStudentLessons: builder.query<LessonWithProgress[], void>({
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
      providesTags: (result, error, { lessonId }) => [{ type: 'Lesson', id: lessonId }],
    }),

    createLesson: builder.mutation<{ lesson: Lesson }, Lesson>({
      query: lesson => ({
        url: '/admin/lessons',
        method: 'POST',
        body: lesson,
      }),
      invalidatesTags: [{ type: 'LessonList', id: 'LIST' }],
    }),

    updateLesson: builder.mutation<{ lesson: Lesson }, Lesson>({
      query: lesson => ({
        url: '/admin/lessons',
        method: 'PUT',
        body: lesson,
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
      { lessonIds: string[]; isLive: boolean; startOrder?: number }
    >({
      query: ({ lessonIds, isLive, startOrder }) => ({
        url: '/admin/lessons/update-publish-status',
        method: 'POST',
        body: { lessonIds, isLive, startOrder },
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
      { success: boolean },
      { userId: string; lessonId: string; exerciseId: string; score: number }
    >({
      query: ({ userId, lessonId, exerciseId, score }) => ({
        url: `/progress/${userId}/${lessonId}`,
        method: 'POST',
        body: {
          exerciseId,
          score,
          completedAt: new Date().toISOString(),
        },
      }),
      invalidatesTags: () => [{ type: 'StudentLesson', id: 'LIST' }],
    }),

    updatePageProgress: builder.mutation<
      { success: boolean },
      { userId: string; lessonId: string; currentPageIndex: number }
    >({
      query: ({ userId, lessonId, currentPageIndex }) => ({
        url: `/progress/${userId}/${lessonId}`,
        method: 'POST',
        body: {
          currentPageIndex,
          completedAt: new Date().toISOString(),
        },
      }),
      invalidatesTags: () => [{ type: 'StudentLesson', id: 'LIST' }],
    }),

    markLessonComplete: builder.mutation<{ success: boolean }, { userId: string; lessonId: string; score?: number }>({
      query: ({ userId, lessonId, score }) => ({
        url: `/progress/${userId}/${lessonId}`,
        method: 'POST',
        body: {
          status: 'completed',
          completedAt: new Date().toISOString(),
          progress: 100,
          score,
        },
      }),
      invalidatesTags: () => [{ type: 'StudentLesson', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetLessonsQuery,
  useGetStudentLessonsQuery,
  useGetLessonByIdQuery,
  useCreateLessonMutation,
  useUpdateLessonMutation,
  useDeleteLessonMutation,
  useUpdateLessonsPublishStatusMutation,
  useReorderLessonsMutation,
  useMarkExerciseCompleteMutation,
  useUpdatePageProgressMutation,
  useMarkLessonCompleteMutation,
} = lessonApi;
