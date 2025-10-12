import { createApi } from '@reduxjs/toolkit/query/react';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/index';
import { createAuthenticatedBaseQuery } from './baseQuery';
import { VocabularyWordWithIdSchema } from '@/src/types/vocabulary/schemas';
import { ZodError, ZodIssue } from 'zod';

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
      query: ({ wordType, search, limit = 20, lastWordId, collection = 'vocabulary_words_v2' }) => {
        const params = new URLSearchParams({ limit: limit.toString() });

        if (wordType && wordType !== 'all') params.append('wordType', wordType);
        if (search) params.append('search', search);
        if (lastWordId) params.append('lastWordId', lastWordId);
        if (collection) params.append('collection', collection);

        return `/admin/words?${params}`;
      },
      transformResponse: (response: WordsResponse) => {
        const validatedWords = response.data.words.flatMap((word: unknown) => {
          const result = VocabularyWordWithIdSchema.safeParse(word);
          if (result.success) return [result.data as VocabularyWordWithId];
          console.warn('Vocabulary validation skipped invalid item:', result.error.issues);
          return [] as VocabularyWordWithId[];
        });
        return {
          words: validatedWords,
          hasMore: response.data.hasMore,
          lastWordId: response.data.lastWordId,
        };
      },
      serializeQueryArgs: ({ queryArgs }) => {
        return {
          wordType: queryArgs.wordType,
          search: queryArgs.search,
          collection: queryArgs.collection || 'vocabulary_words_v2',
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
        const collection = arg?.collection || 'vocabulary_words_v2';
        return `/admin/words?countsOnly=true&collection=${encodeURIComponent(collection)}`;
      },
      transformResponse: (response: WordsResponse) => response.data.wordTypeCounts || {},
      providesTags: [{ type: 'WordCounts', id: 'COUNTS' }],
    }),

    getWordById: builder.query<VocabularyWordWithId, string>({
      query: wordId => `/admin/words/${wordId}`,
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
      providesTags: (result, error, wordId) => [{ type: 'Word', id: wordId }],
    }),

    updateWord: builder.mutation<
      VocabularyWordWithId,
      { wordId: string; updates: Partial<VocabularyWord>; collection?: string }
    >({
      query: ({ wordId, updates, collection = 'vocabulary_words_v2' }) => {
        return {
          url: '/admin/words',
          method: 'PUT',
          body: { wordId, updates, collection },
        };
      },
      transformResponse: (response: { success: boolean; updatedData: VocabularyWordWithId }) => {
        try {
          console.log('API transformResponse - validating updatedData:', JSON.stringify(response.updatedData, null, 2));
          const result = VocabularyWordWithIdSchema.parse(response.updatedData);
          console.log('API validation PASSED');
          return result as VocabularyWordWithId;
        } catch (error) {
          if (error instanceof ZodError) {
            console.error('API Vocabulary validation error DETAILS:');
            error.issues.forEach((issue, index) => {
              console.error(`  Issue ${index + 1}:`, {
                path: issue.path.join('.'),
                message: issue.message,
                code: issue.code,
                received: 'received' in issue ? issue.received : undefined,
              });
            });
            console.error('Failed data structure:', Object.keys(response.updatedData));
            console.error('Missing id?', !('id' in response.updatedData));
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
                    const word = draft.words.find((w: VocabularyWordWithId) => w.id === wordId);
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
      query: wordData => {
        return {
          url: '/admin/words',
          method: 'POST',
          body: wordData,
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
