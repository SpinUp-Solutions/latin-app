import { createApi } from '@reduxjs/toolkit/query/react';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary-new';
import { createAuthenticatedBaseQuery } from './baseQuery';

interface WordsResponse {
  success: boolean;
  data: {
    words: VocabularyWordWithId[];
    hasMore: boolean;
    lastWordId: string | null;
    wordTypeCounts?: Record<string, number>;
    filters: {
      wordType?: string;
      search?: string;
    };
  };
}

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
      { words: VocabularyWordWithId[]; hasMore: boolean; lastWordId: string | null },
      {
        wordType?: string;
        search?: string;
        limit?: number;
        lastWordId?: string | null;
      }
    >({
      query: ({ wordType, search, limit = 20, lastWordId }) => {
        const params = new URLSearchParams({ limit: limit.toString() });

        if (wordType && wordType !== 'all') params.append('wordType', wordType);
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
          search: queryArgs.search,
        };
      },
      merge: (currentCache, newData, { arg }) => {
        if (!arg.lastWordId) {
          return newData;
        }

        const existingWords = new Map(currentCache.words.map(w => [w.id, w]));

        newData.words.forEach(word => {
          existingWords.set(word.id, word);
        });

        return {
          ...newData,
          words: Array.from(existingWords.values()),
          hasMore: newData.hasMore,
          lastWordId: newData.lastWordId,
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

    getWordById: builder.query<VocabularyWordWithId, string>({
      query: wordId => `/admin/words/${wordId}`,
      transformResponse: (response: { success: boolean; data: { word: VocabularyWordWithId } }) => response.data.word,
      providesTags: (result, error, wordId) => [{ type: 'Word', id: wordId }],
    }),

    updateWord: builder.mutation<VocabularyWordWithId, { wordId: string; updates: Partial<VocabularyWord> }>({
      query: ({ wordId, updates }) => ({
        url: '/admin/words',
        method: 'PUT',
        body: { wordId, updates },
      }),
      transformResponse: (response: { success: boolean; updatedData: VocabularyWordWithId }) => response.updatedData,
      async onQueryStarted({ wordId, updates }, { dispatch, queryFulfilled, getState }) {
        const patchResults: { undo: () => void }[] = [];

        const state = getState() as {
          vocabularyApi?: { queries?: Record<string, { data?: { words?: VocabularyWordWithId[] } }> };
        };
        const cachedQueries = state.vocabularyApi?.queries || {};

        Object.entries(cachedQueries).forEach(([key, value]) => {
          if (key.startsWith('getWords') && value?.data?.words) {
            const argsMatch = key.match(/getWords\((.*)\)/);
            if (argsMatch) {
              try {
                const originalArgs = JSON.parse(argsMatch[1]);
                const patchResult = dispatch(
                  vocabularyApi.util.updateQueryData('getWords', originalArgs, draft => {
                    const word = draft.words.find(w => w.id === wordId);
                    if (word) {
                      Object.assign(word, updates);
                    }
                  })
                );
                patchResults.push(patchResult);
              } catch (e) {
                console.error('Error parsing query args:', e);
              }
            }
          }
        });

        try {
          await queryFulfilled;
        } catch {
          patchResults.forEach(patch => patch.undo());
        }
      },
      invalidatesTags: (result, error, { wordId }) => [
        { type: 'Word', id: wordId },
        { type: 'WordList', id: 'LIST' },
      ],
    }),

    createWord: builder.mutation<VocabularyWordWithId, Omit<VocabularyWord, 'createdAt' | 'updatedAt'>>({
      query: wordData => ({
        url: '/admin/words',
        method: 'POST',
        body: wordData,
      }),
      transformResponse: (response: { success: boolean; data: { word: VocabularyWordWithId } }) => response.data.word,
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
