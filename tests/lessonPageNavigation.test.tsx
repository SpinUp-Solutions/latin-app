import React from 'react';
import { render, screen } from '@testing-library/react';
import DynamicLessonPage from '@/src/app/lesson/[lessonId]/page';

const mockPush = jest.fn();
const mockUseGetStudentLessonQuery = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ lessonId: 'lesson-2' }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'student-1' }, loading: false }),
}));

jest.mock('@/src/store/api/lessonApi', () => ({
  useGetStudentLessonQuery: (...args: unknown[]) => mockUseGetStudentLessonQuery(...args),
}));

jest.mock('@/src/components/ui/lesson/lesson-player', () => ({
  __esModule: true,
  default: ({ lesson }: { lesson: { id: string } }) => <div>Player {lesson.id}</div>,
}));

jest.mock('@/src/components/ui/lesson/lesson-sidebar', () => ({
  __esModule: true,
  default: () => <aside>Lesson sidebar</aside>,
}));

jest.mock('@/src/components/ui/lesson/practice-sidebar', () => ({
  __esModule: true,
  default: () => <aside>Practice sidebar</aside>,
}));

jest.mock('@/src/components/ui/core/feedback-banner', () => ({
  FeedbackBanner: () => null,
}));

const lesson = (id: string) => ({
  id,
  title: id,
  type: 'normal',
  pages: [{ id: `${id}-page-1`, items: [] }],
});

describe('lesson route navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('does not render the previous lesson while the requested lesson is loading', () => {
    mockUseGetStudentLessonQuery.mockReturnValue({
      data: lesson('lesson-1'),
      currentData: undefined,
      isLoading: false,
      error: undefined,
    });

    render(<DynamicLessonPage />);

    expect(screen.queryByText('Player lesson-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Player lesson-2')).not.toBeInTheDocument();
  });

  it('does not flash stale currentData while the route argument changes', () => {
    mockUseGetStudentLessonQuery.mockReturnValue({
      data: lesson('lesson-1'),
      currentData: lesson('lesson-1'),
      isLoading: false,
      error: undefined,
    });

    render(<DynamicLessonPage />);

    expect(screen.queryByText('Player lesson-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Player lesson-2')).not.toBeInTheDocument();
  });

  it('renders the data belonging to the current route argument', () => {
    mockUseGetStudentLessonQuery.mockReturnValue({
      data: lesson('lesson-1'),
      currentData: lesson('lesson-2'),
      isLoading: false,
      error: undefined,
    });

    render(<DynamicLessonPage />);

    expect(screen.getByText('Player lesson-2')).toBeInTheDocument();
    expect(screen.queryByText('Player lesson-1')).not.toBeInTheDocument();
  });

  it('keeps sidebar open controls available in the lesson header', () => {
    mockUseGetStudentLessonQuery.mockReturnValue({
      data: lesson('lesson-2'),
      currentData: lesson('lesson-2'),
      isLoading: false,
      error: undefined,
    });

    render(<DynamicLessonPage />);

    expect(screen.getByRole('button', { name: 'Open lessons sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open practice sidebar' })).toBeInTheDocument();
  });
});
