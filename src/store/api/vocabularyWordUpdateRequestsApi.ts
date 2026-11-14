import { appApi, withSubscriptionDefaults } from './appApi';
import { STUDENT_POOLS_TAG } from './tags';
import type { VocabularyWord } from '@/shared/types/vocabulary/schemas';
import type {
  VocabularyWordUpdateNote,
  VocabularyWordUpdateNoteList,
  VocabularyWordUpdateRequestDetail,
  VocabularyWordUpdateRequestList,
  VocabularyWordUpdateRequestStatus,
} from '@/shared/types/vocabulary/update-requests';

const detailTags = (id: string) => [
  { type: 'VocabularyWordUpdateRequest' as const, id },
  { type: 'VocabularyWordUpdateRequestList' as const, id: 'LIST' },
];

export const vocabularyWordUpdateRequestsApi = appApi.injectEndpoints({
  endpoints: builder => ({
    getVocabularyWordUpdateRequests: builder.query<
      VocabularyWordUpdateRequestList,
      { status: VocabularyWordUpdateRequestStatus }
    >({
      query: ({ status }) => `/admin/vocabulary-word-update-requests?status=${status}`,
      providesTags: [{ type: 'VocabularyWordUpdateRequestList', id: 'LIST' }],
    }),

    getVocabularyWordUpdateRequest: builder.query<VocabularyWordUpdateRequestDetail, string>({
      query: id => `/admin/vocabulary-word-update-requests/${id}`,
      providesTags: (result, error, id) => [{ type: 'VocabularyWordUpdateRequest', id }],
    }),

    saveVocabularyWordUpdateProposal: builder.mutation<
      VocabularyWordUpdateRequestDetail,
      { id: string; proposedWord: VocabularyWord; version: string }
    >({
      query: ({ id, proposedWord, version }) => ({
        url: `/admin/vocabulary-word-update-requests/${id}`,
        method: 'PATCH',
        body: { proposedWord, version },
      }),
      invalidatesTags: (result, error, { id }) => detailTags(id),
    }),

    approveVocabularyWordUpdate: builder.mutation<
      VocabularyWordUpdateRequestDetail,
      { id: string; wordId: string; version: string; wordFingerprint: string }
    >({
      query: ({ id, version, wordFingerprint }) => ({
        url: `/admin/vocabulary-word-update-requests/${id}/approve`,
        method: 'POST',
        body: { version, wordFingerprint },
      }),
      invalidatesTags: (result, error, { id, wordId }) => [
        ...detailTags(id),
        ...(error
          ? []
          : [{ type: 'Word' as const, id: wordId }, { type: 'WordList' as const, id: 'LIST' }, STUDENT_POOLS_TAG]),
      ],
    }),

    dismissVocabularyWordUpdate: builder.mutation<VocabularyWordUpdateRequestDetail, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/admin/vocabulary-word-update-requests/${id}/dismiss`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: (result, error, { id }) => detailTags(id),
    }),

    getVocabularyWordUpdateNotes: builder.query<VocabularyWordUpdateNoteList, string>({
      query: id => `/admin/vocabulary-word-update-requests/${id}/notes`,
      providesTags: (result, error, id) => [{ type: 'VocabularyWordUpdateNotes', id }],
    }),

    addVocabularyWordUpdateNote: builder.mutation<VocabularyWordUpdateNote, { id: string; text: string }>({
      query: ({ id, text }) => ({
        url: `/admin/vocabulary-word-update-requests/${id}/notes`,
        method: 'POST',
        body: { text },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'VocabularyWordUpdateNotes', id }],
    }),

    deleteVocabularyWordUpdateNote: builder.mutation<{ id: string }, { id: string; noteId: string }>({
      query: ({ id, noteId }) => ({
        url: `/admin/vocabulary-word-update-requests/${id}/notes/${noteId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'VocabularyWordUpdateNotes', id }],
    }),
  }),
});

/**
 * The review page holds a reviewer's place in the list and an open proposal, so
 * both refresh only through their own mutations, not on window focus.
 */
const REVIEW_DEFAULTS = { refetchOnFocus: false, refetchOnReconnect: false } as const;

export const useGetVocabularyWordUpdateRequestsQuery = withSubscriptionDefaults(
  vocabularyWordUpdateRequestsApi.useGetVocabularyWordUpdateRequestsQuery,
  REVIEW_DEFAULTS
);
export const useGetVocabularyWordUpdateRequestQuery = withSubscriptionDefaults(
  vocabularyWordUpdateRequestsApi.useGetVocabularyWordUpdateRequestQuery,
  REVIEW_DEFAULTS
);

export const useGetVocabularyWordUpdateNotesQuery = withSubscriptionDefaults(
  vocabularyWordUpdateRequestsApi.useGetVocabularyWordUpdateNotesQuery,
  REVIEW_DEFAULTS
);

export const {
  useSaveVocabularyWordUpdateProposalMutation,
  useApproveVocabularyWordUpdateMutation,
  useDismissVocabularyWordUpdateMutation,
  useAddVocabularyWordUpdateNoteMutation,
  useDeleteVocabularyWordUpdateNoteMutation,
} = vocabularyWordUpdateRequestsApi;
