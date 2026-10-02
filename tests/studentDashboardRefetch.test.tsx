import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { Provider } from 'react-redux';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { appApi } from '@/src/store/api/appApi';
import {
  REUSE_CACHED_STUDENT_DASHBOARD,
  STUDENT_DASHBOARD_FOCUS_REFRESH_MS,
  useGetStudentDashboardQuery,
} from '@/src/store/api/lessonApi';
import { useRefreshStaleOnFocus } from '@/src/hooks/useRefreshStaleOnFocus';

const mockBaseQuery = jest.fn();

jest.mock('@/src/store/api/baseQuery', () => ({
  ...jest.requireActual('@/src/store/api/baseQuery'),
  createAuthenticatedBaseQuery: () => (...args: unknown[]) => mockBaseQuery(...args),
}));

const START = Date.parse('2026-10-01T09:00:00.000Z');
let now = START;
const removeListeners: Array<() => void> = [];

/** The dashboard page: refreshes on mount, and on tab focus only once its data is stale. */
function DashboardPageQuery() {
  const { data, refetch, fulfilledTimeStamp } = useGetStudentDashboardQuery('student-1', { refetchOnFocus: false });
  useRefreshStaleOnFocus(fulfilledTimeStamp, refetch, STUDENT_DASHBOARD_FOCUS_REFRESH_MS);
  return <p>{data ? 'dashboard page ready' : 'dashboard page loading'}</p>;
}

/** A lesson sidebar or test page: displays whatever dashboard copy is cached. */
function DashboardReader() {
  const { data } = useGetStudentDashboardQuery('student-1', REUSE_CACHED_STUDENT_DASHBOARD);
  return <p>{data ? 'reader ready' : 'reader loading'}</p>;
}

function renderWithStore(initial: React.ReactNode) {
  const store = configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(appApi.middleware),
  });
  removeListeners.push(setupListeners(store.dispatch));
  const view = render(<Provider store={store}>{initial}</Provider>);
  return { show: (next: React.ReactNode) => view.rerender(<Provider store={store}>{next}</Provider>) };
}

const refocusTab = async () => {
  act(() => {
    fireEvent(document, new Event('visibilitychange', { bubbles: true }));
    fireEvent.focus(window);
  });
  await act(async () => {});
};

beforeEach(() => {
  now = START;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  mockBaseQuery.mockReset();
  mockBaseQuery.mockImplementation(async () => ({ data: { dashboard: { learningPath: [], practiceLessons: [] } } }));
});

afterEach(() => {
  jest.restoreAllMocks();
  removeListeners.splice(0).forEach(remove => remove());
});

test('the dashboard page ignores a tab refocus until its data is stale, then refreshes once', async () => {
  renderWithStore(<DashboardPageQuery />);
  expect(await screen.findByText('dashboard page ready')).toBeInTheDocument();
  expect(mockBaseQuery).toHaveBeenCalledTimes(1);

  now = START + STUDENT_DASHBOARD_FOCUS_REFRESH_MS - 1;
  await refocusTab();
  expect(mockBaseQuery).toHaveBeenCalledTimes(1);

  // A tab switch fires both focus and visibilitychange; the stale copy is still fetched only once.
  now = START + STUDENT_DASHBOARD_FOCUS_REFRESH_MS;
  await refocusTab();
  expect(mockBaseQuery).toHaveBeenCalledTimes(2);
});

test('a view that only displays the dashboard never rebuilds a cached copy', async () => {
  const { show } = renderWithStore(<DashboardPageQuery />);
  expect(await screen.findByText('dashboard page ready')).toBeInTheDocument();

  // Well past the app-wide 30-second remount window and the page's own focus threshold.
  now = START + STUDENT_DASHBOARD_FOCUS_REFRESH_MS * 2;
  show(<DashboardReader />);
  expect(await screen.findByText('reader ready')).toBeInTheDocument();
  await refocusTab();

  expect(mockBaseQuery).toHaveBeenCalledTimes(1);
});

test('a view that only displays the dashboard still loads it when nothing is cached', async () => {
  renderWithStore(<DashboardReader />);

  expect(await screen.findByText('reader ready')).toBeInTheDocument();
  expect(mockBaseQuery).toHaveBeenCalledTimes(1);
});

test('returning to the dashboard page after the remount window refreshes it', async () => {
  const { show } = renderWithStore(<DashboardPageQuery />);
  expect(await screen.findByText('dashboard page ready')).toBeInTheDocument();

  show(<DashboardReader />);
  now = START + 31_000;
  show(<DashboardPageQuery />);
  await act(async () => {});

  expect(mockBaseQuery).toHaveBeenCalledTimes(2);
});
