import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';
import { createApi } from '@reduxjs/toolkit/query/react';
import type {
  FeedbackActivity,
  FeedbackAdminAction,
  FeedbackAdminDetailResponse,
  FeedbackAdminListQuery,
  FeedbackAdminListResponse,
  FeedbackAttachmentLinksResponse,
  FeedbackLessonOption,
  FeedbackReceipt,
  FeedbackReport,
  FeedbackSubmitRequest,
} from '@/shared/student-feedback';
import { createAuthenticatedBaseQuery } from './baseQuery';

export type FeedbackListArgs = Partial<Omit<FeedbackAdminListQuery, 'cursor'>> & { cursor?: string | null };
type Dispatch = ThunkDispatch<unknown, unknown, UnknownAction>;

const queryString = (values: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
};
/** Every page of one filter combination shares a cache entry. */
const listKey = (args: FeedbackListArgs) => queryString({ ...args, cursor: undefined });

export const studentFeedbackApi = createApi({
  reducerPath: 'studentFeedbackApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['FeedbackLessons', 'FeedbackList', 'FeedbackDetail', 'FeedbackCount', 'FeedbackAttachments'],
  refetchOnReconnect: true,
  endpoints: builder => ({
    getFeedbackLessons: builder.query<{ lessons: FeedbackLessonOption[] }, void>({
      query: () => '/feedback/lessons',
      providesTags: ['FeedbackLessons'],
    }),
    submitFeedback: builder.mutation<{ receipt: FeedbackReceipt }, FeedbackSubmitRequest>({
      query: body => ({ url: '/feedback', method: 'POST', body }),
    }),
    getAdminFeedbackList: builder.query<FeedbackAdminListResponse, FeedbackListArgs>({
      query: args => `/admin/feedback?${queryString(args)}`,
      serializeQueryArgs: ({ queryArgs }) => listKey(queryArgs),
      merge: (current, incoming, { arg }) => {
        if (!arg.cursor) return incoming;
        const seen = new Set(current.items.map(item => item.id));
        return { items: [...current.items, ...incoming.items.filter(item => !seen.has(item.id))], nextCursor: incoming.nextCursor };
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: [{ type: 'FeedbackList', id: 'LIST' }],
    }),
    getAdminFeedbackCount: builder.query<{ count: number }, void>({
      query: () => '/admin/feedback/count',
      providesTags: [{ type: 'FeedbackCount', id: 'OPEN' }],
    }),
    getAdminFeedbackDetail: builder.query<FeedbackAdminDetailResponse, string>({
      query: id => `/admin/feedback/${encodeURIComponent(id)}`,
      providesTags: (_result, _error, id) => [{ type: 'FeedbackDetail', id }],
    }),
    getAdminFeedbackAttachments: builder.query<FeedbackAttachmentLinksResponse, string>({
      query: id => `/admin/feedback/${encodeURIComponent(id)}/attachments`,
      providesTags: (_result, _error, id) => [{ type: 'FeedbackAttachments', id }],
      keepUnusedDataFor: 0,
    }),
    updateAdminFeedbackState: builder.mutation<
      { feedback: FeedbackReport },
      { feedbackId: string; action: FeedbackAdminAction; reason?: string }
    >({
      query: ({ feedbackId, ...body }) => ({
        url: `/admin/feedback/${encodeURIComponent(feedbackId)}/state`,
        method: 'PATCH',
        body,
      }),
      async onQueryStarted({ feedbackId }, { dispatch, getState, queryFulfilled }) {
        try {
          await queryFulfilled;
        } catch {
          return; // The caller shows the error.
        }
        dispatch(
          studentFeedbackApi.util.invalidateTags([
            { type: 'FeedbackDetail', id: feedbackId },
            { type: 'FeedbackCount', id: 'OPEN' },
          ])
        );
        await refreshFeedbackLists(dispatch, getState() as FeedbackCacheState);
      },
    }),
    addAdminFeedbackNote: builder.mutation<{ activity: FeedbackActivity }, { feedbackId: string; note: string }>({
      query: ({ feedbackId, note }) => ({
        url: `/admin/feedback/${encodeURIComponent(feedbackId)}/notes`,
        method: 'POST',
        body: { note },
      }),
      invalidatesTags: (_result, error, { feedbackId }) => (error ? [] : [{ type: 'FeedbackDetail', id: feedbackId }]),
    }),
  }),
});

type FeedbackCacheState = { studentFeedbackApi: ReturnType<typeof studentFeedbackApi.reducer> };

/**
 * Status changes move reports between filtered lists, so reload page one of every cached
 * list instead of invalidating tags, which could race with an in-flight "load more".
 */
async function refreshFeedbackLists(dispatch: Dispatch, state: FeedbackCacheState) {
  const argsByKey = new Map<string, FeedbackListArgs>(
    studentFeedbackApi.util
      .selectInvalidatedBy(state, [{ type: 'FeedbackList', id: 'LIST' }])
      .filter(entry => entry.endpointName === 'getAdminFeedbackList')
      .map(entry => [entry.queryCacheKey, entry.originalArgs as FeedbackListArgs])
  );
  // First requests have no provided tags until they settle; include them so their stale responses are replaced.
  for (const args of studentFeedbackApi.util.selectCachedArgsForQuery(state, 'getAdminFeedbackList')) {
    const running = dispatch(studentFeedbackApi.util.getRunningQueryThunk('getAdminFeedbackList', args));
    if (running) argsByKey.set(running.queryCacheKey, args);
  }
  await Promise.all([...argsByKey.values()].map(args => refreshFeedbackListPageOne(dispatch, args)));
}

export async function refreshFeedbackListPageOne(dispatch: Dispatch, args: FeedbackListArgs) {
  let running = dispatch(studentFeedbackApi.util.getRunningQueryThunk('getAdminFeedbackList', args));
  while (running) {
    await running;
    running = dispatch(studentFeedbackApi.util.getRunningQueryThunk('getAdminFeedbackList', args));
  }
  await dispatch(
    studentFeedbackApi.endpoints.getAdminFeedbackList.initiate(
      { ...args, cursor: null },
      { subscribe: false, forceRefetch: true }
    )
  );
}

export const {
  useGetFeedbackLessonsQuery,
  useSubmitFeedbackMutation,
  useGetAdminFeedbackListQuery,
  useGetAdminFeedbackCountQuery,
  useGetAdminFeedbackDetailQuery,
  useGetAdminFeedbackAttachmentsQuery,
  useUpdateAdminFeedbackStateMutation,
  useAddAdminFeedbackNoteMutation,
} = studentFeedbackApi;
