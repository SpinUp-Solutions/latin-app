import React, { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LessonLayout from '@/src/app/lesson/layout';
import DynamicLessonPage from '@/src/app/lesson/[lessonId]/page';

let mockLessonId = 'lesson-1';
let mockAuth: { user: { uid: string } | null; loading: boolean } = { user: { uid: 'student-1' }, loading: false };
const mockPush = jest.fn();
const mockUseGetStudentLessonQuery = jest.fn();
const mockSidebarMounts = jest.fn();
const mockPracticeSidebarProps = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ lessonId: mockLessonId }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
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
  default: function Sidebar({
    currentLessonId,
    isCollapsed,
    onNavigate,
  }: {
    currentLessonId: string;
    isCollapsed: boolean;
    onNavigate: () => void;
  }) {
    useEffect(() => {
      mockSidebarMounts();
    }, []);
    return (
      <aside>
        Lesson sidebar for {currentLessonId} {isCollapsed ? 'collapsed' : 'open'}
        <button type="button" onClick={onNavigate}>
          Pick a lesson
        </button>
      </aside>
    );
  },
}));

jest.mock('@/src/components/ui/lesson/practice-sidebar', () => ({
  __esModule: true,
  default: (props: { showWordSearch: boolean }) => {
    mockPracticeSidebarProps(props);
    return <aside>Practice sidebar</aside>;
  },
}));

jest.mock('@/src/components/student-feedback/FeedbackLessonDialog', () => ({
  FeedbackLessonDialog: () => null,
}));

const lesson = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  type: 'normal',
  pages: [{ id: `${id}-page-1`, items: [] }],
  ...extra,
});

const loaded = (id: string, extra?: Record<string, unknown>) => ({
  data: lesson(id, extra),
  currentData: lesson(id, extra),
  isLoading: false,
  isFetching: false,
  error: undefined,
});

// What RTK Query returns right after the route argument changes: `data` still
// holds the previous lesson and `currentData` is empty.
const loadingAfter = (previousId: string, extra?: Record<string, unknown>) => ({
  data: lesson(previousId, extra),
  currentData: undefined,
  isLoading: false,
  isFetching: true,
  error: undefined,
});

const route = () => (
  <LessonLayout>
    <DynamicLessonPage />
  </LessonLayout>
);

const setNarrowViewport = (narrow: boolean) => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: narrow }) as unknown as typeof window.matchMedia;
};

describe('lesson shell', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockLessonId = 'lesson-1';
    mockAuth = { user: { uid: 'student-1' }, loading: false };
    setNarrowViewport(false);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('keeps the header and sidebars mounted while another lesson loads', () => {
    mockUseGetStudentLessonQuery.mockReturnValue(loaded('lesson-1'));
    const view = render(route());
    expect(screen.getByText('Player lesson-1')).toBeInTheDocument();

    mockLessonId = 'lesson-2';
    mockUseGetStudentLessonQuery.mockReturnValue(loadingAfter('lesson-1'));
    view.rerender(route());

    expect(screen.getByRole('status')).toHaveTextContent('Loading lesson');
    expect(screen.queryByText('Player lesson-1')).not.toBeInTheDocument();
    expect(screen.getByText(/Lesson sidebar for lesson-2 open/)).toBeInTheDocument();
    expect(screen.getByText('Practice sidebar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toBeInTheDocument();

    mockUseGetStudentLessonQuery.mockReturnValue(loaded('lesson-2'));
    view.rerender(route());

    expect(screen.getByText('Player lesson-2')).toBeInTheDocument();
    expect(mockSidebarMounts).toHaveBeenCalledTimes(1);
  });

  it('keeps the sidebars on screen when the requested lesson is locked', () => {
    mockUseGetStudentLessonQuery.mockReturnValue({
      data: undefined,
      currentData: undefined,
      isLoading: false,
      isFetching: false,
      error: { status: 403, data: { code: 'LESSON_LOCKED' } },
    });

    render(route());

    expect(screen.getByRole('heading', { name: 'Lesson Locked' })).toBeInTheDocument();
    expect(screen.getByText(/Lesson sidebar for lesson-1 open/)).toBeInTheDocument();
  });

  it('holds the previous word search setting until the next lesson has loaded', () => {
    mockUseGetStudentLessonQuery.mockReturnValue(loaded('lesson-1', { showWordSearch: false }));
    const view = render(route());

    mockLessonId = 'lesson-2';
    mockUseGetStudentLessonQuery.mockReturnValue(loadingAfter('lesson-1', { showWordSearch: false }));
    view.rerender(route());
    expect(mockPracticeSidebarProps).toHaveBeenLastCalledWith(expect.objectContaining({ showWordSearch: false }));

    mockUseGetStudentLessonQuery.mockReturnValue(loaded('lesson-2'));
    view.rerender(route());
    expect(mockPracticeSidebarProps).toHaveBeenLastCalledWith(expect.objectContaining({ showWordSearch: true }));
  });

  it('closes an open sidebar overlay on a narrow screen once a lesson is picked', () => {
    setNarrowViewport(true);
    mockUseGetStudentLessonQuery.mockReturnValue(loaded('lesson-1'));
    render(route());
    expect(screen.getByText(/Lesson sidebar for lesson-1 collapsed/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open lessons sidebar' }));
    expect(screen.getByText(/Lesson sidebar for lesson-1 open/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pick a lesson' }));
    expect(screen.getByText(/Lesson sidebar for lesson-1 collapsed/)).toBeInTheDocument();
  });

  it('leaves a desktop sidebar open when a lesson is picked', () => {
    mockUseGetStudentLessonQuery.mockReturnValue(loaded('lesson-1'));
    render(route());

    fireEvent.click(screen.getByRole('button', { name: 'Pick a lesson' }));
    expect(screen.getByText(/Lesson sidebar for lesson-1 open/)).toBeInTheDocument();
  });

  it('sends a signed-out visitor to login without rendering the lesson', () => {
    mockAuth = { user: null, loading: false };
    mockUseGetStudentLessonQuery.mockReturnValue({ data: undefined, currentData: undefined, isLoading: false });

    render(route());

    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(screen.queryByText(/Lesson sidebar/)).not.toBeInTheDocument();
  });
});
