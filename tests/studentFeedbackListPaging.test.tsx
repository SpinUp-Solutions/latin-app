import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { Provider } from 'react-redux';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FeedbackList } from '@/src/components/admin/feedback/FeedbackList';
import { studentFeedbackApi } from '@/src/store/api/studentFeedbackApi';
import type { FeedbackAdminListItem } from '@/shared/student-feedback';

const mockBaseQuery = jest.fn();
let mockSearch = '';

jest.mock('@/src/store/api/baseQuery', () => ({
  ...jest.requireActual('@/src/store/api/baseQuery'),
  createAuthenticatedBaseQuery: () => (...args: unknown[]) => mockBaseQuery(...args),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const item = (id: string): FeedbackAdminListItem => ({
  id, type: 'general', areas: ['lessons'], excerpt: id,
  submitter: { uid: 'student-1', displayName: 'Student', email: 'student@example.edu', emailNormalized: 'student@example.edu' },
  lesson: null, createdAt: '2026-09-24T10:00:00.000Z', status: 'unresolved', archived: false, attachmentCount: 0,
});

let openFirstPage = ['open-1'];
const listRequests: URL[] = [];
const removeListeners: Array<() => void> = [];

function renderList() {
  const store = configureStore({
    reducer: { [studentFeedbackApi.reducerPath]: studentFeedbackApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(studentFeedbackApi.middleware),
  });
  removeListeners.push(setupListeners(store.dispatch));
  let mounts = 0;
  const tree = () => <Provider store={store}><FeedbackList key={++mounts} /></Provider>;
  const view = render(tree());
  return {
    rerenderList: () => view.rerender(<Provider store={store}><FeedbackList key={mounts} /></Provider>),
    unmountList: () => view.rerender(<Provider store={store}>{null}</Provider>),
    remountList: () => view.rerender(tree()),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = '';
  openFirstPage = ['open-1'];
  listRequests.length = 0;
  mockBaseQuery.mockImplementation(async (request: string) => {
    const url = new URL(request, 'https://latin.test');
    if (url.pathname === '/admin/feedback/count') return { data: { count: openFirstPage.length + 1 } };
    listRequests.push(url);
    if (url.searchParams.get('status') === 'resolved') return { data: { items: [item('resolved-1')], nextCursor: null } };
    return url.searchParams.has('cursor')
      ? { data: { items: [item('open-2')], nextCursor: null } }
      : { data: { items: openFirstPage.map(item), nextCursor: 'open-next' } };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  removeListeners.splice(0).forEach(remove => remove());
  jest.useRealTimers();
});

async function loadSecondOpenPage() {
  expect(await screen.findByText('open-1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  expect(await screen.findByText('open-2')).toBeInTheDocument();
}

test('returning to a filter after its cache expired starts again from page one', async () => {
  jest.useFakeTimers();
  const { rerenderList } = renderList();
  await loadSecondOpenPage();

  mockSearch = 'status=resolved';
  rerenderList();
  expect(await screen.findByText('resolved-1')).toBeInTheDocument();
  await act(async () => {
    jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
  });

  listRequests.length = 0;
  mockSearch = '';
  rerenderList();
  expect(await screen.findByText('open-1')).toBeInTheDocument();
  expect(listRequests.map(url => url.searchParams.get('cursor'))).toEqual([null]);
});

test.each([
  ['focus', () => fireEvent.focus(window)],
  ['reconnect', () => fireEvent(window, new Event('online'))],
])('%s keeps the pages loaded with "Load more"', async (_label, trigger) => {
  renderList();
  await loadSecondOpenPage();

  listRequests.length = 0;
  openFirstPage = ['open-new', 'open-1'];
  act(trigger);
  await act(async () => {});

  expect(screen.getByText('open-2')).toBeInTheDocument();
  expect(screen.queryByText('open-new')).not.toBeInTheDocument();
  expect(listRequests).toEqual([]);
});

test.each([
  ['focus', () => fireEvent.focus(window)],
  ['reconnect', () => fireEvent(window, new Event('online'))],
])('%s reloads a list that shows only page one', async (_label, trigger) => {
  renderList();
  expect(await screen.findByText('open-1')).toBeInTheDocument();

  listRequests.length = 0;
  openFirstPage = ['open-new', 'open-1'];
  act(trigger);

  expect(await screen.findByText('open-new')).toBeInTheDocument();
  expect(listRequests.map(url => url.searchParams.get('cursor'))).toEqual([null]);
});

test('coming back from a report keeps the pages loaded with "Load more"', async () => {
  const { unmountList, remountList } = renderList();
  await loadSecondOpenPage();

  unmountList();
  listRequests.length = 0;
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
  remountList();

  expect(await screen.findByText('open-2')).toBeInTheDocument();
  await act(async () => {});
  expect(screen.getByText('Showing all 2 reports')).toBeInTheDocument();
  expect(listRequests).toEqual([]);
});

test('the Refresh button reloads page one even after "Load more"', async () => {
  renderList();
  await loadSecondOpenPage();

  listRequests.length = 0;
  openFirstPage = ['open-new', 'open-1'];
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

  expect(await screen.findByText('open-new')).toBeInTheDocument();
  expect(screen.queryByText('open-2')).not.toBeInTheDocument();
  expect(listRequests.map(url => url.searchParams.get('cursor'))).toEqual([null]);
});

test('a tab switch that fires focus and visibilitychange reloads page one once', async () => {
  renderList();
  expect(await screen.findByText('open-1')).toBeInTheDocument();

  listRequests.length = 0;
  act(() => {
    fireEvent(document, new Event('visibilitychange', { bubbles: true }));
    fireEvent.focus(window);
  });

  await screen.findByText('open-1');
  await act(async () => {});
  expect(listRequests).toHaveLength(1);
});
