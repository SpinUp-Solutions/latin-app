import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LessonSidebar from '@/src/components/ui/lesson/lesson-sidebar';
import type { StudentDashboard } from '@/src/types/lesson';

const mockPush = jest.fn();
const mockToastError = jest.fn();
const mockUseGetStudentDashboardQuery = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'student-1' } }),
}));

const mockDashboard: StudentDashboard = {
  learningPath: [
    {
      id: 'lesson-1',
      kind: 'lesson',
      title: 'First lesson',
      description: '',
      type: 'normal',
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
      totalPages: 1,
      totalItems: 0,
      totalExercises: 0,
      progress: 100,
      status: 'completed',
      furthestPageIndex: 0,
      currentPageIndex: 0,
      exerciseProgress: [],
    },
    {
      id: 'test-1',
      kind: 'test',
      title: 'Chapter test',
      description: '',
      passingPercentage: 70,
      rotationVersionCount: 1,
      minTotalPoints: 10,
      maxTotalPoints: 10,
      status: 'available',
      attemptSummary: {
        origin: { kind: 'normal-test', testId: 'test-1' },
        inProgressAttemptId: null,
        attemptCount: 0,
        best: null,
        latest: null,
      },
    },
    {
      id: 'lesson-2',
      kind: 'lesson',
      title: 'Later lesson',
      description: '',
      type: 'normal',
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
      totalPages: 1,
      totalItems: 0,
      totalExercises: 0,
      progress: 0,
      status: 'locked',
      lockedReason: 'Pass Chapter test to unlock',
      furthestPageIndex: -1,
      currentPageIndex: 0,
      exerciseProgress: [],
    },
  ],
  practiceLessons: [],
};

jest.mock('@/src/store/api/lessonApi', () => ({
  useGetStudentDashboardQuery: () => mockUseGetStudentDashboardQuery(),
}));

describe('lesson sidebar mixed Learning Path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetStudentDashboardQuery.mockReturnValue({
      data: mockDashboard,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('shows tests and their gates, and routes test units to the test player', () => {
    render(<LessonSidebar currentLessonId="lesson-1" />);

    expect(screen.getByText('TEST')).toBeInTheDocument();
    expect(screen.getByText('Pass ≥ 70%')).toBeInTheDocument();
    expect(screen.getByText('Pass Chapter test to unlock')).toBeInTheDocument();

    const testButton = screen.getByRole('button', { name: /^Chapter test TEST Pass/ });
    expect(testButton).toHaveAttribute('type', 'button');
    fireEvent.click(testButton);
    expect(mockPush).toHaveBeenCalledWith('/test/test-1');

    fireEvent.click(screen.getByText('Later lesson'));
    expect(mockToastError).toHaveBeenCalledWith('Pass Chapter test to unlock');
  });

  it('renders a retryable error instead of an empty path when the query fails', () => {
    const refetch = jest.fn();
    mockUseGetStudentDashboardQuery.mockReturnValue({
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<LessonSidebar currentLessonId="lesson-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByText('Your Learning Path could not be loaded.')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('No learning units available')).not.toBeInTheDocument();
  });

  it('hides lesson actions from assistive tech while the sidebar is collapsed', () => {
    render(<LessonSidebar currentLessonId="lesson-1" isCollapsed />);

    expect(screen.queryByRole('button', { name: /^Chapter test TEST Pass/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close lessons sidebar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand lessons sidebar' })).toBeInTheDocument();
  });
});
