import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LiveLessonsPage from '@/src/app/admin/lessons/live/page';
import type { AdminLearningPathView } from '@/src/types/learning-unit';
import type { LessonSummary } from '@/src/types/lesson';
import type { TestUnitSummary } from '@/src/types/test';

const mockUseGetLessonsQuery = jest.fn();
const mockUseGetLearningPathQuery = jest.fn();
const mockSaveLearningPath = jest.fn();
const mockUpdatePublishStatus = jest.fn();
const mockReorderLessons = jest.fn();
const mockUseGetTestsQuery = jest.fn();

jest.mock('@/src/store/api/lessonApi', () => ({
  useGetLessonsQuery: () => mockUseGetLessonsQuery(),
  useGetLearningPathQuery: () => mockUseGetLearningPathQuery(),
  useSaveLearningPathMutation: () => [mockSaveLearningPath, { isLoading: false }],
  useUpdateLessonsPublishStatusMutation: () => [mockUpdatePublishStatus],
  useReorderLessonsMutation: () => [mockReorderLessons],
}));

jest.mock('@/src/store/api/testApi', () => ({
  useGetTestsQuery: () => mockUseGetTestsQuery(),
}));

jest.mock('@/src/components/auth/withAdminAuth', () => ({
  withAdminAuth: (Component: unknown) => Component,
}));

jest.mock('@/src/components/ui/tabs', () => ({
  Tabs: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange?: (value: string) => void;
  }) => (
    <div>
      <button onClick={() => onValueChange?.('vocab')}>Switch to vocab</button>
      {React.Children.toArray(children).filter(child => {
        if (!React.isValidElement<{ value?: string }>(child)) return true;
        return child.props.value === undefined || child.props.value === value;
      })}
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
  arrayMove: (items: string[], from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
}));

jest.mock('@/src/components/admin/SortableLessonItem', () => ({
  SortableLessonItem: ({ lesson, onNavigate }: { lesson: LessonSummary; onNavigate?: (href: string) => void }) => (
    <div>
      {lesson.title}
      <button onClick={() => onNavigate?.(`/admin/lessons/edit/${lesson.id}`)}>Edit {lesson.title}</button>
    </div>
  ),
}));

jest.mock('@/src/components/admin/SortableLearningPathLesson', () => ({
  SortableLearningPathLesson: ({
    unit,
    onRemove,
    disabled,
  }: {
    unit: LessonSummary | TestUnitSummary;
    onRemove: () => void;
    disabled: boolean;
  }) => (
    <div>
      <span>{unit.title}</span>
      <button onClick={onRemove} disabled={disabled} aria-label={`Remove ${unit.title} from Learning Path`}>
        Remove
      </button>
    </div>
  ),
}));

const lesson = (overrides: Partial<LessonSummary> = {}): LessonSummary => ({
  id: 'lesson-1',
  title: 'Lesson one',
  description: '',
  type: 'normal',
  isLive: true,
  liveOrder: 0,
  publishedAt: null,
  publishedBy: null,
  totalPages: 1,
  totalItems: 1,
  totalExercises: 1,
  ...overrides,
});

const retiredPathView = (overrides: Partial<AdminLearningPathView> = {}): AdminLearningPathView => ({
  path: {
    id: 'default',
    revision: 3,
    unitIds: ['lesson-1'],
    updatedAt: '2026-07-23T00:00:00.000Z',
    updatedBy: 'admin',
  },
  effectiveUnitIds: ['lesson-1'],
  source: 'learning-path',
  canEdit: true,
  ...overrides,
});

const testSummary = (overrides: Partial<TestUnitSummary> = {}): TestUnitSummary => ({
  id: 'test-1',
  kind: 'test',
  title: 'Chapter test',
  description: '',
  passingPercentage: 70,
  rotationVersionCount: 2,
  minTotalPoints: 10,
  maxTotalPoints: 12,
  ...overrides,
});

describe('Learning delivery organizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetLessonsQuery.mockReturnValue({
      data: [lesson(), lesson({ id: 'lesson-2', title: 'Lesson two', isLive: false, liveOrder: null })],
      isLoading: false,
      refetch: jest.fn(),
    });
    mockUseGetLearningPathQuery.mockReturnValue({
      data: retiredPathView(),
      isLoading: false,
      refetch: jest.fn(),
    });
    mockUseGetTestsQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the legacy normal sequence read-only before migration initialization', () => {
    mockUseGetLearningPathQuery.mockReturnValue({
      data: {
        path: null,
        effectiveUnitIds: ['lesson-1'],
        source: 'legacy',
        canEdit: false,
        editBlockedReason: 'Complete the migration workflow first.',
      } satisfies AdminLearningPathView,
      isLoading: false,
      refetch: jest.fn(),
    });

    render(<LiveLessonsPage />);

    expect(screen.getByText('Legacy source preview')).toBeInTheDocument();
    expect(screen.getByText('Complete the migration workflow first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Lesson one from Learning Path' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Lesson two to Learning Path' })).toBeDisabled();
  });

  it('saves the complete local Learning Path draft with its base revision', async () => {
    mockSaveLearningPath.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        path: {
          ...retiredPathView().path,
          revision: 4,
          unitIds: ['lesson-1', 'lesson-2'],
        },
      }),
    });

    render(<LiveLessonsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Lesson two to Learning Path' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Learning Path' }));

    await waitFor(() =>
      expect(mockSaveLearningPath).toHaveBeenCalledWith({
        expectedRevision: 3,
        unitIds: ['lesson-1', 'lesson-2'],
      })
    );
  });

  it('inserts an eligible test at an exact position and saves the mixed sequence', async () => {
    mockUseGetTestsQuery.mockReturnValue({
      data: [testSummary()],
      isLoading: false,
    });
    mockSaveLearningPath.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        path: {
          ...retiredPathView().path,
          revision: 4,
          unitIds: ['test-1', 'lesson-1'],
        },
      }),
    });
    render(<LiveLessonsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Insert a test at position 1' }));
    expect(screen.getByText(/Pass ≥ 70%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Learning Path' }));

    await waitFor(() =>
      expect(mockSaveLearningPath).toHaveBeenCalledWith({
        expectedRevision: 3,
        unitIds: ['test-1', 'lesson-1'],
      })
    );
  });

  it('protects a dirty Learning Path draft from links, history navigation, and unload', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const pushState = jest.spyOn(window.history, 'pushState');
    render(<LiveLessonsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Lesson two to Learning Path' }));

    expect(fireEvent.click(screen.getByRole('link', { name: 'Back to Admin' }))).toBe(false);
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    expect(fireEvent(window, beforeUnload)).toBe(false);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.popState(window);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(pushState).toHaveBeenCalledWith(null, '', window.location.href);
  });

  it('protects a dirty Learning Path draft from practice-row edit navigation', () => {
    mockUseGetLessonsQuery.mockReturnValue({
      data: [
        lesson(),
        lesson({ id: 'lesson-2', title: 'Lesson two', isLive: false, liveOrder: null }),
        lesson({ id: 'vocab-live', title: 'Vocab live', type: 'vocab' }),
      ],
      isLoading: false,
      refetch: jest.fn(),
    });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false);
    render(<LiveLessonsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Lesson two to Learning Path' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to vocab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Vocab live' }));

    expect(confirm).toHaveBeenCalledWith('You have unsaved Learning Path changes. Leave this page and discard them?');
  });

  it('requires confirmation before switching context with a dirty path draft', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LiveLessonsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Lesson two to Learning Path' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to vocab' }));

    expect(confirm).toHaveBeenCalledWith(
      'You have unsaved Learning Path changes. Switch sections without saving them first?'
    );
    expect(screen.getByText('Learning Path')).toBeInTheDocument();
  });

  it('lets an admin remove and save a dangling Learning Path reference', async () => {
    mockUseGetLearningPathQuery.mockReturnValue({
      data: retiredPathView({
        path: {
          ...retiredPathView().path!,
          unitIds: ['missing-unit', 'lesson-1'],
        },
        effectiveUnitIds: ['missing-unit', 'lesson-1'],
      }),
      isLoading: false,
      refetch: jest.fn(),
    });
    mockSaveLearningPath.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        path: {
          ...retiredPathView().path,
          revision: 4,
          unitIds: ['lesson-1'],
        },
      }),
    });
    render(<LiveLessonsPage />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove missing unit missing-unit from Learning Path',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Learning Path' }));

    await waitFor(() =>
      expect(mockSaveLearningPath).toHaveBeenCalledWith({
        expectedRevision: 3,
        unitIds: ['lesson-1'],
      })
    );
  });

  it('keeps normal placement out of the practice publication mutation', async () => {
    const vocabLive = lesson({ id: 'vocab-live', title: 'Vocab live', type: 'vocab' });
    const vocabDraft = lesson({
      id: 'vocab-draft',
      title: 'Vocab draft',
      type: 'vocab',
      isLive: false,
      liveOrder: null,
    });
    const refetch = jest.fn().mockResolvedValue({ data: [vocabLive, { ...vocabDraft, isLive: true }] });
    mockUseGetLessonsQuery.mockReturnValue({
      data: [lesson(), vocabLive, vocabDraft],
      isLoading: false,
      refetch,
    });
    mockUpdatePublishStatus.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({ success: true }),
    });

    render(<LiveLessonsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to vocab' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    const checkboxes = await screen.findAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Publication Changes' }));

    await waitFor(() =>
      expect(mockUpdatePublishStatus).toHaveBeenCalledWith({
        lessonIds: ['vocab-draft'],
        isLive: true,
        lessonType: 'vocab',
        expectedLiveLessonIds: ['vocab-live'],
      })
    );
    expect(mockSaveLearningPath).not.toHaveBeenCalled();
  });

  it('preserves a stale proposal and explicitly merges concurrent membership changes', async () => {
    mockUseGetLessonsQuery.mockReturnValue({
      data: [
        lesson(),
        lesson({ id: 'lesson-2', title: 'Lesson two', isLive: false, liveOrder: null }),
        lesson({ id: 'lesson-3', title: 'Lesson three', isLive: false, liveOrder: null }),
      ],
      isLoading: false,
      refetch: jest.fn(),
    });
    const refetchPath = jest.fn().mockResolvedValue({
      data: retiredPathView({
        path: {
          ...retiredPathView().path!,
          revision: 4,
          unitIds: ['lesson-3', 'lesson-1'],
        },
        effectiveUnitIds: ['lesson-3', 'lesson-1'],
      }),
    });
    mockUseGetLearningPathQuery.mockReturnValue({
      data: retiredPathView(),
      isLoading: false,
      refetch: refetchPath,
    });
    mockSaveLearningPath
      .mockReturnValueOnce({
        unwrap: jest.fn().mockRejectedValue({
          status: 409,
          data: { code: 'STALE_LEARNING_PATH_REVISION' },
        }),
      })
      .mockReturnValueOnce({
        unwrap: jest.fn().mockResolvedValue({
          path: {
            ...retiredPathView().path,
            revision: 5,
            unitIds: ['lesson-1', 'lesson-2'],
          },
        }),
      });

    render(<LiveLessonsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Lesson two to Learning Path' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Learning Path' }));

    expect(await screen.findByText('A newer canonical Learning Path is available.')).toBeInTheDocument();
    expect(screen.getAllByText('Lesson one').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lesson two').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lesson three').length).toBeGreaterThan(0);
    expect(screen.getByText(/added in the canonical path/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply conflict resolutions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Learning Path' }));

    await waitFor(() =>
      expect(mockSaveLearningPath).toHaveBeenLastCalledWith({
        expectedRevision: 4,
        unitIds: ['lesson-3', 'lesson-1', 'lesson-2'],
      })
    );
  });

  it('prevents removing the final live practice lesson', async () => {
    mockUseGetLessonsQuery.mockReturnValue({
      data: [lesson({ id: 'vocab-live', title: 'Vocab live', type: 'vocab' })],
      isLoading: false,
      refetch: jest.fn(),
    });

    render(<LiveLessonsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to vocab' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(await screen.findByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Apply Publication Changes' })).toBeDisabled();
    expect(mockUpdatePublishStatus).not.toHaveBeenCalled();
  });
});
