import { createApi } from '@reduxjs/toolkit/query/react';
import {
  VocabularyPool,
  VocabularyPoolSummary,
  VocabularyPoolWithWords,
  CreatePoolRequest,
  VocabularyPoolDeletionChallenge,
  VocabularyPoolUsageResponse,
} from '@/src/types/vocabulary-pool';
import { Word } from '@/src/types/admin-vocabulary';
import { createAuthenticatedBaseQuery } from './baseQuery';
import { buildAdvancedFilterParams, POOL_WORD_FIELDS } from '@/src/utils/wordFilters';
import type { PoolFilters } from '@/src/types/pool-filters';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import type { FormParadigm } from '@/src/types/exercises/paradigm';
import type { VocabularyPoolStudyData } from '@/src/types/vocabulary';

interface POSSummaryData {
  summary: Record<PartOfSpeech, number>;
  totalWords: number;
  poolId: string;
}

interface ParadigmSummaryData {
  paradigmSummary: Partial<Record<FormParadigm, number>>;
  posSummary: Partial<Record<PartOfSpeech, number>>;
  totalWords: number;
  poolId: string;
}

export const vocabularyPoolApi = createApi({
  reducerPath: 'vocabularyPoolApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['Pool', 'PoolList', 'PoolUsage', 'AvailableWords'],
  keepUnusedDataFor: 60 * 5,
  refetchOnMountOrArgChange: 300,
  refetchOnFocus: false,
  refetchOnReconnect: true,
  endpoints: builder => ({
    getVocabularyPoolUsages: builder.query<VocabularyPoolUsageResponse, void>({
      query: () => '/admin/vocabulary-pools/usages',
      transformResponse: (response: { success: boolean; data: VocabularyPoolUsageResponse }) => response.data,
      providesTags: [{ type: 'PoolUsage', id: 'MANAGEMENT' }],
    }),

    getPools: builder.query<
      { pools: VocabularyPoolSummary[]; hasMore: boolean; lastPoolId: string | null },
      {
        reset?: boolean;
        filters?: {
          search?: string;
          difficulty?: string;
          tags?: string[];
          isActive?: boolean | null;
          sortBy?: 'name' | 'createdAt' | 'wordCount';
          sortOrder?: 'asc' | 'desc';
        };
        lastPoolId?: string | null;
      }
    >({
      query: ({ filters, lastPoolId }) => {
        const params = new URLSearchParams({ limit: '20' });

        if (lastPoolId) params.append('lastPoolId', lastPoolId);
        if (filters?.search) params.append('search', filters.search);
        if (filters?.difficulty) params.append('difficulty', filters.difficulty);
        if (filters?.isActive !== null && filters?.isActive !== undefined) {
          params.append('isActive', filters.isActive.toString());
        }
        if (filters?.sortBy) params.append('sortBy', filters.sortBy);
        if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);

        return `/admin/vocabulary-pools?${params}`;
      },
      transformResponse: (response: {
        success: boolean;
        data: { pools: VocabularyPoolSummary[]; hasMore: boolean; lastPoolId: string | null };
      }) => response.data,
      serializeQueryArgs: ({ queryArgs }) => {
        return { filters: queryArgs.filters };
      },
      merge: (currentCache, newData, { arg }) => {
        if (!arg.lastPoolId) return newData;
        const existingIds = new Set(currentCache.pools.map(p => p.id));
        const newPools = newData.pools.filter(p => !existingIds.has(p.id));
        return {
          ...newData,
          pools: [...currentCache.pools, ...newPools],
        };
      },
      forceRefetch: ({ currentArg, previousArg }) => {
        return currentArg?.lastPoolId !== previousArg?.lastPoolId;
      },
      providesTags: result =>
        result
          ? [...result.pools.map(({ id }) => ({ type: 'Pool' as const, id })), { type: 'PoolList', id: 'LIST' }]
          : [{ type: 'PoolList', id: 'LIST' }],
    }),

    getPool: builder.query<VocabularyPoolWithWords & { missingWordIds?: string[]; actualWordCount?: number }, string>({
      query: poolId => `/admin/vocabulary-pools/${poolId}`,
      transformResponse: (response: {
        success: boolean;
        data: { pool: VocabularyPoolWithWords; missingWordIds?: string[]; actualWordCount?: number };
      }) => ({
        ...response.data.pool,
        missingWordIds: response.data.missingWordIds,
        actualWordCount: response.data.actualWordCount,
      }),
      providesTags: (result, error, poolId) => [{ type: 'Pool', id: poolId }],
    }),

    getStudentPool: builder.query<VocabularyPoolStudyData, string>({
      async queryFn(poolId, _api, _extraOptions, baseQuery) {
        const items: VocabularyPoolStudyData['items'] = [];
        let offset = 0;
        let identity: Pick<VocabularyPoolStudyData, 'id' | 'name'> | null = null;
        while (true) {
          const result = await baseQuery(`/vocabulary-pools/${poolId}/words?limit=200&offset=${offset}`);
          if (result.error) return { error: result.error };
          const response = result.data as {
            success: boolean;
            data: VocabularyPoolStudyData & { hasMore: boolean; nextOffset: number };
          };
          identity ??= { id: response.data.id, name: response.data.name };
          items.push(...response.data.items);
          if (!response.data.hasMore) break;
          if (!Number.isSafeInteger(response.data.nextOffset) || response.data.nextOffset <= offset) {
            return { error: { status: 'CUSTOM_ERROR', error: 'Invalid vocabulary pool pagination response' } };
          }
          offset = response.data.nextOffset;
        }
        return { data: { id: identity?.id ?? poolId, name: identity?.name ?? 'Vocabulary Pool', items } };
      },
      providesTags: (result, error, poolId) => [
        { type: 'Pool', id: `student-${poolId}` },
        { type: 'Pool', id: 'STUDENT_LIST' },
      ],
    }),

    getPoolSummary: builder.query<VocabularyPoolSummary, string>({
      query: poolId => `/admin/vocabulary-pools/${poolId}/summary`,
      transformResponse: (response: { success: boolean; data: { pool: VocabularyPoolSummary } }) => response.data.pool,
      providesTags: (result, error, poolId) => [{ type: 'Pool', id: poolId }],
    }),

    getPoolPOSSummary: builder.query<POSSummaryData, string>({
      query: poolId => `/admin/vocabulary-pools/${poolId}/pos-summary`,
      transformResponse: (response: { success: boolean; data: POSSummaryData }) => response.data,
      providesTags: (result, error, poolId) => [{ type: 'Pool', id: `${poolId}-pos-summary` }],
    }),

    getPoolParadigmSummary: builder.query<ParadigmSummaryData, string>({
      query: poolId => `/admin/vocabulary-pools/${poolId}/paradigm-summary`,
      transformResponse: (response: { success: boolean; data: ParadigmSummaryData }) => response.data,
      providesTags: (result, error, poolId) => [{ type: 'Pool', id: `${poolId}-paradigm-summary` }],
    }),

    createPool: builder.mutation<VocabularyPool, CreatePoolRequest>({
      query: poolData => ({
        url: '/admin/vocabulary-pools',
        method: 'POST',
        body: poolData,
      }),
      transformResponse: (response: { success: boolean; data: { pool: VocabularyPool } }) => response.data.pool,
      invalidatesTags: [{ type: 'PoolList', id: 'LIST' }],
    }),

    updatePool: builder.mutation<VocabularyPool, { id: string; data: Partial<VocabularyPool> }>({
      query: ({ id, data }) => ({
        url: `/admin/vocabulary-pools/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (response: { success: boolean; data: { pool: VocabularyPool } }) => response.data.pool,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Pool', id },
        { type: 'Pool', id: `student-${id}` },
        { type: 'Pool', id: `${id}-pos-summary` },
        { type: 'Pool', id: `${id}-paradigm-summary` },
        { type: 'PoolList', id: 'LIST' },
      ],
    }),

    preparePoolDeletion: builder.mutation<VocabularyPoolDeletionChallenge, string>({
      query: poolId => ({
        url: `/admin/vocabulary-pools/${poolId}/deletion-challenge`,
        method: 'POST',
      }),
      transformResponse: (response: { success: boolean; data: VocabularyPoolDeletionChallenge }) => response.data,
    }),

    deletePool: builder.mutation<void, { poolId: string; confirmationToken: string }>({
      query: ({ poolId, confirmationToken }) => ({
        url: `/admin/vocabulary-pools/${poolId}`,
        method: 'DELETE',
        body: { confirmationToken },
      }),
      invalidatesTags: (result, error, { poolId }) => [
        { type: 'Pool', id: poolId },
        { type: 'Pool', id: `student-${poolId}` },
        { type: 'PoolList', id: 'LIST' },
        { type: 'PoolUsage', id: 'MANAGEMENT' },
      ],
    }),

    addWordsToPool: builder.mutation<
      { pool: VocabularyPool; addedCount: number; duplicateCount: number; invalidIds: string[] },
      { poolId: string; wordDocIds: string[] }
    >({
      query: ({ poolId, wordDocIds }) => ({
        url: `/admin/vocabulary-pools/${poolId}/words`,
        method: 'POST',
        body: { wordDocIds },
      }),
      transformResponse: (response: {
        success: boolean;
        data: { pool: VocabularyPool; addedCount: number; duplicateCount: number; invalidIds: string[] };
      }) => response.data,
      invalidatesTags: (result, error, { poolId }) => [
        { type: 'Pool', id: poolId },
        { type: 'Pool', id: `student-${poolId}` },
        { type: 'Pool', id: `${poolId}-pos-summary` },
        { type: 'Pool', id: `${poolId}-paradigm-summary` },
        { type: 'AvailableWords', id: 'LIST' },
      ],
    }),

    removeWordsFromPool: builder.mutation<{ pool: VocabularyPool }, { poolId: string; wordDocIds: string[] }>({
      query: ({ poolId, wordDocIds }) => ({
        url: `/admin/vocabulary-pools/${poolId}/words`,
        method: 'DELETE',
        body: { wordDocIds },
      }),
      transformResponse: (response: { success: boolean; data: { pool: VocabularyPool } }) => response.data,
      invalidatesTags: (result, error, { poolId }) => [
        { type: 'Pool', id: poolId },
        { type: 'Pool', id: `student-${poolId}` },
        { type: 'Pool', id: `${poolId}-pos-summary` },
        { type: 'Pool', id: `${poolId}-paradigm-summary` },
        { type: 'AvailableWords', id: 'LIST' },
      ],
    }),

    getWordsForPoolSelection: builder.query<
      { words: Word[]; hasMore: boolean; lastWordId: string | null },
      { filters: PoolFilters; limit?: number; lastWordId?: string | null }
    >({
      query: ({ filters, limit = 50, lastWordId }) => {
        const params = buildAdvancedFilterParams(filters, {
          select: [...POOL_WORD_FIELDS],
          limit,
          lastWordId: lastWordId || undefined,
        });
        return `/admin/words?${params}`;
      },
      transformResponse: (response: {
        success: boolean;
        data: { words: Word[]; hasMore: boolean; lastWordId: string | null };
      }) => response.data,
      providesTags: [{ type: 'AvailableWords', id: 'LIST' }],
      serializeQueryArgs: ({ queryArgs }) => {
        return {
          filters: queryArgs.filters,
          limit: queryArgs.limit,
        };
      },
      merge: (currentCache, newResponse, { arg }) => {
        if (arg.lastWordId) {
          const existingIds = new Set(currentCache.words.map(w => w.id));
          const newWords = newResponse.words.filter(w => !existingIds.has(w.id));

          return {
            words: [...currentCache.words, ...newWords],
            hasMore: newResponse.hasMore,
            lastWordId: newResponse.lastWordId,
          };
        }
        return newResponse;
      },
      forceRefetch: ({ currentArg, previousArg }) => {
        if (!previousArg) return true;

        const filtersChanged = JSON.stringify(currentArg?.filters) !== JSON.stringify(previousArg?.filters);
        if (filtersChanged) return true;

        return currentArg?.lastWordId !== previousArg?.lastWordId;
      },
    }),
  }),
});

export const {
  useGetVocabularyPoolUsagesQuery,
  useGetPoolsQuery,
  useGetPoolQuery,
  useGetStudentPoolQuery,
  useGetPoolSummaryQuery,
  useGetPoolPOSSummaryQuery,
  useGetPoolParadigmSummaryQuery,
  useCreatePoolMutation,
  usePreparePoolDeletionMutation,
  useUpdatePoolMutation,
  useDeletePoolMutation,
  useAddWordsToPoolMutation,
  useRemoveWordsFromPoolMutation,
  useGetWordsForPoolSelectionQuery,
} = vocabularyPoolApi;
