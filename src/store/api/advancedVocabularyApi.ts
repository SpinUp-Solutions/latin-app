import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { type VocabularyWordWithId } from '@/src/types/vocabulary/index';
import { VocabularyWordWithIdSchema } from '@/src/types/vocabulary/schemas';
import { ZodError, type ZodIssue } from 'zod';

interface GetAdvancedWordsArgs {
  collection?: string;
  partOfSpeech?: string;
  search?: string;
  lastWordId?: string | null;
  verbConjugation?: string;
  isDeponent?: string;
  nounDeclension?: string;
  adjectiveDeclension?: string;
  limit?: number;
}

interface GetAdvancedWordsResponse {
  success: boolean;
  data: {
    words: VocabularyWordWithId[];
    hasMore: boolean;
    lastWordId: string | null;
    limit: number;
    filters: Record<string, unknown>;
    collection: string;
  };
}

export const advancedVocabularyApi = createApi({
  reducerPath: 'advancedVocabularyApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['AdvancedWordList'],
  endpoints: builder => ({
    getAdvancedWords: builder.query<GetAdvancedWordsResponse['data'], GetAdvancedWordsArgs>({
      query: args => {
        const params = new URLSearchParams();

        if (args.collection) {
          params.append('collection', args.collection);
        }
        if (args.partOfSpeech && args.partOfSpeech !== 'all') {
          params.append('wordType', args.partOfSpeech);
        }
        if (args.search) {
          params.append('search', args.search);
        }
        if (args.lastWordId) {
          params.append('lastWordId', args.lastWordId);
        }
        if (args.limit) {
          params.append('limit', String(args.limit));
        }

        if (args.partOfSpeech === 'verb') {
          if (args.verbConjugation && args.verbConjugation !== 'all') {
            params.append('verbConjugation', args.verbConjugation);
          }
          if (args.isDeponent && args.isDeponent !== 'both') {
            params.append('isDeponent', args.isDeponent);
          }
        } else if (args.partOfSpeech === 'noun') {
          if (args.nounDeclension && args.nounDeclension !== 'all') {
            params.append('nounDeclension', args.nounDeclension);
          }
        } else if (args.partOfSpeech === 'adjective') {
          if (args.adjectiveDeclension && args.adjectiveDeclension !== 'all') {
            params.append('adjectiveDeclension', args.adjectiveDeclension);
          }
        }

        return {
          url: `/admin/words?${params.toString()}`,
        };
      },
      transformResponse: (response: GetAdvancedWordsResponse) => {
        try {
          const validatedWords = response.data.words.map(
            word => VocabularyWordWithIdSchema.parse(word) as VocabularyWordWithId
          );
          return {
            ...response.data,
            words: validatedWords,
          };
        } catch (error) {
          if (error instanceof ZodError) {
            console.error('Advanced vocabulary validation error:', error.issues);
            throw new Error(`Invalid vocabulary data: ${error.issues.map((e: ZodIssue) => e.message).join(', ')}`);
          }
          throw error;
        }
      },
      serializeQueryArgs: ({ queryArgs }) => {
        return {
          collection: queryArgs.collection,
          partOfSpeech: queryArgs.partOfSpeech,
          search: queryArgs.search,
          verbConjugation: queryArgs.verbConjugation,
          isDeponent: queryArgs.isDeponent,
          nounDeclension: queryArgs.nounDeclension,
          adjectiveDeclension: queryArgs.adjectiveDeclension,
          limit: queryArgs.limit,
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
      providesTags: [{ type: 'AdvancedWordList', id: 'LIST' }],
      keepUnusedDataFor: 60,
    }),
  }),
});

export const { useGetAdvancedWordsQuery } = advancedVocabularyApi;
