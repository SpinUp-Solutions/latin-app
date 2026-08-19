import React from 'react';
import { render, screen } from '@testing-library/react';
import { SortableLessonItem } from '@/src/components/admin/SortableLessonItem';
import { SentenceDiagramStudent } from '@/src/features/sentence-diagramming/SentenceDiagramStudent';
import { createEmptySentenceDiagramDocument } from '@/src/features/sentence-diagramming/model';
import type { LessonSummary } from '@/src/types/lesson';
import type { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';

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

describe('rich-text display regressions', () => {
  it('renders a sentence-diagramming title as rich text', () => {
    const exercise: SentenceDiagrammingExercise = {
      id: 'diagram-1',
      type: 'sentence-diagramming',
      title: '<p>Cicero, In Catilinam I, 1.2</p>',
      instructions: '',
      feedbackConfig: {
        escalationLevels: [],
      },
      data: createEmptySentenceDiagramDocument('Marcus puellam videt', ''),
    };

    render(<SentenceDiagramStudent exercise={exercise} />);

    expect(screen.getByRole('heading', { name: 'Cicero, In Catilinam I, 1.2' })).toBeInTheDocument();
  });

  it('renders live lesson titles and descriptions as rich text', () => {
    const lesson: LessonSummary = {
      id: 'lesson-1',
      title: '<p>Sentence Diagramming</p>',
      description: '<p>Practice <strong>Latin</strong> sentences.</p>',
      type: 'sentence-diagramming',
      isLive: true,
      liveOrder: 0,
      publishedAt: null,
      publishedBy: null,
      totalPages: 1,
      totalItems: 1,
      totalExercises: 1,
    };

    render(<SortableLessonItem id={lesson.id} lesson={lesson} />);

    expect(screen.getByRole('heading', { name: 'Sentence Diagramming' })).toBeInTheDocument();
    expect(screen.getByText('Latin').tagName).toBe('STRONG');
  });
});
