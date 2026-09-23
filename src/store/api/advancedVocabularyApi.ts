import { createApi } from '@reduxjs/toolkit/query/react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { type VocabularyWordWithId } from '@/src/types/vocabulary/index';
import type { TableType } from '@/src/utils/schema-helpers';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import type { PosConfigs, FormIdentificationPosConfigs, PosGeneratorConfig } from '@/src/types/exercises/base';
import type { FormParadigm, ParadigmConfig, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import type { GeneratedExerciseType } from '@/src/config/exerciseSelectFields';
import { getExerciseAdditionalFields } from '@/src/config/exerciseSelectFields';
import { composeSelectFields } from '@/src/utils/generated/selectComposer';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { filterOverlappingPronounParadigms } from '@/src/utils/generated/pronounParadigmFiltering';
import { normalizeCollection } from '@/src/utils/exercises/legacyExerciseCompat';
import { PARADIGM_TABLE_TYPE, PARADIGM_POS_GROUP } from '@/src/config/paradigmDefinitions';
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

interface MultiPosQueryArgs {
  exerciseType: GeneratedExerciseType;
  collection: string;
  wordSource: 'filters' | 'pool';
  poolId?: string | null;
  poolWordLimit?: number | null;
  count?: number | 'all';
  posConfigs: PosConfigs | FormIdentificationPosConfigs;
}

interface MultiParadigmQueryArgs {
  exerciseType: 'generated-form-identification';
  collection: string;
  wordSource: 'filters' | 'pool';
  poolId?: string | null;
  poolWordLimit?: number | null;
  count?: number | 'all';
  paradigmConfigs: ParadigmConfigs;
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getPoolQueryParams(
  poolId: string,
  poolWordLimit?: number | null,
  poolSampleSeed?: string
): URLSearchParams {
  const params = new URLSearchParams();
  params.append('poolId', poolId);

  if (typeof poolWordLimit === 'number' && poolWordLimit > 0) {
    params.append('limit', String(Math.min(200, Math.floor(poolWordLimit))));
  } else {
    params.append('limit', '200');
  }
  if (poolSampleSeed) params.append('poolSampleSeed', poolSampleSeed);

  return params;
}

export async function fetchGeneratedWordPages(
  baseQuery: (argument: { url: string }) => unknown,
  initialParams: URLSearchParams,
  fetchAllPages: boolean,
  maxPoolIds?: number
): Promise<{ data?: GetAdvancedWordsResponse; error?: FetchBaseQueryError }> {
  const words: VocabularyWordWithId[] = [];
  const params = new URLSearchParams(initialParams);
  let lastResponse: GetAdvancedWordsResponse | null = null;
  while (true) {
    if (params.has('poolId') && typeof maxPoolIds === 'number' && maxPoolIds > 0) {
      const currentOffset = Number(params.get('poolOffset') ?? '0');
      const remainingIds = maxPoolIds - currentOffset;
      if (remainingIds <= 0) break;
      params.set('limit', String(Math.min(Number(params.get('limit') ?? '200'), remainingIds)));
    }
    const result = (await baseQuery({ url: `/words/generated?${params.toString()}` })) as {
      data?: unknown;
      error?: FetchBaseQueryError;
    };
    if (result.error) return { error: result.error };
    const response = result.data as GetAdvancedWordsResponse;
    lastResponse = response;
    words.push(...response.data.words);
    if (
      params.has('poolId') &&
      typeof maxPoolIds === 'number' &&
      maxPoolIds > 0 &&
      Number(response.data.nextPoolOffset) >= maxPoolIds
    )
      break;
    if (!fetchAllPages || !response.data.hasMore) break;
    if (params.has('poolId')) {
      const currentOffset = Number(params.get('poolOffset') ?? '0');
      const nextOffset = response.data.nextPoolOffset;
      if (!Number.isSafeInteger(nextOffset) || Number(nextOffset) <= currentOffset) {
        return { error: { status: 'CUSTOM_ERROR', error: 'Invalid generated pool pagination response' } };
      }
      params.set('poolOffset', String(nextOffset));
    } else {
      const previousCursor = params.get('lastWordId');
      const nextCursor = response.data.lastWordId;
      if (!nextCursor || nextCursor === previousCursor) {
        return { error: { status: 'CUSTOM_ERROR', error: 'Invalid generated word pagination response' } };
      }
      params.set('lastWordId', nextCursor);
    }
  }
  if (!lastResponse) return { error: { status: 'CUSTOM_ERROR', error: 'Empty generated word response' } };
  return {
    data: {
      ...lastResponse,
      data: {
        ...lastResponse.data,
        words: typeof maxPoolIds === 'number' && maxPoolIds > 0 ? words.slice(0, maxPoolIds) : words,
        hasMore: false,
        lastWordId: null,
        nextPoolOffset: undefined,
      },
    },
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
    getMultiPosWords: builder.query<GetAdvancedWordsResponse['data'], MultiPosQueryArgs>({
      async queryFn(arg, _api, _extraOptions, baseQuery) {
        const { exerciseType, collection, wordSource, poolId, poolWordLimit, count, posConfigs } = arg;
        const normalizedCollection = normalizeAdvancedVocabularyCollection(collection);
        const poolSampleSeed = wordSource === 'pool' && poolId ? Math.random().toString(36).slice(2) : undefined;

        const safePosConfigs = posConfigs && typeof posConfigs === 'object' ? posConfigs : {};

        const enabledEntries = Object.entries(safePosConfigs).filter(
          (entry): entry is [PartOfSpeech, PosGeneratorConfig] => {
            const [, cfg] = entry;
            return cfg?.enabled === true;
          }
        );

        // When using a pool with no POS configured, fetch all words from the pool
        if (enabledEntries.length === 0) {
          if (wordSource === 'pool' && poolId) {
            const additionalFields = getExerciseAdditionalFields(exerciseType);
            const selectFields = composeSelectFields(additionalFields, {});
            const params = getPoolQueryParams(poolId, poolWordLimit, poolSampleSeed);
            params.append('collection', normalizedCollection);
            params.append('exerciseMode', 'true');
            if (selectFields.length > 0) {
              params.append('select', selectFields.join(','));
            }

            const result = await fetchGeneratedWordPages(
              baseQuery,
              params,
              true,
              typeof poolWordLimit === 'number' && poolWordLimit > 0 ? Math.floor(poolWordLimit) : undefined
            );
            if (result.error) {
              return { error: result.error };
            }

            const responseData = result.data as GetAdvancedWordsResponse;
            const shuffled = shuffleArray(responseData.data.words);

            return {
              data: {
                words: shuffled,
                hasMore: false,
                lastWordId: null,
                limit: null,
                filters: {},
                collection: normalizedCollection,
              },
            };
          }

          return {
            data: {
              words: [],
              hasMore: false,
              lastWordId: null,
              limit: null,
              filters: {},
              collection: normalizedCollection,
            },
          };
        }

        const additionalFields = getExerciseAdditionalFields(exerciseType);

        const results = await Promise.all(
          enabledEntries.map(async ([pos, cfg]) => {
            const selectFields = composeSelectFields(additionalFields, {
              formSelection: cfg.formSelection,
            });
            const tableType = deriveTableTypeFromPOS(pos, cfg.filters?.pronounType, cfg.filters?.pronounPerson);

            const params = new URLSearchParams();
            params.append('collection', normalizedCollection);
            params.append('wordType', pos);

            if (wordSource === 'pool') {
              if (poolId) {
                const poolParams = getPoolQueryParams(poolId, poolWordLimit, poolSampleSeed);
                poolParams.forEach((value, key) => params.append(key, value));
              }
            } else if (count === 'all') {
              params.append('limit', '200');
            } else if (typeof count === 'number') {
              params.append('limit', String(Math.min(200, Math.max(1, Math.floor(count)))));
              // Use random starting point for true randomization in filter mode
              params.append('randomStart', String(Math.random()));
            }

            if (cfg.formSelection?.selectedCellPaths && cfg.formSelection.selectedCellPaths.length > 0) {
              params.append('cellPaths', cfg.formSelection.selectedCellPaths.join(','));
            }
            if (tableType) {
              params.append('tableType', tableType);
            }
            if (selectFields.length > 0) {
              params.append('select', selectFields.join(','));
            }

            // Signal exercise mode so the API adds root_word/selected_form
            // even for POS types without a tableType (e.g. prepositions)
            params.append('exerciseMode', 'true');

            if (wordSource !== 'pool') {
              if (pos === 'verb') {
                if (cfg.filters.verbConjugation && cfg.filters.verbConjugation !== 'all')
                  params.append('verbConjugation', cfg.filters.verbConjugation);
                if (cfg.filters.isDeponent && cfg.filters.isDeponent !== 'both')
                  params.append('isDeponent', cfg.filters.isDeponent);
              } else if (pos === 'noun') {
                if (cfg.filters.nounDeclension && cfg.filters.nounDeclension !== 'all')
                  params.append('nounDeclension', cfg.filters.nounDeclension);
              } else if (pos === 'adjective') {
                if (cfg.filters.adjectiveDeclension && cfg.filters.adjectiveDeclension !== 'all')
                  params.append('adjectiveDeclension', cfg.filters.adjectiveDeclension);
              } else if (pos === 'pronoun') {
                if (cfg.filters.pronounType && cfg.filters.pronounType !== 'all')
                  params.append('pronounType', cfg.filters.pronounType);
                if (
                  cfg.filters.pronounType === 'personal' &&
                  cfg.filters.pronounPerson &&
                  cfg.filters.pronounPerson !== 'all'
                )
                  params.append('pronounPerson', cfg.filters.pronounPerson);
              }
              if (cfg.filters.search) params.append('search', cfg.filters.search);
            }

            return fetchGeneratedWordPages(
              baseQuery,
              params,
              wordSource === 'pool' ? true : count === 'all',
              wordSource === 'pool' && typeof poolWordLimit === 'number' && poolWordLimit > 0
                ? Math.floor(poolWordLimit)
                : undefined
            );
          })
        );

        const errorResult = results.find(r => r.error);
        if (errorResult?.error) {
          return { error: errorResult.error };
        }

        const allWords: VocabularyWordWithId[] = [];
        for (const result of results) {
          if (result.data) {
            const responseData = result.data as GetAdvancedWordsResponse;
            allWords.push(...responseData.data.words);
          }
        }

        const shuffled = shuffleArray(allWords);

        return {
          data: {
            words: shuffled,
            hasMore: false,
            lastWordId: null,
            limit: null,
            filters: {},
            collection: normalizedCollection,
          },
        };
      },
      serializeQueryArgs: ({ queryArgs }) => JSON.stringify(queryArgs),
      providesTags: [{ type: 'AdvancedWordList', id: 'MULTI_POS' }],
      keepUnusedDataFor: 60,
    }),
    getMultiParadigmWords: builder.query<GetAdvancedWordsResponse['data'], MultiParadigmQueryArgs>({
      async queryFn(arg, _api, _extraOptions, baseQuery) {
        const { exerciseType, collection, wordSource, poolId, poolWordLimit, count, paradigmConfigs } = arg;
        const normalizedCollection = normalizeAdvancedVocabularyCollection(collection);
        const poolSampleSeed = wordSource === 'pool' && poolId ? Math.random().toString(36).slice(2) : undefined;

        const safeParadigmConfigs = paradigmConfigs && typeof paradigmConfigs === 'object' ? paradigmConfigs : {};

        const enabledEntries = Object.entries(safeParadigmConfigs).filter(
          (entry): entry is [FormParadigm, ParadigmConfig] => {
            const [, cfg] = entry;
            return cfg?.enabled === true;
          }
        );

        // When using a pool with no paradigm configured, fetch all words from the pool
        if (enabledEntries.length === 0) {
          if (wordSource === 'pool' && poolId) {
            const additionalFields = getExerciseAdditionalFields(exerciseType);
            const selectFields = composeSelectFields(additionalFields, {});
            const params = getPoolQueryParams(poolId, poolWordLimit, poolSampleSeed);
            params.append('collection', normalizedCollection);
            params.append('exerciseMode', 'true');
            if (selectFields.length > 0) {
              params.append('select', selectFields.join(','));
            }

            const result = await fetchGeneratedWordPages(
              baseQuery,
              params,
              true,
              typeof poolWordLimit === 'number' && poolWordLimit > 0 ? Math.floor(poolWordLimit) : undefined
            );
            if (result.error) {
              return { error: result.error };
            }

            const responseData = result.data as GetAdvancedWordsResponse;
            const shuffled = shuffleArray(responseData.data.words);

            return {
              data: {
                words: shuffled,
                hasMore: false,
                lastWordId: null,
                limit: null,
                filters: {},
                collection: normalizedCollection,
              },
            };
          }

          return {
            data: {
              words: [],
              hasMore: false,
              lastWordId: null,
              limit: null,
              filters: {},
              collection: normalizedCollection,
            },
          };
        }

        const additionalFields = getExerciseAdditionalFields(exerciseType);

        const results = await Promise.all(
          enabledEntries.map(async ([paradigm, cfg]) => {
            const pos = PARADIGM_POS_GROUP[paradigm];
            const tableType = PARADIGM_TABLE_TYPE[paradigm];

            const selectFields = composeSelectFields(additionalFields, {
              formSelection: cfg.formSelection,
            });

            const params = new URLSearchParams();
            params.append('collection', normalizedCollection);
            params.append('wordType', pos);

            if (wordSource === 'pool') {
              if (poolId) {
                const poolParams = getPoolQueryParams(poolId, poolWordLimit, poolSampleSeed);
                poolParams.forEach((value, key) => params.append(key, value));
              }
            } else if (count === 'all') {
              params.append('limit', '200');
            } else if (typeof count === 'number') {
              params.append('limit', String(Math.min(200, Math.max(1, Math.floor(count)))));
              params.append('randomStart', String(Math.random()));
            }

            if (cfg.formSelection?.selectedCellPaths && cfg.formSelection.selectedCellPaths.length > 0) {
              params.append('cellPaths', cfg.formSelection.selectedCellPaths.join(','));
            }
            if (cfg.steps?.length) {
              params.append('steps', cfg.steps.join(','));
            }
            if (tableType) {
              params.append('tableType', tableType);
            }
            if (selectFields.length > 0) {
              params.append('select', selectFields.join(','));
            }

            // Signal exercise mode so the API adds root_word/selected_form
            // even for POS types without a tableType (e.g. prepositions)
            params.append('exerciseMode', 'true');

            if (wordSource !== 'pool') {
              if (paradigm === 'verb-conjugation') {
                if (cfg.filters.verbConjugation && cfg.filters.verbConjugation !== 'all') {
                  params.append('verbConjugation', cfg.filters.verbConjugation);
                }
                if (cfg.filters.isDeponent && cfg.filters.isDeponent !== 'both') {
                  params.append('isDeponent', cfg.filters.isDeponent);
                }
              } else if (paradigm === 'noun-declension') {
                if (cfg.filters.nounDeclension && cfg.filters.nounDeclension !== 'all') {
                  params.append('nounDeclension', cfg.filters.nounDeclension);
                }
              } else if (paradigm === 'adjective-declension') {
                if (cfg.filters.adjectiveDeclension && cfg.filters.adjectiveDeclension !== 'all') {
                  params.append('adjectiveDeclension', cfg.filters.adjectiveDeclension);
                }
              } else if (paradigm === 'pronoun-personal') {
                params.append('pronounType', 'personal');
                params.append('pronounPerson', '1st,2nd');
              } else if (paradigm === 'pronoun-gendered') {
                if (cfg.filters.pronounType === 'personal') {
                  params.append('pronounType', 'personal');
                  params.append('pronounPerson', '3rd');
                } else if (cfg.filters.pronounType && cfg.filters.pronounType !== 'all') {
                  params.append('pronounType', cfg.filters.pronounType);
                }
              }

              if (cfg.filters.search) {
                params.append('search', cfg.filters.search);
              }
            }

            return fetchGeneratedWordPages(
              baseQuery,
              params,
              wordSource === 'pool' ? true : count === 'all',
              wordSource === 'pool' && typeof poolWordLimit === 'number' && poolWordLimit > 0
                ? Math.floor(poolWordLimit)
                : undefined
            );
          })
        );

        const errorResult = results.find(r => r.error);
        if (errorResult?.error) {
          return { error: errorResult.error };
        }

        const allWords: VocabularyWordWithId[] = [];
        for (const result of results) {
          if (result.data) {
            const responseData = result.data as GetAdvancedWordsResponse;
            allWords.push(...responseData.data.words);
          }
        }

        const filteredWords = filterOverlappingPronounParadigms(allWords, paradigmConfigs);

        const shuffled = shuffleArray(filteredWords);

        return {
          data: {
            words: shuffled,
            hasMore: false,
            lastWordId: null,
            limit: null,
            filters: {},
            collection: normalizedCollection,
          },
        };
      },
      serializeQueryArgs: ({ queryArgs }) => JSON.stringify(queryArgs),
      providesTags: [{ type: 'AdvancedWordList', id: 'MULTI_PARADIGM' }],
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

export const {
  useGetAdvancedWordsQuery,
  useGetMultiPosWordsQuery,
  useGetMultiParadigmWordsQuery,
  usePreviewGeneratedExerciseMutation,
  useGetGeneratedExerciseWordsQuery,
} = advancedVocabularyApi;
