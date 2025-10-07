import { createApi } from '@reduxjs/toolkit/query/react';
import { Word, WordsResponse } from '@/src/types/admin-vocabulary';
import { createAuthenticatedBaseQuery } from './baseQuery';

export const vocabularyApi = createApi({
  reducerPath: 'vocabularyApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['Word', 'WordList', 'WordCounts'],
  keepUnusedDataFor: 60 * 5,
  refetchOnMountOrArgChange: 30,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: builder => ({
    getWords: builder.query<
      { words: Word[]; hasMore: boolean; lastWordId: string | null },
      {
        wordType?: string;
        section?: string;
        search?: string;
        limit?: number;
        lastWordId?: string | null;
      }
    >({
      query: ({ wordType, section, search, limit = 20, lastWordId }) => {
        const params = new URLSearchParams({ limit: limit.toString() });

        if (wordType && wordType !== 'all') params.append('wordType', wordType);
        if (section && section !== 'all') params.append('section', section);
        if (search) params.append('search', search);
        if (lastWordId) params.append('lastWordId', lastWordId);

        return `/admin/words?${params}`;
      },
      transformResponse: (response: WordsResponse) => ({
        words: response.data.words,
        hasMore: response.data.hasMore,
        lastWordId: response.data.lastWordId,
      }),
      serializeQueryArgs: ({ queryArgs }) => {
        return {
          wordType: queryArgs.wordType,
          section: queryArgs.section,
          search: queryArgs.search,
        };
      },
      merge: (currentCache, newData, { arg }) => {
        if (!arg.lastWordId) {
          return newData;
        }
        return {
          ...newData,
          words: [...currentCache.words, ...newData.words],
        };
      },
      forceRefetch: ({ currentArg, previousArg }) => {
        return currentArg?.lastWordId !== previousArg?.lastWordId;
      },
      providesTags: result =>
        result
          ? [...result.words.map(({ id }) => ({ type: 'Word' as const, id })), { type: 'WordList', id: 'LIST' }]
          : [{ type: 'WordList', id: 'LIST' }],
    }),

    getWordTypeCounts: builder.query<Record<string, number>, void>({
      query: () => '/admin/words?countsOnly=true',
      transformResponse: (response: WordsResponse) => response.data.wordTypeCounts || {},
      providesTags: [{ type: 'WordCounts', id: 'COUNTS' }],
    }),

    getWordById: builder.query<Word, string>({
      query: wordId => `/admin/words/${wordId}`,
      transformResponse: (response: { success: boolean; data: { word: Word } }) => response.data.word,
      providesTags: (result, error, wordId) => [{ type: 'Word', id: wordId }],
    }),

    updateWord: builder.mutation<Word, { wordId: string; updates: Partial<Word> }>({
      query: ({ wordId, updates }) => ({
        url: '/admin/words',
        method: 'PUT',
        body: { wordId, updates },
      }),
      transformResponse: (response: { success: boolean; updatedData: Word }) => response.updatedData,
      invalidatesTags: (result, error, { wordId }) => [
        { type: 'Word', id: wordId },
        { type: 'WordList', id: 'LIST' },
      ],
    }),

    createWord: builder.mutation<Word, Omit<Word, 'id' | 'createdAt' | 'updatedAt'>>({
      query: wordData => ({
        url: '/admin/words',
        method: 'POST',
        body: wordData,
      }),
      transformResponse: (response: { success: boolean; data: { word: Word } }) => response.data.word,
      invalidatesTags: [
        { type: 'WordList', id: 'LIST' },
        { type: 'WordCounts', id: 'COUNTS' },
      ],
    }),

    deleteWord: builder.mutation<void, string>({
      query: wordId => ({
        url: `/admin/words/${wordId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, wordId) => [
        { type: 'Word', id: wordId },
        { type: 'WordList', id: 'LIST' },
        { type: 'WordCounts', id: 'COUNTS' },
      ],
    }),

    bulkDeleteWords: builder.mutation<{ deletedCount: number }, string[]>({
      query: wordIds => ({
        url: '/admin/words/bulk-delete',
        method: 'POST',
        body: { wordIds },
      }),
      transformResponse: (response: { success: boolean; data: { deletedCount: number } }) => response.data,
      invalidatesTags: [
        { type: 'WordList', id: 'LIST' },
        { type: 'WordCounts', id: 'COUNTS' },
      ],
    }),
  }),
});

export const {
  useGetWordsQuery,
  useGetWordTypeCountsQuery,
  useGetWordByIdQuery,
  useUpdateWordMutation,
  useCreateWordMutation,
  useDeleteWordMutation,
  useBulkDeleteWordsMutation,
} = vocabularyApi;
