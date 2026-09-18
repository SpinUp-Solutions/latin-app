import { configureStore } from '@reduxjs/toolkit';
import { createApi } from '@reduxjs/toolkit/query/react';
import { createAuthenticatedBaseQuery } from '@/src/store/api/baseQuery';
import { appApi } from '@/src/store/api/appApi';
import { lessonApi } from '@/src/store/api/lessonApi';

const mockGetIdToken = jest.fn();
const mockAuth: { currentUser: { uid: string; getIdToken: typeof mockGetIdToken } | null } = {
  currentUser: { uid: 'student-1', getIdToken: mockGetIdToken },
};

jest.mock('@/src/services/firebase', () => ({
  get auth() {
    return mockAuth;
  },
}));

const api = createApi({
  reducerPath: 'networkTestApi',
  baseQuery: createAuthenticatedBaseQuery(),
  endpoints: builder => ({
    read: builder.query<unknown, void>({
      query: () => '/lessons/lesson-1',
      extraOptions: { retryNetworkErrors: true },
    }),
    ordinaryRead: builder.query<unknown, void>({ query: () => '/admin/lessons' }),
    postQuery: builder.query<unknown, void>({
      query: () => ({ url: '/generated-exercise', method: 'POST' }),
      extraOptions: { retryNetworkErrors: true },
    }),
    write: builder.mutation<unknown, void>({
      query: () => ({ url: '/progress/student-1/lesson-1', method: 'POST', body: {} }),
      extraOptions: { retryNetworkErrors: true },
    }),
  }),
});

const createStore = () =>
  configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(api.middleware),
  });
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const tokenNetworkError = Object.assign(new Error('Sensitive token failure detail'), {
  code: 'auth/network-request-failed',
});

// Exercise the real fetchBaseQuery, auth header preparation, and RTK lifecycle.
describe('authenticated read network recovery', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch.mockReset();
    mockGetIdToken.mockReset().mockResolvedValue('test-token');
    mockAuth.currentUser = { uid: 'student-1', getIdToken: mockGetIdToken };
    global.fetch = mockFetch;
    store = createStore();
  });

  afterEach(() => {
    store.dispatch(api.util.resetApiState());
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('recovers a transient GET failure with a fresh authenticated request', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(jsonResponse({ ok: true }));
    const request = store.dispatch(api.endpoints.read.initiate());
    await jest.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(api.endpoints.read.select()(store.getState()).isLoading).toBe(true);
    await jest.advanceTimersByTimeAsync(500);
    expect((await request).data).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockGetIdToken).toHaveBeenCalledTimes(2);
    expect((mockFetch.mock.calls[1][0] as Request).headers.get('authorization')).toBe('Bearer test-token');
  });

  it.each(['lesson', 'dashboard'])('enables retries on the actual student %s endpoint', async endpoint => {
    const appStore = configureStore({
      reducer: { [appApi.reducerPath]: appApi.reducer },
      middleware: getDefaultMiddleware => getDefaultMiddleware().concat(appApi.middleware),
    });
    const data = endpoint === 'lesson' ? { id: 'lesson-1', pages: [] } : { learningPath: [], practiceLessons: [] };
    mockFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ [endpoint]: data }));
    try {
      const request =
        endpoint === 'lesson'
          ? appStore.dispatch(
              lessonApi.endpoints.getStudentLesson.initiate({ lessonId: 'lesson-1', userId: 'student-1' })
            )
          : appStore.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
      await jest.advanceTimersByTimeAsync(500);
      expect((await request).data).toEqual(data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      appStore.dispatch(appApi.util.resetApiState());
    }
  });

  it('stops after two retries and returns an ordinary FETCH_ERROR', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const request = store.dispatch(api.endpoints.read.initiate());
    await jest.advanceTimersByTimeAsync(2000);
    expect((await request).error).toMatchObject({ status: 'FETCH_ERROR' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('enables bounded retries on the actual admin lesson read endpoint', async () => {
    const appStore = configureStore({
      reducer: { [appApi.reducerPath]: appApi.reducer },
      middleware: getDefaultMiddleware => getDefaultMiddleware().concat(appApi.middleware),
    });
    const lesson = { id: 'lesson-1', pages: [] };
    mockFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ lesson }));
    try {
      const request = appStore.dispatch(lessonApi.endpoints.getLessonById.initiate({ lessonId: 'lesson-1' }));
      await jest.advanceTimersByTimeAsync(2000);
      expect((await request).data).toEqual({ lesson, tooltips: {} });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect((mockFetch.mock.calls[2][0] as Request).url).toContain('/api/admin/lessons/lesson-1');
    } finally {
      appStore.dispatch(appApi.util.resetApiState());
    }
  });

  it('recovers when Firebase token refresh temporarily cannot reach the network', async () => {
    mockGetIdToken.mockRejectedValueOnce(tokenNetworkError).mockResolvedValue('fresh-token');
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    const request = store.dispatch(api.endpoints.read.initiate());
    await jest.advanceTimersByTimeAsync(0);
    expect(mockFetch).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(500);
    expect((await request).data).toEqual({ ok: true });
    expect(mockGetIdToken).toHaveBeenCalledTimes(2);
    expect((mockFetch.mock.calls[0][0] as Request).headers.get('authorization')).toBe('Bearer fresh-token');
  });

  it('normalizes exhausted token network failures without exposing token error details', async () => {
    mockGetIdToken.mockRejectedValue(tokenNetworkError);
    const request = store.dispatch(api.endpoints.read.initiate());
    await jest.advanceTimersByTimeAsync(2000);
    const result = await request;
    expect(result.error).toEqual({
      status: 'FETCH_ERROR',
      error: 'We’re having trouble connecting. Please try again.',
    });
    expect(mockGetIdToken).toHaveBeenCalledTimes(3);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 409, 500])('does not retry an HTTP %s response', async status => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Rejected' }, status));
    const request = store.dispatch(api.endpoints.read.initiate());
    await jest.advanceTimersByTimeAsync(2000);
    expect((await request).error).toMatchObject({ status });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry invalid response JSON', async () => {
    mockFetch.mockResolvedValue(new Response('broken JSON'));
    const request = store.dispatch(api.endpoints.read.initiate());
    await jest.advanceTimersByTimeAsync(2000);
    expect((await request).error).toMatchObject({ status: 'PARSING_ERROR' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry mutations, POST queries, or reads that did not opt in', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const requests = [
      store.dispatch(api.endpoints.write.initiate()),
      store.dispatch(api.endpoints.postQuery.initiate()),
      store.dispatch(api.endpoints.ordinaryRead.initiate()),
    ];
    await jest.advanceTimersByTimeAsync(2000);
    expect((await Promise.all(requests)).every(result => 'error' in result)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('stops a retry waiting in backoff when the query is aborted', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const request = store.dispatch(api.endpoints.read.initiate());
    await jest.advanceTimersByTimeAsync(0);
    request.abort();
    await jest.advanceTimersByTimeAsync(2000);
    expect((await request).error).toMatchObject({ name: 'AbortError' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each(['student-2', null])('stops retrying if the account changes to %s', async uid => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const request = store.dispatch(api.endpoints.read.initiate());
    await jest.advanceTimersByTimeAsync(0);
    mockAuth.currentUser = uid ? { uid, getIdToken: mockGetIdToken } : null;
    await jest.advanceTimersByTimeAsync(2000);
    expect((await request).error).toMatchObject({ status: 'FETCH_ERROR' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('preserves non-network token errors without retries', async () => {
    const error = Object.assign(new Error('Session revoked'), { code: 'auth/user-token-expired' });
    mockGetIdToken.mockRejectedValue(error);
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const request = store.dispatch(api.endpoints.read.initiate());
      await jest.advanceTimersByTimeAsync(2000);
      expect((await request).error).toMatchObject({ code: 'auth/user-token-expired' });
      expect(mockGetIdToken).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
