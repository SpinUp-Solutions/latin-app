import { createApi } from '@reduxjs/toolkit/query/react';
import { type VocabularyWordWithId } from '@/src/types/vocabulary/index';
import type { TableType } from '@/src/utils/schema-helpers';
import { normalizeCollection } from '@/src/utils/exercises/legacyExerciseCompat';
import { createAuthenticatedBaseQuery } from './baseQuery';
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
  partOfSpeech?: string;
  search?: string;
  lastWordId?: string | null;
  verbConjugation?: string;
  isDeponent?: string;
  nounDeclension?: string;
  adjectiveDeclension?: string;
  pronounType?: string;
  pronounPerson?: string;
  limit?: number;
  cellPaths?: string[];
  tableType?: TableType;
  select?: string[];
  fetchAll?: boolean;
  poolId?: string;
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

export const advancedVocabularyApi = createApi({
  reducerPath: 'advancedVocabularyApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['AdvancedWordList'],
  endpoints: builder => ({
    getAdvancedWords: builder.query<GetAdvancedWordsResponse['data'], GetAdvancedWordsArgs>({
      query: args => {
        const params = new URLSearchParams();

        if (args.collection) {
          params.append('collection', normalizeAdvancedVocabularyCollection(args.collection));
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
        }
        if (args.tableType) {
          params.append('tableType', args.tableType);
        }

        if (args.select && args.select.length > 0) {
          params.append('select', args.select.join(','));
        }

        if (args.poolId) {
          params.append('poolId', args.poolId);
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
        } else if (args.partOfSpeech === 'pronoun') {
          if (args.pronounType && args.pronounType !== 'all') {
            params.append('pronounType', args.pronounType);
          }
          if (args.pronounType === 'personal' && args.pronounPerson && args.pronounPerson !== 'all') {
            params.append('pronounPerson', args.pronounPerson);
          }
        }

        return {
          url: `/admin/words?${params.toString()}`,
        };
      },
      transformResponse: (response: GetAdvancedWordsResponse) => {
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
          pronounType: queryArgs.pronounType,
          pronounPerson: queryArgs.pronounPerson,
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
