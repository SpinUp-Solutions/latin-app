import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { appApi } from '@/src/store/api/appApi';
import { useBufferedAttemptAnswers } from '@/src/hooks/useBufferedAttemptAnswers';

const mockBaseQuery = jest.fn();
jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
  getApiErrorMessage: () => 'Save failed',
  getApiErrorCode: (error: { data?: { code?: string } }) => error.data?.code,
}));
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
const saved = (revision: number) => ({
  data: { attempt: { flowVersion: 1, section: { pageId: 'page-1', revision } } },
});
function setup() {
  const store = configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer },
    middleware: get => get().concat(appApi.middleware),
  });
  const hook = renderHook(() => useBufferedAttemptAnswers(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
  act(() =>
    hook.result.current.activateAttempt({
      attemptId: 'attempt-1',
      originKey: 'normal:test',
      uid: 'student-1',
      answers: {},
      section: { pageId: 'page-1', revision: 0 },
    })
  );
  return { ...hook, store };
}
const event = (value: string) => ({ exerciseId: 'exercise', answer: { type: 'fill' as const, answers: [value] } });
beforeEach(() => {
  jest.clearAllMocks();
  let id = 0;
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
  });
});

it('serializes an in-flight save and newer answers with the server-returned revision', async () => {
  let release!: (value: unknown) => void;
  mockBaseQuery
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    )
    .mockResolvedValueOnce(saved(2));
  const { result, unmount, store } = setup();
  act(() => result.current.recordAnswer(event('first')));
  let flushing!: Promise<void>;
  act(() => {
    flushing = result.current.flushPendingAnswers();
  });
  await waitFor(() => expect(mockBaseQuery).toHaveBeenCalledTimes(1));
  act(() => result.current.recordAnswer(event('newer')));
  await act(async () => {
    release(saved(1));
    await flushing;
  });
  expect(mockBaseQuery.mock.calls.map(call => call[0].body)).toMatchObject([
    { answers: { exercise: { answers: ['first'] } }, section: { expectedRevision: 0 } },
    { answers: { exercise: { answers: ['newer'] } }, section: { expectedRevision: 1 } },
  ]);
  expect(result.current.getSectionRevision()).toBe(2);
  expect(result.current.answers.exercise).toEqual(event('newer').answer);
  unmount();
  store.dispatch(appApi.util.resetApiState());
});

it('retries a lost save response with the exact original mutation ID before sending later edits', async () => {
  mockBaseQuery
    .mockResolvedValueOnce({ error: { status: 'FETCH_ERROR', error: 'lost' } })
    .mockResolvedValueOnce(saved(1))
    .mockResolvedValueOnce(saved(2));
  const { result, unmount, store } = setup();
  act(() => result.current.recordAnswer(event('first')));
  await act(async () => {
    await expect(result.current.flushPendingAnswers()).rejects.toBeDefined();
  });
  act(() => result.current.recordAnswer(event('second')));
  await act(async () => {
    await result.current.flushPendingAnswers();
  });
  expect(mockBaseQuery.mock.calls[1][0].body).toEqual(mockBaseQuery.mock.calls[0][0].body);
  expect(mockBaseQuery.mock.calls[2][0].body).toMatchObject({
    answers: { exercise: { answers: ['second'] } },
    section: { expectedRevision: 1 },
  });
  expect(result.current.hasUnsavedAnswers()).toBe(false);
  unmount();
  store.dispatch(appApi.util.resetApiState());
});

it('stops stale-tab replay and preserves the local answer until authoritative reload', async () => {
  mockBaseQuery.mockResolvedValue({ error: { status: 409, data: { code: 'ATTEMPT_REVISION_CONFLICT' } } });
  const { result, unmount, store } = setup();
  act(() => result.current.recordAnswer(event('local text')));
  await act(async () => {
    await expect(result.current.flushPendingAnswers()).rejects.toBeDefined();
  });
  expect(result.current.conflict).toBe(true);
  expect(result.current.answers.exercise).toEqual(event('local text').answer);
  await act(async () => {
    await expect(result.current.flushPendingAnswers()).rejects.toBeDefined();
  });
  expect(mockBaseQuery).toHaveBeenCalledTimes(1);
  act(() =>
    result.current.activateAttempt({
      attemptId: 'attempt-1',
      originKey: 'normal:test',
      uid: 'student-1',
      answers: { exercise: event('remote').answer },
      section: { pageId: 'page-1', revision: 4 },
    })
  );
  expect(result.current.conflict).toBe(false);
  expect(result.current.getSectionRevision()).toBe(4);
  unmount();
  store.dispatch(appApi.util.resetApiState());
});

it('treats an exact retry overtaken by another tab as a conflict, retaining local text', async () => {
  mockBaseQuery
    .mockResolvedValueOnce({ error: { status: 'FETCH_ERROR', error: 'lost' } })
    .mockResolvedValueOnce(saved(2));
  const { result, unmount, store } = setup();
  act(() => result.current.recordAnswer(event('local text')));
  await act(async () => {
    await expect(result.current.flushPendingAnswers()).rejects.toBeDefined();
    await expect(result.current.flushPendingAnswers()).rejects.toBeDefined();
  });
  expect(result.current.conflict).toBe(true);
  expect(result.current.answers.exercise).toEqual(event('local text').answer);
  expect(result.current.getSectionRevision()).toBe(0);
  await act(async () => {
    await expect(result.current.flushPendingAnswers()).rejects.toBeDefined();
  });
  expect(mockBaseQuery).toHaveBeenCalledTimes(2);
  expect(mockBaseQuery.mock.calls[1][0].body).toEqual(mockBaseQuery.mock.calls[0][0].body);
  unmount();
  store.dispatch(appApi.util.resetApiState());
});

it('ignores a late save response after moving to a different section', async () => {
  let release!: (value: unknown) => void;
  mockBaseQuery.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        release = resolve;
      })
  );
  const { result, unmount, store } = setup();
  act(() => result.current.recordAnswer(event('old section')));
  let flushing!: Promise<void>;
  act(() => {
    flushing = result.current.flushPendingAnswers();
  });
  await waitFor(() => expect(mockBaseQuery).toHaveBeenCalledTimes(1));
  act(() =>
    result.current.activateAttempt({
      attemptId: 'attempt-1',
      originKey: 'normal:test',
      uid: 'student-1',
      answers: {},
      section: { pageId: 'page-2', revision: 0 },
    })
  );
  await act(async () => {
    release(saved(1));
    await flushing;
  });
  expect(result.current.answers).toEqual({});
  expect(result.current.getSectionRevision()).toBe(0);
  unmount();
  store.dispatch(appApi.util.resetApiState());
});
