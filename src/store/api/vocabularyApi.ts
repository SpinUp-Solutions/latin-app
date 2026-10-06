import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/index';
import { appApi } from './appApi';
import { STUDENT_POOLS_TAG } from './tags';
import { VocabularyWordWithIdSchema } from '@/shared/types/vocabulary/schemas';
import { z, ZodError } from 'zod';

type ZodIssue = z.core.$ZodIssue;

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

export const vocabularyApi = appApi.injectEndpoints({
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
        if (!previousArg) return true;
        if (currentArg?.search !== previousArg.search) return true;
        if (currentArg?.wordType !== previousArg.wordType) return true;
        return currentArg?.lastWordId !== previousArg.lastWordId;
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

    updateWord: builder.mutation<VocabularyWordWithId, { wordId: string; updates: Partial<VocabularyWord> }>({
      query: ({ wordId, updates }) => {
        return {
          url: '/admin/words',
          method: 'PUT',
          body: { wordId, updates },
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
        // Show the edit in every loaded word list at once; a failed save rolls it back.
        const patches = vocabularyApi.util.selectCachedArgsForQuery(getState(), 'getWords').map(cachedArgs =>
          dispatch(
            vocabularyApi.util.updateQueryData('getWords', cachedArgs, draft => {
              const word = draft.words.find(candidate => candidate.id === wordId);
              if (word) Object.assign(word, updates);
            })
          )
        );
        await queryFulfilled.catch(() => patches.forEach(patch => patch.undo()));
      },
      invalidatesTags: (result, error, { wordId }) => [
        { type: 'Word', id: wordId },
        { type: 'WordList', id: 'LIST' },
        ...(error ? [] : [STUDENT_POOLS_TAG]),
      ],
    }),

    createWord: builder.mutation<VocabularyWordWithId, { wordData: Omit<VocabularyWord, 'createdAt' | 'updatedAt'> }>({
      query: ({ wordData }) => {
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
      invalidatesTags: result =>
        result?.success
          ? [
              { type: 'Word', id: 'LIST' },
              { type: 'WordList', id: 'LIST' },
              { type: 'WordCounts', id: 'COUNTS' },
              STUDENT_POOLS_TAG,
            ]
          : [],
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
} = vocabularyApi;
