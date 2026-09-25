import React, { useState } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { appApi } from '@/src/store/api/appApi';
import { lessonApi } from '@/src/store/api/lessonApi';
import lessonEditorReducer from '@/src/store/slices/lessonEditorSlice';
import AdminLessonPreviewPage from '@/src/app/admin/(standalone)/lessons/preview/[id]/page';

jest.mock('@/src/components/student-feedback/FeedbackLessonDialog', () => ({ FeedbackLessonDialog: () => null }));

const mockBaseQuery = jest.fn();
let mockLessonId = 'lesson-1';
let mockIsAdmin = true;
const mockPush = jest.fn();

jest.mock('@/src/store/api/baseQuery', () => ({
  ...jest.requireActual('@/src/store/api/baseQuery'),
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: mockLessonId }),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' }, loading: false }),
  useRequireAdmin: () => ({ user: { uid: 'admin-1' }, loading: false, isAdmin: mockIsAdmin }),
}));
jest.mock('@/src/hooks/useAudio', () => ({
  __esModule: true,
  default: () => ({ audioRef: { current: null }, isPlaying: false, togglePlay: jest.fn() }),
}));
jest.mock('@/src/components/ui/core/simple-rich-display', () => ({
  SimpleRichDisplay: ({ content }: { content: string }) => <span>{content}</span>,
}));
// Keep the real LessonPlayer and its page state. Only the exercise renderer is
// replaced with a local answer input so an unmount is observable.
jest.mock('@/src/components/ui/lesson/page-template', () => ({
  __esModule: true,
  default: function Exercise({ pageIndex }: { pageIndex: number }) {
    const [answer, setAnswer] = useState('');
    return (
      <div>
        Preview page {pageIndex + 1}
        <input aria-label="Answer" value={answer} onChange={event => setAnswer(event.target.value)} />
      </div>
    );
  },
}));
jest.mock('@/src/components/ui/exercises/lesson-navigation', () => ({
  __esModule: true,
  default: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>Next page</button>,
}));

const createStore = () =>
  configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer, lessonEditor: lessonEditorReducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(appApi.middleware),
  });
const lessonResponse = (id = 'lesson-1') => ({
  data: {
    lesson: {
      id,
      title: `Preview ${id}`,
      type: 'normal',
      pages: [
        { id: `${id}-page-1`, items: [] },
        { id: `${id}-page-2`, items: [] },
      ],
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
    },
  },
});
const networkError = { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' };

describe('admin preview network recovery with the real player and RTK Query store', () => {
  let store: ReturnType<typeof createStore>;
  const page = () => (
    <Provider store={store}>
      <AdminLessonPreviewPage />
    </Provider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockLessonId = 'lesson-1';
    mockIsAdmin = true;
    mockBaseQuery.mockReset().mockResolvedValue(lessonResponse());
    store = createStore();
  });
  afterEach(() => {
    cleanup();
    store.dispatch(appApi.util.resetApiState());
  });

  const loadPreview = async () => {
    const view = render(page());
    await screen.findByText('Preview page 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'QA preview answer' } });
    return view;
  };
  const expectPreservedPreview = () => {
    expect(screen.getByText('Preview page 2')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('QA preview answer');
    expect(store.getState().lessonEditor.currentLesson?.id).toBe('lesson-1');
  };
  const refresh = async (error: unknown) => {
    mockBaseQuery.mockResolvedValue({ error });
    await act(async () => {
      await store.dispatch(
        lessonApi.endpoints.getLessonById.initiate({ lessonId: 'lesson-1' }, { subscribe: false, forceRefetch: true })
      );
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('status') ?? screen.queryByRole('heading', { name: 'We couldn’t open this lesson' })
      ).toBeInTheDocument()
    );
  };

  it('preserves the page and answer after an offline focus refresh and manual retry', async () => {
    await loadPreview();
    mockBaseQuery.mockResolvedValue({ error: networkError });
    act(() => {
      store.dispatch(appApi.internalActions.onFocusLost());
    });
    act(() => {
      store.dispatch(appApi.internalActions.onFocus());
    });
    await screen.findByRole('status');
    expectPreservedPreview();
    expect(screen.queryByText('We couldn’t open this lesson')).not.toBeInTheDocument();

    let resolve: (value: ReturnType<typeof lessonResponse>) => void = () => undefined;
    mockBaseQuery.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trying again…' })).toBeDisabled());
    expectPreservedPreview();
    await act(async () => resolve(lessonResponse()));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expectPreservedPreview();
    // Preview navigation and recovery must never submit student progress.
    expect(mockBaseQuery.mock.calls.map(([request]) => request)).toEqual([
      '/admin/lessons/lesson-1',
      '/admin/lessons/lesson-1',
      '/admin/lessons/lesson-1',
    ]);
  });

  it('recovers automatically on reconnect without resetting the preview', async () => {
    await loadPreview();
    await refresh(networkError);
    mockBaseQuery.mockResolvedValue(lessonResponse());
    act(() => {
      store.dispatch(appApi.internalActions.onOnline());
    });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expectPreservedPreview();
    expect(mockBaseQuery).toHaveBeenCalledTimes(3);
  });

  it('offers retry after an initial network failure without calling the lesson missing', async () => {
    mockBaseQuery.mockResolvedValue({ error: networkError });
    render(page());
    await screen.findByText('We couldn’t open this lesson');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('We couldn’t find this lesson.')).not.toBeInTheDocument();
    mockBaseQuery.mockResolvedValue(lessonResponse());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Preview page 1');
  });

  it.each([401, 403, 404, 409])('blocks cached content and clears editor state after HTTP %s', async status => {
    await loadPreview();
    await refresh({ status, data: { error: 'Unavailable' } });
    expect(screen.getByText('We couldn’t open this lesson')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(store.getState().lessonEditor.currentLesson).toBeNull();
  });

  it('keeps rejected content hidden through subsequent network failures until a successful read', async () => {
    await loadPreview();
    await refresh({ status: 403, data: { error: 'Forbidden' } });
    await refresh(networkError);
    // Wait for the second response to reach React's batched subscription.
    await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(store.getState().lessonEditor.currentLesson).toBeNull();
    mockBaseQuery.mockResolvedValue(lessonResponse());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Preview page 1');
    await refresh(networkError);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Preview page 1')).toBeInTheDocument();
  });

  it.each([
    { status: 'TIMEOUT_ERROR', error: 'Timed out' },
    { status: 503, data: { error: 'Temporarily unavailable' } },
  ])('preserves the preview for transient error $status', async error => {
    await loadPreview();
    await refresh(error);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expectPreservedPreview();
  });

  it('blocks malformed responses instead of falling back to cached content', async () => {
    await loadPreview();
    await refresh({ status: 'PARSING_ERROR', originalStatus: 200, data: 'bad', error: 'Invalid JSON' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(store.getState().lessonEditor.currentLesson).toBeNull();
  });

  it('does not show the previous lesson while another preview loads or fails', async () => {
    const view = await loadPreview();
    let resolve: (value: { error: typeof networkError }) => void = () => undefined;
    mockBaseQuery.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    mockLessonId = 'lesson-2';
    view.rerender(page());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(store.getState().lessonEditor.currentLesson).toBeNull();
    await act(async () => resolve({ error: networkError }));
    await screen.findByText('We couldn’t open this lesson');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('still removes the preview when the admin guard denies access', async () => {
    const view = await loadPreview();
    await refresh(networkError);
    mockIsAdmin = false;
    view.rerender(page());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(store.getState().lessonEditor.currentLesson).toBeNull();
  });
});
