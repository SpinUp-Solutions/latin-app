import React, { useState } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import { appApi } from '@/src/store/api/appApi';
import { lessonApi } from '@/src/store/api/lessonApi';
import DynamicLessonPage from '@/src/app/lesson/[lessonId]/page';

const mockBaseQuery = jest.fn();
let mockLessonId = 'lesson-1';
let mockUserId = 'student-1';
const mockPush = jest.fn();

jest.mock('@/src/store/api/baseQuery', () => ({
  ...jest.requireActual('@/src/store/api/baseQuery'),
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));
jest.mock('next/navigation', () => ({
  useParams: () => ({ lessonId: mockLessonId }),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: mockUserId }, loading: false }),
}));
jest.mock('@/src/components/ui/lesson/lesson-player', () => ({
  __esModule: true,
  default: function Player({ lesson }: { lesson: { id: string } }) {
    const [answer, setAnswer] = useState('');
    return (
      <div>
        Player {lesson.id}
        <input aria-label="Answer" value={answer} onChange={event => setAnswer(event.target.value)} />
      </div>
    );
  },
}));
jest.mock('@/src/components/ui/lesson/lesson-sidebar', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/ui/lesson/practice-sidebar', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/ui/core/feedback-banner', () => ({ FeedbackBanner: () => null }));

const createStore = () =>
  configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(appApi.middleware),
  });
const lessonResponse = (id = 'lesson-1') => ({ data: { lesson: { id, title: id, type: 'normal', pages: [] } } });
const networkError = { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' };

describe('lesson network recovery with a real RTK Query store', () => {
  let store: ReturnType<typeof createStore>;
  const page = () => (
    <Provider store={store}>
      <DynamicLessonPage />
    </Provider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockLessonId = 'lesson-1';
    mockUserId = 'student-1';
    mockBaseQuery.mockReset().mockResolvedValue(lessonResponse());
    store = createStore();
  });
  afterEach(() => {
    cleanup();
    store.dispatch(appApi.util.resetApiState());
  });

  const loadLesson = async () => {
    const view = render(page());
    await screen.findByText('Player lesson-1');
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'in-progress answer' } });
    return view;
  };
  const refresh = async (error: unknown) => {
    mockBaseQuery.mockResolvedValue({ error });
    await act(async () => {
      await store.dispatch(
        lessonApi.endpoints.getStudentLesson.initiate(
          { lessonId: 'lesson-1', userId: 'student-1' },
          { subscribe: false, forceRefetch: true }
        )
      );
    });
    // RTK Query batches subscription notifications after the request settles.
    await waitFor(() =>
      expect(
        screen.queryByRole('status') ?? screen.queryByRole('heading', { name: /Lesson Locked|Failed to Load Lesson/ })
      ).toBeInTheDocument()
    );
  };

  it('keeps the player and its local answer mounted after a progress-triggered refresh fails', async () => {
    await loadLesson();
    mockBaseQuery.mockImplementation(async (request: unknown) =>
      typeof request === 'string' ? { error: networkError } : { data: { success: true } }
    );
    await act(async () => {
      await store.dispatch(
        lessonApi.endpoints.updatePageProgress.initiate({
          userId: 'student-1',
          lessonId: 'lesson-1',
          pageId: 'page-2',
        })
      );
    });
    await screen.findByRole('status');
    expect(mockBaseQuery).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('in-progress answer');
    expect(screen.queryByText('Failed to Load Lesson')).not.toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        level: 'warning',
        tags: { surface: 'lesson_refresh', lessonId: 'lesson-1' },
        extra: expect.objectContaining({ hasCurrentLesson: true }),
      })
    );
  });

  it('recovers with Try again without resetting the player', async () => {
    await loadLesson();
    await refresh(networkError);
    let resolve: (value: ReturnType<typeof lessonResponse>) => void = () => undefined;
    mockBaseQuery.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retrying…' })).toBeDisabled());
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('in-progress answer');
    await act(async () => resolve(lessonResponse()));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('in-progress answer');
  });

  it('refetches after reconnect and removes the warning', async () => {
    await loadLesson();
    await refresh(networkError);
    mockBaseQuery.mockResolvedValue(lessonResponse());
    act(() => {
      store.dispatch(appApi.internalActions.onOnline());
    });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(mockBaseQuery).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('in-progress answer');
  });

  it('shows a retryable initial error and can load the lesson after recovery', async () => {
    mockBaseQuery.mockResolvedValue({ error: networkError });
    render(page());
    await screen.findByText('Failed to Load Lesson');
    expect(screen.queryByText('Player lesson-1')).not.toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        level: 'error',
        tags: { surface: 'lesson_load', lessonId: 'lesson-1' },
      })
    );
    mockBaseQuery.mockResolvedValue(lessonResponse());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Player lesson-1');
  });

  it.each([401, 403, 404, 409])('does not show cached content after HTTP %s', async status => {
    await loadLesson();
    await refresh({ status, data: { error: 'Unavailable' } });
    expect(screen.queryByText('Player lesson-1')).not.toBeInTheDocument();
    expect(screen.getByText(status === 403 ? 'Lesson Locked' : 'Failed to Load Lesson')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('keeps rejected cached content hidden through later network failures until a successful load', async () => {
    await loadLesson();
    await refresh({ status: 403, data: { code: 'LESSON_LOCKED' } });
    await refresh(networkError);
    await waitFor(() =>
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ tags: { surface: 'lesson_load', lessonId: 'lesson-1' } })
      )
    );
    expect(screen.queryByText('Player lesson-1')).not.toBeInTheDocument();
    mockBaseQuery.mockResolvedValue(lessonResponse());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Player lesson-1');
    await refresh(networkError);
    expect(screen.getByText('Player lesson-1')).toBeInTheDocument();
  });

  it.each([
    { status: 'TIMEOUT_ERROR', error: 'Timed out' },
    { status: 503, data: { error: 'Temporarily unavailable' } },
  ])('preserves cached content for transient error $status', async error => {
    await loadLesson();
    await refresh(error);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('in-progress answer');
  });

  it('does not hide malformed response errors behind cached content', async () => {
    await loadLesson();
    await refresh({ status: 'PARSING_ERROR', originalStatus: 200, data: 'bad', error: 'Invalid JSON' });
    expect(screen.queryByText('Player lesson-1')).not.toBeInTheDocument();
    expect(screen.getByText('Failed to Load Lesson')).toBeInTheDocument();
  });

  it.each(['lesson', 'account'])(
    'does not reuse previous content when the %s changes and loading fails',
    async change => {
      const view = await loadLesson();
      mockBaseQuery.mockResolvedValue({ error: networkError });
      if (change === 'lesson') mockLessonId = 'lesson-2';
      else mockUserId = 'student-2';
      view.rerender(page());
      await screen.findByText('Failed to Load Lesson');
      expect(screen.queryByText('Player lesson-1')).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    }
  );
});
