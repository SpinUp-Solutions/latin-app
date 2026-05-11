import { createApi } from '@reduxjs/toolkit/query/react';
import { createAuthenticatedBaseQuery } from './baseQuery';
import type {
  RootWordCandidate,
  VocabularyWordRequest,
  VocabularyWordRequestStatus,
} from '@/shared/types/vocabulary/requests';
import type { CostBreakdown, AIAutocompleteResponse } from '@/shared/openai/types';
import type { VocabularyWord } from '@/shared/types/vocabulary/schemas';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export const vocabularyWordRequestsApi = createApi({
  reducerPath: 'vocabularyWordRequestsApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['VocabularyWordRequest', 'VocabularyWordRequestList', 'WordList'],
  endpoints: builder => ({
    getVocabularyWordRequests: builder.query<VocabularyWordRequest[], { status?: VocabularyWordRequestStatus }>({
      query: ({ status = 'pending' } = {}) => `/admin/vocabulary-word-requests?status=${status}`,
      transformResponse: (response: ApiResponse<{ requests: VocabularyWordRequest[] }>) => response.data.requests,
      providesTags: result =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'VocabularyWordRequest' as const, id })),
              { type: 'VocabularyWordRequestList', id: 'LIST' },
            ]
          : [{ type: 'VocabularyWordRequestList', id: 'LIST' }],
    }),

    createVocabularyWordRequest: builder.mutation<
      VocabularyWordRequest,
      {
        sourceText: string;
        selectedCandidate: RootWordCandidate;
        candidates: RootWordCandidate[];
        autocompleteData: AIAutocompleteResponse['data'];
        aiMeta?: {
          model?: string;
          cost?: CostBreakdown;
          fieldStatus?: Record<string, 'filled' | 'missing'>;
        };
      }
    >({
      query: body => ({
        url: '/admin/vocabulary-word-requests',
        method: 'POST',
        body,
      }),
      transformResponse: (response: ApiResponse<{ request: VocabularyWordRequest }>) => response.data.request,
      invalidatesTags: [{ type: 'VocabularyWordRequestList', id: 'LIST' }],
    }),

    updateVocabularyWordRequest: builder.mutation<VocabularyWordRequest, { id: string; draftWord: VocabularyWord }>({
      query: ({ id, draftWord }) => ({
        url: `/admin/vocabulary-word-requests/${id}`,
        method: 'PATCH',
        body: { draftWord },
      }),
      transformResponse: (response: ApiResponse<{ request: VocabularyWordRequest }>) => response.data.request,
      invalidatesTags: (result, error, { id }) => [
        { type: 'VocabularyWordRequest', id },
        { type: 'VocabularyWordRequestList', id: 'LIST' },
      ],
    }),

    approveVocabularyWordRequest: builder.mutation<{ request: VocabularyWordRequest; wordId: string }, string>({
      query: id => ({
        url: `/admin/vocabulary-word-requests/${id}/approve`,
        method: 'POST',
      }),
      transformResponse: (response: ApiResponse<{ request: VocabularyWordRequest; wordId: string }>) => response.data,
      invalidatesTags: (result, error, id) => [
        { type: 'VocabularyWordRequest', id },
        { type: 'VocabularyWordRequestList', id: 'LIST' },
        { type: 'WordList', id: 'LIST' },
      ],
    }),

    dismissVocabularyWordRequest: builder.mutation<VocabularyWordRequest, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/admin/vocabulary-word-requests/${id}/dismiss`,
        method: 'POST',
        body: { reason },
      }),
      transformResponse: (response: ApiResponse<{ request: VocabularyWordRequest }>) => response.data.request,
      invalidatesTags: (result, error, { id }) => [
        { type: 'VocabularyWordRequest', id },
        { type: 'VocabularyWordRequestList', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetVocabularyWordRequestsQuery,
  useCreateVocabularyWordRequestMutation,
  useUpdateVocabularyWordRequestMutation,
  useApproveVocabularyWordRequestMutation,
  useDismissVocabularyWordRequestMutation,
} = vocabularyWordRequestsApi;
