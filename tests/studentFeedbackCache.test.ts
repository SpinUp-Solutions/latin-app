import { configureStore } from '@reduxjs/toolkit';
import { waitFor } from '@testing-library/react';
import { studentFeedbackApi, type FeedbackListArgs } from '@/src/store/api/studentFeedbackApi';
import type { FeedbackAdminListItem } from '@/shared/student-feedback';

const mockBaseQuery = jest.fn();
jest.mock('@/src/store/api/baseQuery', () => ({ createAuthenticatedBaseQuery: () => (...args: unknown[]) => mockBaseQuery(...args) }));

const item = (id: string, status: 'unresolved' | 'resolved' = 'unresolved'): FeedbackAdminListItem => ({
  id, type: 'general', severity: undefined, areas: ['lessons'], description: id,
  submitter: { uid: 'student-1', displayName: 'Student', email: 'student@example.edu', emailNormalized: 'student@example.edu' },
  lesson: null, createdAt: '2026-09-24T10:00:00.000Z', status, archived: false, stateRevision: 0, attachments: [],
});
const page = (items: FeedbackAdminListItem[], nextCursor: string | null = null) => ({ data: { items, nextCursor } });
const storeFor = () => configureStore({
  reducer: { [studentFeedbackApi.reducerPath]: studentFeedbackApi.reducer },
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(studentFeedbackApi.middleware),
});
const newest: FeedbackListArgs = { status: 'unresolved', archived: 'false', sort: 'newest', cursor: null };
const oldest: FeedbackListArgs = { status: 'unresolved', archived: 'false', sort: 'oldest', cursor: null };
const resolved: FeedbackListArgs = { status: 'resolved', archived: 'false', sort: 'newest', cursor: null };

beforeEach(() => jest.clearAllMocks());

test('first page replaces accumulated pages, cursor deduplicates, and filtered/sorted caches remain distinct', async () => {
  const store = storeFor();
  let firstPageVersion = 0;
  mockBaseQuery.mockImplementation(async (request: string | { url: string }) => {
    const url = new URL(typeof request === 'string' ? request : request.url, 'https://latin.test');
    if (url.pathname !== '/admin/feedback') throw new Error(`Unexpected ${url}`);
    const cursor = url.searchParams.get('cursor');
    if (url.searchParams.get('status') === 'resolved') return page([item('resolved', 'resolved')]);
    if (url.searchParams.get('sort') === 'oldest') return cursor ? page([item('old-tail')]) : page([item('old-first')], 'old-next');
    if (cursor) return page([item('top'), item('tail')]);
    return firstPageVersion ? page([item('new-top')], null) : page([item('top')], 'next');
  });
  await store.dispatch(studentFeedbackApi.endpoints.getAdminFeedbackList.initiate(newest));
  await store.dispatch(studentFeedbackApi.endpoints.getAdminFeedbackList.initiate({ ...newest, cursor: 'next' }));
  expect(studentFeedbackApi.endpoints.getAdminFeedbackList.select(newest)(store.getState()).data?.items.map(item => item.id)).toEqual(['top', 'tail']);
  await store.dispatch(studentFeedbackApi.endpoints.getAdminFeedbackList.initiate(oldest));
  await store.dispatch(studentFeedbackApi.endpoints.getAdminFeedbackList.initiate(resolved));
  firstPageVersion = 1;
  await store.dispatch(studentFeedbackApi.endpoints.getAdminFeedbackList.initiate(newest, { forceRefetch: true }));
  expect(studentFeedbackApi.endpoints.getAdminFeedbackList.select(newest)(store.getState()).data?.items.map(item => item.id)).toEqual(['new-top']);
  expect(studentFeedbackApi.endpoints.getAdminFeedbackList.select(oldest)(store.getState()).data?.items.map(item => item.id)).toEqual(['old-first']);
  expect(studentFeedbackApi.endpoints.getAdminFeedbackList.select(resolved)(store.getState()).data?.items.map(item => item.id)).toEqual(['resolved']);
});

test('state mutation waits for an in-flight cursor page and refreshes affected lists from page one', async () => {
  const store = storeFor();
  let releaseTail: (() => void) | undefined;
  let changed = false;
  mockBaseQuery.mockImplementation(async (request: string | { url: string; method?: string }) => {
    const url = new URL(typeof request === 'string' ? request : request.url, 'https://latin.test');
    if (url.pathname.endsWith('/state')) { changed = true; return { data: { feedback: { id: 'top' } } }; }
    if (url.pathname === '/admin/feedback/count') return { data: { count: changed ? 0 : 1 } };
    if (url.pathname !== '/admin/feedback') throw new Error(`Unexpected ${url}`);
    if (url.searchParams.has('cursor')) await new Promise<void>(resolve => { releaseTail = resolve; });
    return url.searchParams.has('cursor') ? page([item('tail')]) : changed ? page([]) : page([item('top')], 'next');
  });
  await store.dispatch(studentFeedbackApi.endpoints.getAdminFeedbackList.initiate(newest));
  const tail = store.dispatch(studentFeedbackApi.endpoints.getAdminFeedbackList.initiate({ ...newest, cursor: 'next' }));
  await waitFor(() => expect(releaseTail).toBeDefined());
  const mutation = store.dispatch(studentFeedbackApi.endpoints.updateAdminFeedbackState.initiate({ feedbackId: 'top', action: 'resolve', expectedRevision: 0 }));
  await mutation;
  expect(mockBaseQuery.mock.calls.filter(([request]) => typeof request === 'string' && new URL(request, 'https://latin.test').pathname === '/admin/feedback')).toHaveLength(2);
  releaseTail!();
  await tail;
  await waitFor(() => expect(studentFeedbackApi.endpoints.getAdminFeedbackList.select(newest)(store.getState()).data?.items).toEqual([]));
});

test('a note refreshes accumulated activity after an in-flight history page', async () => {
  const store = storeFor();
  let releaseOlder: (() => void) | undefined;
  let noted = false;
  const activity = (id: string) => ({ id, feedbackId: 'report-1', kind: 'note', actorUid: 'admin', actorDisplayName: null, createdAt: '2026-09-24T10:00:00.000Z', reason: null, note: id, requestId: '8c271c82-5d1b-4604-9891-d1269d5e1531', schemaVersion: 1 });
  mockBaseQuery.mockImplementation(async (request: string | { url: string }) => {
    const url = new URL(typeof request === 'string' ? request : request.url, 'https://latin.test');
    if (url.pathname.endsWith('/notes')) { noted = true; return { data: { activity: activity('new') } }; }
    if (url.pathname.endsWith('/activity')) {
      if (url.searchParams.has('cursor')) { await new Promise<void>(resolve => { releaseOlder = resolve; }); return { data: { items: [activity('older')], nextCursor: null } }; }
      return { data: { items: noted ? [activity('new')] : [activity('first')], nextCursor: noted ? null : 'next' } };
    }
    throw new Error(`Unexpected ${url}`);
  });
  const first = { feedbackId: 'report-1', cursor: null };
  await store.dispatch(studentFeedbackApi.endpoints.getAdminFeedbackActivity.initiate(first));
  const older = store.dispatch(studentFeedbackApi.endpoints.getAdminFeedbackActivity.initiate({ feedbackId: 'report-1', cursor: 'next' }));
  await waitFor(() => expect(releaseOlder).toBeDefined());
  await store.dispatch(studentFeedbackApi.endpoints.addAdminFeedbackNote.initiate({ feedbackId: 'report-1', note: 'new', requestId: '8c271c82-5d1b-4604-9891-d1269d5e1531' }));
  releaseOlder!();
  await older;
  await waitFor(() => expect(studentFeedbackApi.endpoints.getAdminFeedbackActivity.select(first)(store.getState()).data?.items.map(item => item.id)).toEqual(['new']));
});
