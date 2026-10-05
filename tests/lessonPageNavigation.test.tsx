import React from 'react';
import { render, screen } from '@testing-library/react';
import DynamicLessonPage from '@/src/app/lesson/[lessonId]/page';

const mockPush = jest.fn();
const mockUseGetStudentLessonQuery = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ lessonId: 'lesson-2' }),
  useRouter: () => ({ push: mockPush }),
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

jest.mock('@/src/components/ui/core/feedback-banner', () => ({
  FeedbackBanner: () => null,
}));

jest.mock('@/src/components/student-feedback/FeedbackLessonDialog', () => ({
  FeedbackLessonDialog: () => null,
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

  it.each([
    ['is still loading', undefined],
    ['still reports the previous lesson as current', lesson('lesson-1')],
  ])('does not render the previous lesson while the requested one %s', (_state, currentData) => {
    mockUseGetStudentLessonQuery.mockReturnValue({
      data: lesson('lesson-1'),
      currentData,
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
});
