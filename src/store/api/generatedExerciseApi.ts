import { createApi } from '@reduxjs/toolkit/query/react';
import { createAuthenticatedBaseQuery } from './baseQuery';
import type {
  GeneratedExerciseItemsResult,
  GeneratedExercisePlaybackRequest,
  GeneratedExercisePreviewRequest,
  GeneratedExercisePreviewResult,
} from '@/src/lib/tests/generated-preview-schema';

export type {
  GeneratedExercisePreviewDiagnostics,
  GeneratedExercisePreviewRequest,
  GeneratedExercisePreviewResult,
} from '@/src/lib/tests/generated-preview-schema';

export type GeneratedExerciseQuerySource =
  | { kind: 'admin-preview' }
  | ({ kind: 'lesson' } & GeneratedExercisePlaybackRequest);

export interface GeneratedExerciseItemsQueryArgs {
  exercise: GeneratedExercisePreviewRequest;
  source: GeneratedExerciseQuerySource;
}

export const generatedExerciseApi = createApi({
  reducerPath: 'generatedExerciseApi',
  baseQuery: createAuthenticatedBaseQuery(),
  endpoints: builder => ({
    previewGeneratedExercise: builder.mutation<GeneratedExercisePreviewResult, GeneratedExercisePreviewRequest>({
      query: body => ({
        url: '/admin/exercises/generated-preview',
        method: 'POST',
        body,
      }),
    }),
    getGeneratedExerciseItems: builder.query<GeneratedExerciseItemsResult, GeneratedExerciseItemsQueryArgs>({
      query: ({ exercise, source }) =>
        source.kind === 'admin-preview'
          ? {
              url: '/admin/exercises/generated-preview',
              method: 'POST',
              body: exercise,
            }
          : {
              url: '/words/generated-exercise',
              method: 'POST',
              body: {
                lessonId: source.lessonId,
                pageIndex: source.pageIndex,
                itemIndex: source.itemIndex,
                exerciseId: source.exerciseId,
              },
            },
      serializeQueryArgs: ({ queryArgs }) => JSON.stringify(queryArgs),
      keepUnusedDataFor: 60,
    }),
  }),
});

export const { usePreviewGeneratedExerciseMutation, useGetGeneratedExerciseItemsQuery } = generatedExerciseApi;
