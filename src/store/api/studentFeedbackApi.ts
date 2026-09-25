import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';
import { createApi } from '@reduxjs/toolkit/query/react';
import type {
  FeedbackActivityDocument,
  FeedbackActivityListResponse,
  FeedbackAdminListItem,
  FeedbackAdminListResponse,
  FeedbackAdminListQuery,
  FeedbackReceipt,
  FeedbackReportDocument,
  FeedbackPublicSession,
  FeedbackSubmitRequest,
  FeedbackLessonOption,
} from '@/shared/student-feedback';
import { createAuthenticatedBaseQuery } from './baseQuery';

export type FeedbackListArgs = Omit<FeedbackAdminListQuery, 'cursor'> & { cursor?: string | null };
export type FeedbackListItem = FeedbackAdminListItem;
export type FeedbackListResult = FeedbackAdminListResponse;
export type FeedbackActivityResult = FeedbackActivityListResponse;
export type { FeedbackLessonOption } from '@/shared/student-feedback';

const queryString = (values: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
};
const keyFor = (args: Partial<FeedbackListArgs>) => queryString({ ...args, cursor: undefined });

export const studentFeedbackApi = createApi({
  reducerPath: 'studentFeedbackApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['FeedbackList', 'FeedbackDetail', 'FeedbackCount', 'FeedbackActivity', 'FeedbackLessons'],
  refetchOnFocus: false,
  refetchOnReconnect: true,
  endpoints: builder => ({
    getFeedbackLessons: builder.query<{ lessons: FeedbackLessonOption[] }, void>({
      query: () => '/feedback/lessons',
      providesTags: [{ type: 'FeedbackLessons', id: 'LIST' }],
    }),
    createFeedbackSession: builder.mutation<{ session: FeedbackPublicSession }, { sessionId: string }>({
      query: body => ({ url: '/feedback/sessions', method: 'POST', body }),
    }),
    getFeedbackSession: builder.query<{ session: FeedbackPublicSession }, string>({
      query: sessionId => `/feedback/sessions/${encodeURIComponent(sessionId)}`,
    }),
    submitFeedback: builder.mutation<{ receipt: FeedbackReceipt }, FeedbackSubmitRequest>({
      query: body => ({ url: '/feedback', method: 'POST', body }),
      async onQueryStarted(_arg, lifecycle) { await refreshFeedbackLists(lifecycle); },
    }),
    getAdminFeedbackList: builder.query<FeedbackListResult, FeedbackListArgs>({
      query: args => `/admin/feedback?${queryString(args)}`,
      serializeQueryArgs: ({ queryArgs }) => keyFor(queryArgs),
      merge(currentCache, newData, { arg }) {
        if (!arg.cursor) return newData;
        const seen = new Set<string>();
        const items = [...currentCache.items, ...newData.items].filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        return { items, nextCursor: newData.nextCursor };
      },
      forceRefetch: ({ currentArg, previousArg }) =>
        keyFor(currentArg ?? {}) !== keyFor(previousArg ?? {}) || currentArg?.cursor !== previousArg?.cursor,
      providesTags: [{ type: 'FeedbackList', id: 'LIST' }],
    }),
    getAdminFeedbackCount: builder.query<{ count: number }, void>({
      query: () => '/admin/feedback/count',
      providesTags: [{ type: 'FeedbackCount', id: 'UNRESOLVED' }],
    }),
    getAdminFeedbackDetail: builder.query<{ feedback: FeedbackReportDocument; currentLesson: { id: string; title: string } | null }, string>({
      query: id => `/admin/feedback/${encodeURIComponent(id)}`,
      providesTags: (_result, _error, id) => [{ type: 'FeedbackDetail', id }],
    }),
    getAdminFeedbackActivity: builder.query<FeedbackActivityResult, { feedbackId: string; cursor?: string | null }>({
      query: ({ feedbackId, cursor }) => `/admin/feedback/${encodeURIComponent(feedbackId)}/activity${cursor ? `?${queryString({ cursor })}` : ''}`,
      serializeQueryArgs: ({ queryArgs }) => queryArgs.feedbackId,
      merge(currentCache, newData, { arg }) {
        if (!arg.cursor) return newData;
        const seen = new Set<string>();
        return {
          items: [...currentCache.items, ...newData.items].filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          }),
          nextCursor: newData.nextCursor,
        };
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: (_result, _error, arg) => [{ type: 'FeedbackActivity', id: arg.feedbackId }],
    }),
    updateAdminFeedbackState: builder.mutation<{ feedback: FeedbackReportDocument }, { feedbackId: string; action: 'resolve' | 'reopen' | 'archive' | 'unarchive'; expectedRevision: number; reason?: string }>({
      query: ({ feedbackId, ...body }) => ({ url: `/admin/feedback/${encodeURIComponent(feedbackId)}/state`, method: 'PATCH', body }),
      async onQueryStarted({ feedbackId }, lifecycle) {
        try {
          await lifecycle.queryFulfilled;
          lifecycle.dispatch(studentFeedbackApi.util.invalidateTags([
            { type: 'FeedbackDetail', id: feedbackId },
            { type: 'FeedbackCount', id: 'UNRESOLVED' },
          ]));
          await Promise.all([
            refreshFeedbackListsAfterSuccess(lifecycle),
            refreshFeedbackActivityAfterSuccess(feedbackId, lifecycle),
          ]);
        } catch { /* mutation error is displayed by the caller */ }
      },
    }),
    addAdminFeedbackNote: builder.mutation<{ activity: FeedbackActivityDocument }, { feedbackId: string; requestId: string; note: string }>({
      query: ({ feedbackId, ...body }) => ({ url: `/admin/feedback/${encodeURIComponent(feedbackId)}/notes`, method: 'POST', body }),
      async onQueryStarted({ feedbackId }, lifecycle) {
        try {
          await lifecycle.queryFulfilled;
          await refreshFeedbackActivityAfterSuccess(feedbackId, lifecycle);
        } catch { /* mutation error is displayed by the caller */ }
      },
    }),
    getAdminFeedbackAttachmentAccess: builder.query<{ url: string; expiresAt: string }, { feedbackId: string; attachmentId: string; disposition: 'inline' | 'attachment' }>({
      query: ({ feedbackId, attachmentId, disposition }) => `/admin/feedback/${encodeURIComponent(feedbackId)}/attachments/${encodeURIComponent(attachmentId)}/access?disposition=${disposition}`,
      keepUnusedDataFor: 0,
    }),
  }),
});

type FeedbackCacheState = { studentFeedbackApi: ReturnType<typeof studentFeedbackApi.reducer> };
type MutationLifecycle = {
  dispatch: ThunkDispatch<unknown, unknown, UnknownAction>;
  getState: () => unknown;
  queryFulfilled: Promise<unknown>;
};
async function refreshFeedbackLists(lifecycle: MutationLifecycle) {
  try {
    await lifecycle.queryFulfilled;
    lifecycle.dispatch(studentFeedbackApi.util.invalidateTags([{ type: 'FeedbackCount', id: 'UNRESOLVED' }]));
    await refreshFeedbackListsAfterSuccess(lifecycle);
  } catch { /* mutation error is displayed by the caller */ }
}
async function refreshFeedbackListsAfterSuccess({ dispatch, getState }: MutationLifecycle) {
  const state = getState() as FeedbackCacheState;
  const affected = studentFeedbackApi.util.selectInvalidatedBy(state, [{ type: 'FeedbackList', id: 'LIST' }]);
  const argsByKey = new Map<string, FeedbackListArgs>(
    affected.filter(item => item.endpointName === 'getAdminFeedbackList')
      .map(item => [item.queryCacheKey, item.originalArgs as FeedbackListArgs])
  );
  for (const args of studentFeedbackApi.util.selectCachedArgsForQuery(state, 'getAdminFeedbackList')) {
    const running = dispatch(studentFeedbackApi.util.getRunningQueryThunk('getAdminFeedbackList', args));
    if (running) argsByKey.set(running.queryCacheKey, args);
  }
  await Promise.all([...argsByKey.values()].map(async originalArgs => {
    await refreshFeedbackListPageOne(dispatch, originalArgs);
  }));
}
export async function refreshFeedbackListPageOne(
  dispatch: ThunkDispatch<unknown, unknown, UnknownAction>,
  originalArgs: FeedbackListArgs
) {
  let running = dispatch(studentFeedbackApi.util.getRunningQueryThunk('getAdminFeedbackList', originalArgs));
  while (running) {
    await running;
    running = dispatch(studentFeedbackApi.util.getRunningQueryThunk('getAdminFeedbackList', originalArgs));
  }
  await dispatch(studentFeedbackApi.endpoints.getAdminFeedbackList.initiate(
    { ...originalArgs, cursor: null }, { subscribe: false, forceRefetch: true }
  ));
}
async function refreshFeedbackActivityAfterSuccess(feedbackId: string, { dispatch, getState }: MutationLifecycle) {
  const state = getState() as FeedbackCacheState;
  const affected = studentFeedbackApi.util.selectInvalidatedBy(state, [{ type: 'FeedbackActivity', id: feedbackId }]);
  const originalArgs = affected.find(item => item.endpointName === 'getAdminFeedbackActivity')?.originalArgs as
    | { feedbackId: string; cursor?: string | null }
    | undefined;
  if (!originalArgs) return;
  let running = dispatch(studentFeedbackApi.util.getRunningQueryThunk('getAdminFeedbackActivity', originalArgs));
  while (running) {
    await running;
    running = dispatch(studentFeedbackApi.util.getRunningQueryThunk('getAdminFeedbackActivity', originalArgs));
  }
  await dispatch(studentFeedbackApi.endpoints.getAdminFeedbackActivity.initiate(
    { feedbackId, cursor: null }, { subscribe: false, forceRefetch: true }
  ));
}

export const {
  useGetFeedbackLessonsQuery,
  useCreateFeedbackSessionMutation,
  useLazyGetFeedbackSessionQuery,
  useSubmitFeedbackMutation,
  useGetAdminFeedbackListQuery,
  useGetAdminFeedbackCountQuery,
  useGetAdminFeedbackDetailQuery,
  useGetAdminFeedbackActivityQuery,
  useUpdateAdminFeedbackStateMutation,
  useAddAdminFeedbackNoteMutation,
  useLazyGetAdminFeedbackAttachmentAccessQuery,
} = studentFeedbackApi;
