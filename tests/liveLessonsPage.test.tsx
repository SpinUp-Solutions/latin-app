import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import LiveLessonsPage from '@/src/app/admin/lessons/live/page';
import lessonReducer from '@/src/store/slices/lessonSlice';
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
  Tabs: ({ children }: { children: React.ReactNode }) => children,
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

describe('Manage Live Lessons', () => {
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
});
