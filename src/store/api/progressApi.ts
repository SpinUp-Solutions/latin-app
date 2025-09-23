import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { UserProgress } from '@/src/types/lesson';
import { auth } from '@/src/services/firebase';

const baseQuery = fetchBaseQuery({
  baseUrl: '/api',
  prepareHeaders: async headers => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

export const progressApi = createApi({
  reducerPath: 'progressApi',
  baseQuery,
  tagTypes: ['BatchProgress', 'StudentLesson'],
  endpoints: builder => ({
    getBatchUserProgress: builder.query<Record<string, UserProgress>, string>({
      query: userId => `/progress/${userId}/batch`,
      providesTags: () => [{ type: 'BatchProgress', id: 'LIST' }],
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
      invalidatesTags: () => [
        { type: 'BatchProgress', id: 'LIST' },
        { type: 'StudentLesson', id: 'LIST' }
      ],
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
      invalidatesTags: () => [
        { type: 'BatchProgress', id: 'LIST' },
        { type: 'StudentLesson', id: 'LIST' }
      ],
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
      invalidatesTags: () => [
        { type: 'BatchProgress', id: 'LIST' },
        { type: 'StudentLesson', id: 'LIST' }
      ],
    }),
  }),
});

export const {
  useGetBatchUserProgressQuery,
  useMarkExerciseCompleteMutation,
  useUpdatePageProgressMutation,
  useMarkLessonCompleteMutation,
} = progressApi;
