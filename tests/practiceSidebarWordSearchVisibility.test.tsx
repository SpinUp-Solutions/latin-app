import React from 'react';
import { render, screen } from '@testing-library/react';
import PracticeSidebar from '@/src/components/ui/lesson/practice-sidebar';

const mockUseSearchWordsQuery = jest.fn((..._args: unknown[]) => ({
  data: [],
  isFetching: false,
  isError: false,
}));

jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'student-1' } }),
}));

jest.mock('@/src/store/api/lessonApi', () => ({
  useGetStudentDashboardQuery: () => ({
    data: {
      learningPath: [],
      practiceLessons: [],
    },
    isLoading: false,
  }),
}));

jest.mock('@/src/store/api/vocabularyApi', () => ({
  useSearchWordsQuery: (...args: unknown[]) => mockUseSearchWordsQuery(...args),
}));

describe('PracticeSidebar word-search visibility', () => {
  beforeEach(() => {
    mockUseSearchWordsQuery.mockClear();
    sessionStorage.clear();
  });

  it('omits only word search when disabled and does not initialize its search query', () => {
    render(<PracticeSidebar currentLessonId="lesson-1" showWordSearch={false} />);

    expect(screen.getByText('Vocabulary')).toBeInTheDocument();
    expect(screen.getByText('Diagramming')).toBeInTheDocument();
    expect(screen.getByText('Listening')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search Latin words...')).not.toBeInTheDocument();
    expect(mockUseSearchWordsQuery).not.toHaveBeenCalled();
  });

  it('shows word search when enabled', () => {
    render(<PracticeSidebar currentLessonId="lesson-1" showWordSearch />);

    expect(screen.getByPlaceholderText('Search Latin words...')).toBeInTheDocument();
    expect(mockUseSearchWordsQuery).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Practice' })).toBeVisible();
    expect(screen.getByText('Practice', { selector: 'span' })).not.toBeVisible();
  });

  it('renders only the compact practice rail while collapsed', () => {
    render(<PracticeSidebar currentLessonId="lesson-1" showWordSearch isCollapsed />);

    expect(screen.getByText('Practice', { selector: 'span' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Practice', hidden: true })).not.toBeVisible();
    expect(screen.getByPlaceholderText('Search Latin words...')).not.toBeVisible();
    expect(screen.getByText('Vocabulary')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Expand practice sidebar' })).toBeInTheDocument();
  });
});
