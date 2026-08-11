import { createApi } from '@reduxjs/toolkit/query/react';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/index';
import { createAuthenticatedBaseQuery } from './baseQuery';
import { VocabularyWordWithIdSchema } from '@/shared/types/vocabulary/schemas';
import { z, ZodError } from 'zod';

type ZodIssue = z.core.$ZodIssue;
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { vocabularyPoolApi } from './vocabularyPoolApi';

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
    collection?: string;
  };
}

export interface DeleteWordResponse {
  success: boolean;
  warning?: boolean;
  confirmationToken?: string;
  referencedPools?: { id: string; name: string }[];
  referencedPoolCount?: number;
  message?: string;
  cleanedPools?: string[];
  cleanedPoolCount?: number;
}

export interface VocabularySearchResult {
  id: string;
  word: string;
  translation: string;
  part_of_speech: string;
  dictionary_entry: string | null;
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
        collection?: string;
      }
    >({
      query: ({ wordType, search, limit = 20, lastWordId, collection = VOCABULARY_WORDS_COLLECTION }) => {
        const params = new URLSearchParams({ limit: limit.toString() });

        if (wordType && wordType !== 'all') params.append('wordType', wordType);
        if (search) params.append('search', search);
        if (lastWordId) params.append('lastWordId', lastWordId);
        if (collection) params.append('collection', collection);

        return `/admin/words?${params}`;
      },
      transformResponse: (response: WordsResponse) => {
        return {
          words: response.data.words,
          hasMore: response.data.hasMore,
          lastWordId: response.data.lastWordId,
        };
      },
      serializeQueryArgs: ({ queryArgs }) => {
        return {
          wordType: queryArgs.wordType,
          search: queryArgs.search,
          collection: queryArgs.collection || VOCABULARY_WORDS_COLLECTION,
        };
      },
      merge: (currentCache, newData, { arg }) => {
        if (!arg.lastWordId) {
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
        return currentArg?.lastWordId !== previousArg?.lastWordId;
      },
      providesTags: result =>
        result
          ? [...result.words.map(({ id }) => ({ type: 'Word' as const, id })), { type: 'WordList', id: 'LIST' }]
          : [{ type: 'WordList', id: 'LIST' }],
    }),

    getWordTypeCounts: builder.query<Record<string, number>, { collection?: string } | void>({
      query: arg => {
        const collection = arg?.collection || VOCABULARY_WORDS_COLLECTION;
        return `/admin/words?countsOnly=true&collection=${encodeURIComponent(collection)}`;
      },
      transformResponse: (response: WordsResponse) => response.data.wordTypeCounts || {},
      providesTags: [{ type: 'WordCounts', id: 'COUNTS' }],
    }),

    updateWord: builder.mutation<
      VocabularyWordWithId,
      { wordId: string; updates: Partial<VocabularyWord>; collection?: string }
    >({
      query: ({ wordId, updates, collection = VOCABULARY_WORDS_COLLECTION }) => {
        return {
          url: '/admin/words',
          method: 'PUT',
          body: { wordId, updates, collection },
        };
      },
      transformResponse: (response: { success: boolean; updatedData: VocabularyWordWithId }) => {
        try {
          return VocabularyWordWithIdSchema.parse(response.updatedData) as VocabularyWordWithId;
        } catch (error) {
          if (error instanceof ZodError) {
            throw new Error(
              `Invalid vocabulary data: ${error.issues.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
            );
          }
          throw error;
        }
      },
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
          dispatch(vocabularyPoolApi.util.invalidateTags([{ type: 'Pool', id: 'STUDENT_LIST' }]));
        } catch {
          patchResults.forEach(patch => patch.undo());
        }
      },
      invalidatesTags: (result, error, { wordId }) => [
        { type: 'Word', id: wordId },
        { type: 'WordList', id: 'LIST' },
      ],
    }),

    createWord: builder.mutation<
      VocabularyWordWithId,
      { wordData: Omit<VocabularyWord, 'createdAt' | 'updatedAt'>; collection?: string }
    >({
      query: ({ wordData, collection = VOCABULARY_WORDS_COLLECTION }) => {
        return {
          url: '/admin/words',
          method: 'POST',
          body: { ...wordData, collection },
        };
      },
      transformResponse: (response: { success: boolean; data: { word: VocabularyWordWithId } }) => {
        try {
          return VocabularyWordWithIdSchema.parse(response.data.word) as VocabularyWordWithId;
        } catch (error) {
          if (error instanceof ZodError) {
            console.error('Vocabulary validation error:', error.issues);
            throw new Error(`Invalid vocabulary data: ${error.issues.map((e: ZodIssue) => e.message).join(', ')}`);
          }
          throw error;
        }
      },
      invalidatesTags: [
        { type: 'WordList', id: 'LIST' },
        { type: 'WordCounts', id: 'COUNTS' },
      ],
    }),

    searchWords: builder.query<VocabularySearchResult[], { search: string; limit?: number }>({
      query: ({ search, limit = 12 }) => {
        const params = new URLSearchParams({ search, limit: limit.toString() });
        return `/words/search?${params}`;
      },
      transformResponse: (response: { success: boolean; data: { words: VocabularySearchResult[] } }) =>
        response.data.words,
    }),

    deleteWord: builder.mutation<DeleteWordResponse, { wordId: string; confirmationToken?: string }>({
      query: ({ wordId, confirmationToken }) => ({
        url: `/admin/words/${wordId}`,
        method: 'DELETE',
        ...(confirmationToken ? { body: { confirmationToken } } : {}),
      }),
      transformResponse: (response: DeleteWordResponse) => response,
      async onQueryStarted(_argument, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(vocabularyPoolApi.util.invalidateTags([{ type: 'Pool', id: 'STUDENT_LIST' }]));
        } catch {
          // Failed deletions leave cached pool content unchanged.
        }
      },
      invalidatesTags: result =>
        result?.success
          ? [
              { type: 'Word', id: 'LIST' },
              { type: 'WordList', id: 'LIST' },
              { type: 'WordCounts', id: 'COUNTS' },
            ]
          : [],
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
  useUpdateWordMutation,
  useCreateWordMutation,
  useSearchWordsQuery,
  useLazySearchWordsQuery,
  useDeleteWordMutation,
  useBulkDeleteWordsMutation,
} = vocabularyApi;
