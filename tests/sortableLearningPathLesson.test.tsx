import { render, screen } from '@testing-library/react';
import { SortableLearningPathLesson } from '@/src/components/admin/SortableLearningPathLesson';
import type { LessonSummary } from '@/src/types/lesson';

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

const lesson: LessonSummary = {
  id: 'lesson-1',
  kind: 'lesson',
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
};

describe('SortableLearningPathLesson', () => {
  it('renders a warning and links directly to the lesson editor', () => {
    const message = 'Page 2 has a duplicate ID.';

    render(
      <SortableLearningPathLesson
        unit={lesson}
        index={0}
        disabled={false}
        onRemove={jest.fn()}
        issues={[{ code: 'INCOMPLETE_LESSON', message }]}
      />
    );

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fix lesson' })).toHaveAttribute('href', '/admin/lessons/edit/lesson-1');
  });

  it('keeps the kind badge on the same centered row as Edit', () => {
    render(<SortableLearningPathLesson unit={lesson} index={0} disabled={false} onRemove={jest.fn()} />);

    const edit = screen.getByRole('link', { name: 'Edit' });
    const actions = edit.parentElement;
    expect(actions).toHaveClass('items-center');
    expect(actions).toContainElement(screen.getByText('Lesson'));
  });
});
