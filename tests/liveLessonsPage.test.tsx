import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import LiveLessonsPage from '@/src/app/admin/lessons/live/page';
import lessonReducer, { syncLessonsFromRTQ } from '@/src/store/slices/lessonSlice';
import type { LessonSummary } from '@/src/types/lesson';

const mockUseGetLessonsQuery = jest.fn();
const mockUpdatePublishStatus = jest.fn();

jest.mock('@/src/store/api/lessonApi', () => ({
  useGetLessonsQuery: () => mockUseGetLessonsQuery(),
  useUpdateLessonsPublishStatusMutation: () => [mockUpdatePublishStatus],
  useReorderLessonsMutation: () => [jest.fn()],
}));

jest.mock('@/src/components/auth/withAdminAuth', () => ({
  withAdminAuth: (Component: unknown) => Component,
}));

jest.mock('@/src/components/ui/tabs', () => ({
  Tabs: ({ children, onValueChange }: { children: React.ReactNode; onValueChange?: (value: string) => void }) => (
    <div>
      <button onClick={() => onValueChange?.('vocab')}>Switch to vocab</button>
      {children}
    </div>
  ),
  TabsContent: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/components/ui/admin/LessonTypeTabs', () => ({
  LessonTypeTabs: () => null,
}));

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => children,
  closestCenter: jest.fn(),
  KeyboardSensor: class {},
  PointerSensor: class {},
  useSensor: jest.fn(),
  useSensors: () => [],
}));

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
}));

jest.mock('@/src/components/admin/SortableLessonItem', () => ({
  SortableLessonItem: ({ lesson }: { lesson: LessonSummary }) => <div>{lesson.title}</div>,
}));

const liveLesson: LessonSummary = {
  id: 'live-lesson',
  title: 'Live lesson',
  type: 'normal',
  isLive: true,
  liveOrder: 0,
  publishedAt: null,
  publishedBy: null,
  totalPages: 1,
  totalItems: 1,
  totalExercises: 1,
};

const draftLesson: LessonSummary = {
  ...liveLesson,
  id: 'draft-lesson',
  title: 'Draft lesson',
  isLive: false,
  liveOrder: null,
};

const vocabLiveLesson: LessonSummary = {
  ...liveLesson,
  id: 'vocab-live-lesson',
  title: 'Vocab live lesson',
  type: 'vocab',
};

describe('Manage Live Lessons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('waits for lesson data before initializing the publish selection', async () => {
    const refetch = jest.fn();
    mockUseGetLessonsQuery.mockReturnValue({ data: undefined, isLoading: true, refetch });
    const store = configureStore({ reducer: { lesson: lessonReducer } });
    const view = render(
      <Provider store={store}>
        <LiveLessonsPage />
      </Provider>
    );

    mockUseGetLessonsQuery.mockReturnValue({ data: [liveLesson], isLoading: false, refetch });
    view.rerender(
      <Provider store={store}>
        <LiveLessonsPage />
      </Provider>
    );

    await waitFor(() => expect(screen.getByText('Live Lessons Order (1)')).toBeInTheDocument());
    expect(screen.queryByText(/lessons selected/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Changes' })).not.toBeInTheDocument();
    expect(mockUpdatePublishStatus).not.toHaveBeenCalled();
  });

  it('does not expose publish changes when cached Redux data has not been initialized from the server', () => {
    mockUseGetLessonsQuery.mockReturnValue({ data: undefined, isLoading: false, refetch: jest.fn() });
    const store = configureStore({ reducer: { lesson: lessonReducer } });
    store.dispatch(syncLessonsFromRTQ([liveLesson]));

    render(
      <Provider store={store}>
        <LiveLessonsPage />
      </Provider>
    );

    expect(screen.getByText('Live Lessons Order (1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Changes' })).not.toBeInTheDocument();
    expect(mockUpdatePublishStatus).not.toHaveBeenCalled();
  });

  it('prevents removing the final live lesson', async () => {
    mockUseGetLessonsQuery.mockReturnValue({ data: [liveLesson], isLoading: false, refetch: jest.fn() });
    const store = configureStore({ reducer: { lesson: lessonReducer } });

    render(
      <Provider store={store}>
        <LiveLessonsPage />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    const checkbox = await screen.findByRole('checkbox');
    fireEvent.click(checkbox);

    expect(screen.getByText('At least one lesson must remain live')).toBeInTheDocument();
    const applyButton = screen.getByRole('button', { name: 'Apply Changes' });
    expect(applyButton).toBeDisabled();
    fireEvent.click(applyButton);
    expect(mockUpdatePublishStatus).not.toHaveBeenCalled();
  });

  it('reinitializes the selection for the active lesson type', async () => {
    mockUseGetLessonsQuery.mockReturnValue({
      data: [liveLesson, vocabLiveLesson],
      isLoading: false,
      refetch: jest.fn(),
    });
    const store = configureStore({ reducer: { lesson: lessonReducer } });

    render(
      <Provider store={store}>
        <LiveLessonsPage />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    expect(screen.getByText('At least one lesson must remain live')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to vocab' }));

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect(screen.getByText('Vocab live lesson')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Changes' })).not.toBeInTheDocument();
  });

  it('sends the active lesson type with publish requests', async () => {
    const refetch = jest.fn().mockResolvedValue({ data: [liveLesson, { ...draftLesson, isLive: true }] });
    mockUseGetLessonsQuery.mockReturnValue({ data: [liveLesson, draftLesson], isLoading: false, refetch });
    mockUpdatePublishStatus.mockReturnValue({ unwrap: jest.fn().mockResolvedValue({ success: true }) });
    const store = configureStore({ reducer: { lesson: lessonReducer } });

    render(
      <Provider store={store}>
        <LiveLessonsPage />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    const checkboxes = await screen.findAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

    await waitFor(() =>
      expect(mockUpdatePublishStatus).toHaveBeenCalledWith({
        lessonIds: ['draft-lesson'],
        isLive: true,
        lessonType: 'normal',
        expectedLiveLessonIds: ['live-lesson'],
      })
    );
  });

  it('invalidates a pending selection when the server live set changes', async () => {
    const refetch = jest.fn();
    mockUseGetLessonsQuery.mockReturnValue({ data: [liveLesson, draftLesson], isLoading: false, refetch });
    const store = configureStore({ reducer: { lesson: lessonReducer } });
    const view = render(
      <Provider store={store}>
        <LiveLessonsPage />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    const checkboxes = await screen.findAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    expect(screen.getByRole('button', { name: 'Apply Changes' })).toBeEnabled();

    mockUseGetLessonsQuery.mockReturnValue({
      data: [liveLesson, { ...draftLesson, isLive: true, liveOrder: 1 }],
      isLoading: false,
      refetch,
    });
    view.rerender(
      <Provider store={store}>
        <LiveLessonsPage />
      </Provider>
    );

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply Changes' })).not.toBeInTheDocument());
    expect(mockUpdatePublishStatus).not.toHaveBeenCalled();
  });
});
