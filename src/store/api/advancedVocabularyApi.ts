import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { type VocabularyWordWithId } from '@/src/types/vocabulary/index';
import type { TableType } from '@/src/utils/schema-helpers';

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
  cellPaths?: string[];
  tableType?: TableType;
  select?: string[];
  fetchAll?: boolean;
  poolId?: string;
}

interface GetAdvancedWordsResponse {
  success: boolean;
  data: {
    words: VocabularyWordWithId[];
    hasMore: boolean;
    lastWordId: string | null;
    limit: number | null;
    filters: Record<string, unknown>;
    collection: string;
    totalCount?: number;
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
        if (args.fetchAll) {
          params.append('fetchAll', 'true');
        } else if (typeof args.limit === 'number') {
          params.append('limit', String(args.limit));
        }
        if (args.cellPaths && args.cellPaths.length > 0) {
          params.append('cellPaths', args.cellPaths.join(','));
          console.log('[RTK Query] Adding cellPaths:', args.cellPaths.join(','));
        }
        if (args.tableType) {
          params.append('tableType', args.tableType);
          console.log('[RTK Query] Adding tableType:', args.tableType);
        }

        if (args.select && args.select.length > 0) {
          params.append('select', args.select.join(','));
          console.log('[RTK Query] Adding select fields:', args.select);
        }

        if (args.poolId) {
          params.append('poolId', args.poolId);
          console.log('[RTK Query] Adding poolId:', args.poolId);
        }

        // randomize intentionally not set here (exercise generator decides server-side or via explicit config)

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
        console.log('[RTK Query] Transform response - received words:', response.data.words.length);
        console.log('[RTK Query] Sample word:', response.data.words[0]);
        return response.data;
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
          cellPaths: queryArgs.cellPaths,
          tableType: queryArgs.tableType,
          select: queryArgs.select,
          fetchAll: queryArgs.fetchAll,
          poolId: queryArgs.poolId,
        };
      },
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
  }),
});

export const { useGetAdvancedWordsQuery } = advancedVocabularyApi;
