import { configureStore } from '@reduxjs/toolkit';
import { appApi } from '@/src/store/api/appApi';
import { lessonApi } from '@/src/store/api/lessonApi';
import type { AppDispatch } from '@/src/store';
import {
  clearPersistedStudentDashboard,
  persistStudentDashboard,
  readPersistedStudentDashboard,
  resetStudentDashboardCacheSeed,
  seedStudentDashboardCache,
} from '@/src/store/api/dashboardCache';
import type { StudentDashboard } from '@/src/types/lesson';

const mockBaseQuery = jest.fn();
jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));

const createStore = () =>
  configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(appApi.middleware),
  });

const dashboardCacheEntry = (store: ReturnType<typeof createStore>) => {
  const queries = store.getState()[appApi.reducerPath].queries as Record<string, { data?: unknown }>;
  const key = Object.keys(queries).find(candidate => candidate.startsWith('getStudentDashboard'));
  return key ? queries[key] : undefined;
};

const dashboard = (learningPath: Array<{ id: string }>): StudentDashboard =>
  ({ learningPath, practiceLessons: [] }) as unknown as StudentDashboard;

describe('student dashboard cross-load cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    resetStudentDashboardCacheSeed();
  });

  it('persists, reads, and clears the dashboard per student', () => {
    const persisted = dashboard([{ id: 'lesson-1' }]);

    expect(readPersistedStudentDashboard('user-1')).toBeNull();
    persistStudentDashboard('user-1', persisted);
    expect(readPersistedStudentDashboard('user-1')).toEqual(persisted);
    expect(readPersistedStudentDashboard('user-2')).toBeNull();

    clearPersistedStudentDashboard('user-1');
    expect(readPersistedStudentDashboard('user-1')).toBeNull();
  });

  it('ignores corrupt or structurally invalid persisted entries', () => {
    localStorage.setItem('latin-app:student-dashboard:v1:user-1', '{not json');
    expect(readPersistedStudentDashboard('user-1')).toBeNull();

    localStorage.setItem('latin-app:student-dashboard:v1:user-1', JSON.stringify({ learningPath: 'nope' }));
    expect(readPersistedStudentDashboard('user-1')).toBeNull();
  });

  it('seeds the RTK Query cache instantly and revalidates in the background', async () => {
    mockBaseQuery.mockResolvedValue({
      data: { dashboard: dashboard([{ id: 'fresh-lesson' }]) },
    });
    const persisted = dashboard([{ id: 'cached-lesson' }]);
    persistStudentDashboard('user-1', persisted);

    const store = createStore();
    const dispatch = store.dispatch as unknown as AppDispatch;
    dispatch(seedStudentDashboardCache('user-1'));

    // The persisted projection is available synchronously, before any request
    // resolves — no loading flash on the first dashboard render.
    expect(dashboardCacheEntry(store)?.data).toEqual(persisted);
    expect(mockBaseQuery).toHaveBeenCalledTimes(1);

    // The forced background refetch replaces the seeded data and persists it.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(dashboardCacheEntry(store)?.data).toEqual(dashboard([{ id: 'fresh-lesson' }]));
    expect(readPersistedStudentDashboard('user-1')).toEqual(dashboard([{ id: 'fresh-lesson' }]));
  });

  it('seeds only once per uid so a repeated auth event cannot overwrite fresh data', async () => {
    mockBaseQuery.mockResolvedValue({
      data: { dashboard: dashboard([{ id: 'fresh-lesson' }]) },
    });
    persistStudentDashboard('user-1', dashboard([{ id: 'cached-lesson' }]));

    const store = createStore();
    const dispatch = store.dispatch as unknown as AppDispatch;
    dispatch(seedStudentDashboardCache('user-1'));
    await new Promise(resolve => setTimeout(resolve, 0));

    // A later auth event re-seeding the same uid is a no-op: the fresh
    // in-memory projection must survive.
    persistStudentDashboard('user-1', dashboard([{ id: 'stale-lesson' }]));
    dispatch(seedStudentDashboardCache('user-1'));

    expect(dashboardCacheEntry(store)?.data).toEqual(dashboard([{ id: 'fresh-lesson' }]));
  });

  it('reuses an in-flight fetch instead of seeding over it or issuing a duplicate', async () => {
    let resolveFetch: ((value: { data: { dashboard: StudentDashboard } }) => void) | null = null;
    mockBaseQuery.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        })
    );
    persistStudentDashboard('user-1', dashboard([{ id: 'cached-lesson' }]));

    const store = createStore();
    const dispatch = store.dispatch as unknown as AppDispatch;

    // The page hook beat the auth listener: its request is already running.
    const inflight = dispatch(lessonApi.endpoints.getStudentDashboard.initiate('user-1', { subscribe: false }));
    dispatch(seedStudentDashboardCache('user-1'));

    // No duplicate request, and the stale projection was never seeded over it.
    expect(mockBaseQuery).toHaveBeenCalledTimes(1);
    expect(dashboardCacheEntry(store)?.data).toBeUndefined();

    resolveFetch!({ data: { dashboard: dashboard([{ id: 'fresh-lesson' }]) } });
    await inflight;
    expect(dashboardCacheEntry(store)?.data).toEqual(dashboard([{ id: 'fresh-lesson' }]));
    expect(readPersistedStudentDashboard('user-1')).toEqual(dashboard([{ id: 'fresh-lesson' }]));
  });

  it('falls back to persisted data when the reused in-flight fetch fails', async () => {
    let rejectFetch: ((value: { error: { status: string; error: string } }) => void) | null = null;
    mockBaseQuery.mockImplementation(
      () =>
        new Promise(resolve => {
          rejectFetch = resolve;
        })
    );
    const persisted = dashboard([{ id: 'cached-lesson' }]);
    persistStudentDashboard('user-1', persisted);

    const store = createStore();
    const dispatch = store.dispatch as unknown as AppDispatch;
    const inflight = dispatch(lessonApi.endpoints.getStudentDashboard.initiate('user-1', { subscribe: false }));
    dispatch(seedStudentDashboardCache('user-1'));

    rejectFetch!({ error: { status: 'FETCH_ERROR', error: 'offline' } });
    await inflight;
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dashboardCacheEntry(store)?.data).toEqual(persisted);
    expect(mockBaseQuery).toHaveBeenCalledTimes(1);
  });

  it('never overwrites fresh in-memory data with the persisted projection', async () => {
    mockBaseQuery.mockResolvedValue({
      data: { dashboard: dashboard([{ id: 'fresh-lesson' }]) },
    });
    persistStudentDashboard('user-1', dashboard([{ id: 'stale-lesson' }]));

    const store = createStore();
    const dispatch = store.dispatch as unknown as AppDispatch;

    // A real fetch already fulfilled before seeding ran (hook beat the auth
    // listener).
    await dispatch(lessonApi.endpoints.getStudentDashboard.initiate('user-1', { subscribe: false }));

    resetStudentDashboardCacheSeed();
    dispatch(seedStudentDashboardCache('user-1'));

    expect(dashboardCacheEntry(store)?.data).toEqual(dashboard([{ id: 'fresh-lesson' }]));
    expect(mockBaseQuery).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch anything when there is nothing persisted', () => {
    const store = createStore();
    const dispatch = store.dispatch as unknown as AppDispatch;
    dispatch(seedStudentDashboardCache('user-1'));

    expect(dashboardCacheEntry(store)).toBeUndefined();
    expect(mockBaseQuery).not.toHaveBeenCalled();
  });
});
