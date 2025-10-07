import { createApi } from '@reduxjs/toolkit/query/react';
import { VocabularyPool, VocabularyPoolWithWords, CreatePoolRequest } from '@/src/types/vocabulary-pool';
import { Word } from '@/src/types/admin-vocabulary';
import { createAuthenticatedBaseQuery } from './baseQuery';

export const vocabularyPoolApi = createApi({
  reducerPath: 'vocabularyPoolApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['Pool', 'PoolList', 'AvailableWords'],
  keepUnusedDataFor: 60 * 5,
  refetchOnMountOrArgChange: 30,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: builder => ({
    getPools: builder.query<
      { pools: VocabularyPool[]; total: number; hasMore: boolean; lastPoolId: string | null },
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

        return `/admin/vocabulary-pools?${params}`;
      },
      transformResponse: (response: {
        success: boolean;
        data: { pools: VocabularyPool[]; total: number; hasMore: boolean; lastPoolId: string | null };
      }) => response.data,
      providesTags: result =>
        result
          ? [...result.pools.map(({ id }) => ({ type: 'Pool' as const, id })), { type: 'PoolList', id: 'LIST' }]
          : [{ type: 'PoolList', id: 'LIST' }],
    }),

    getPool: builder.query<VocabularyPoolWithWords, string>({
      query: poolId => `/admin/vocabulary-pools/${poolId}`,
      transformResponse: (response: { success: boolean; data: { pool: VocabularyPoolWithWords } }) =>
        response.data.pool,
      providesTags: (result, error, poolId) => [{ type: 'Pool', id: poolId }],
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
        { type: 'PoolList', id: 'LIST' },
      ],
    }),

    deletePool: builder.mutation<void, string>({
      query: poolId => ({
        url: `/admin/vocabulary-pools/${poolId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, poolId) => [
        { type: 'Pool', id: poolId },
        { type: 'PoolList', id: 'LIST' },
      ],
    }),

    addWordsToPool: builder.mutation<{ pool: VocabularyPool }, { poolId: string; wordDocIds: string[] }>({
      query: ({ poolId, wordDocIds }) => ({
        url: `/admin/vocabulary-pools/${poolId}/words`,
        method: 'POST',
        body: { wordDocIds },
      }),
      transformResponse: (response: { success: boolean; data: { pool: VocabularyPool } }) => response.data,
      invalidatesTags: (result, error, { poolId }) => [{ type: 'Pool', id: poolId }],
    }),

    removeWordsFromPool: builder.mutation<{ pool: VocabularyPool }, { poolId: string; wordDocIds: string[] }>({
      query: ({ poolId, wordDocIds }) => ({
        url: `/admin/vocabulary-pools/${poolId}/words`,
        method: 'DELETE',
        body: { wordDocIds },
      }),
      transformResponse: (response: { success: boolean; data: { pool: VocabularyPool } }) => response.data,
      invalidatesTags: (result, error, { poolId }) => [{ type: 'Pool', id: poolId }],
    }),

    getAvailableWords: builder.query<Word[], { search?: string; wordType?: string; section?: string }>({
      query: ({ search, wordType, section }) => {
        const params = new URLSearchParams({ limit: '100' });

        if (search) params.append('search', search);
        if (wordType && wordType !== 'all') params.append('wordType', wordType);
        if (section && section !== 'all') params.append('section', section);

        return `/admin/words?${params}`;
      },
      transformResponse: (response: { success: boolean; data: { words: Word[] } }) => response.data.words,
      providesTags: [{ type: 'AvailableWords', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetPoolsQuery,
  useGetPoolQuery,
  useCreatePoolMutation,
  useUpdatePoolMutation,
  useDeletePoolMutation,
  useAddWordsToPoolMutation,
  useRemoveWordsFromPoolMutation,
  useGetAvailableWordsQuery,
} = vocabularyPoolApi;
