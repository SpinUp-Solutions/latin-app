import { createApi } from '@reduxjs/toolkit/query/react';
import { type VocabularyWordWithId } from '@/src/types/vocabulary/index';
import type { TableType } from '@/src/utils/schema-helpers';
import { normalizeCollection } from '@/src/utils/exercises/legacyExerciseCompat';
import { createAuthenticatedBaseQuery } from './baseQuery';
import type { PoolFilters } from '@/src/types/pool-filters';
import { buildAdvancedFilterParams } from '@/src/utils/wordFilters';
import type {
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

export interface GeneratedExerciseWordsQueryArgs {
  exercise: GeneratedExercisePreviewRequest;
  source: GeneratedExerciseQuerySource;
}

export const normalizeAdvancedVocabularyCollection = (collection?: string) => normalizeCollection(collection);

interface GetAdvancedWordsArgs {
  collection?: string;
  filters: PoolFilters;
  lastWordId?: string | null;
  limit?: number;
  fetchAll?: boolean;
  cellPaths?: string[];
  tableType?: TableType;
}

export interface GetAdvancedWordsResponse {
  success: boolean;
  data: {
    words: VocabularyWordWithId[];
    hasMore: boolean;
    lastWordId: string | null;
    limit: number | null;
    filters: Record<string, string | number | boolean>;
    collection: string;
    totalCount?: number;
    nextPoolOffset?: number;
  };
}

function advancedWordsParams({
  collection,
  filters,
  lastWordId,
  limit,
  fetchAll,
  cellPaths,
  tableType,
}: GetAdvancedWordsArgs) {
  const params = buildAdvancedFilterParams(filters, { limit, fetchAll, lastWordId: lastWordId ?? undefined });
  if (collection) params.append('collection', normalizeAdvancedVocabularyCollection(collection));
  if (cellPaths && cellPaths.length > 0) params.append('cellPaths', cellPaths.join(','));
  if (tableType) params.append('tableType', tableType);
  return params;
}

export const advancedVocabularyApi = createApi({
  reducerPath: 'advancedVocabularyApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['AdvancedWordList'],
  endpoints: builder => ({
    getAdvancedWords: builder.query<GetAdvancedWordsResponse['data'], GetAdvancedWordsArgs>({
      query: args => ({ url: `/admin/words?${advancedWordsParams(args)}` }),
      transformResponse: (response: GetAdvancedWordsResponse) => {
        return response.data;
      },
      // Every request parameter except the cursor, so filters that do not apply to the part of speech share a cache.
      serializeQueryArgs: ({ queryArgs }) => advancedWordsParams({ ...queryArgs, lastWordId: null }).toString(),
      merge: (currentCache, newData, { arg }) => {
        if (arg.fetchAll || !arg.lastWordId) {
          return newData;
        }

        const existingIds = new Set(currentCache.words.map(w => w.id));
        const newWords = newData.words.filter(w => !existingIds.has(w.id));

        return {
          ...newData,
          words: [...currentCache.words, ...newWords],
          hasMore: newData.hasMore,
          lastWordId: newData.lastWordId,
        };
      },
      forceRefetch: ({ currentArg, previousArg }) => {
        if (currentArg?.fetchAll || previousArg?.fetchAll) {
          return currentArg?.fetchAll !== previousArg?.fetchAll;
        }
        return currentArg?.lastWordId !== previousArg?.lastWordId;
      },
      providesTags: [{ type: 'AdvancedWordList', id: 'LIST' }],
      keepUnusedDataFor: 60,
    }),
    previewGeneratedExercise: builder.mutation<GeneratedExercisePreviewResult, GeneratedExercisePreviewRequest>({
      query: body => ({
        url: '/admin/exercises/generated-preview',
        method: 'POST',
        body,
      }),
    }),
    getGeneratedExerciseWords: builder.query<GeneratedExercisePreviewResult, GeneratedExerciseWordsQueryArgs>({
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

export const { useGetAdvancedWordsQuery, usePreviewGeneratedExerciseMutation, useGetGeneratedExerciseWordsQuery } =
  advancedVocabularyApi;
