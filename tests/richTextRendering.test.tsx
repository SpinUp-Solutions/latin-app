import React from 'react';
import { render, screen } from '@testing-library/react';
import { SortableLessonItem } from '@/src/components/admin/SortableLessonItem';
import { SentenceDiagramStudent } from '@/src/features/sentence-diagramming/SentenceDiagramStudent';
import { createEmptySentenceDiagramDocument } from '@/src/features/sentence-diagramming/model';
import type { LessonSummary } from '@/src/types/lesson';
import type { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';
import {
  ClickOnMultipleWordsExerciseReview,
  TableFillExerciseReview,
  TextSelectionExerciseReview,
} from '@/src/components/ui/test-results/exercise-review-views';
import { splitHtmlIntoWords } from '@/src/utils/htmlWordSplitter';

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

  it('keeps formatting attached when rich passages are split into selectable words', () => {
    expect(splitHtmlIntoWords('amo <strong>puellam</strong> videt')).toEqual([
      'amo',
      '<strong>puellam</strong>',
      'videt',
    ]);
  });

  it('renders rich text for text-selection review answers', () => {
    const item = {
      id: 'text-selection-1',
      type: 'text-selection',
      title: 'Select the word',
      question: {
        passage: 'amo <strong>puellam</strong> videt',
        questions: [{ id: 'question-1', text: 'Who is seen?' }],
      },
      answerKey: {
        questions: [{ id: 'question-1', text: 'Who is seen?', correctWordIndex: 1 }],
      },
      itemResults: {
        selections: [
          { questionId: 'question-1', wordIndex: 1, correct: true, points: { awardedPoints: 1, maxPoints: 1 } },
        ],
      },
    } as never;

    const { container } = render(<TextSelectionExerciseReview item={item} />);

    expect(container.querySelector('strong')).toHaveTextContent('puellam');
  });

  it('renders rich text for click-multiple-words passages and metadata', () => {
    const item = {
      id: 'click-1',
      type: 'click-on-multiple-words',
      title: 'Click the word',
      question: {
        title: '<p><em>Verb passage</em></p>',
        instructions: '<p>Click the <strong>verb</strong>.</p>',
        passage: 'amo <strong>et</strong> ambulo',
      },
      answerKey: { correctWordIndices: [0] },
      itemResults: { selectedWordIndices: [0], correct: true, points: { awardedPoints: 1, maxPoints: 1 } },
    } as never;

    const { container } = render(<ClickOnMultipleWordsExerciseReview item={item} />);

    expect(container.querySelector('em')).toHaveTextContent('Verb passage');
    expect(Array.from(container.querySelectorAll('strong')).map(element => element.textContent)).toEqual(
      expect.arrayContaining(['verb', 'et'])
    );
  });

  it('renders rich table titles, headers, and footnotes in review', () => {
    const item = {
      id: 'table-1',
      type: 'table-fill',
      title: 'Complete the table',
      question: {
        title: '<p><strong>Conjugation</strong></p>',
        columns: [{ id: 'latin', header: '<em>Latin</em>' }],
        rows: [{ id: 'row-1', cells: { latin: { content: '<strong>amo</strong>', isBlank: false } } }],
        footnotes: ['Note: <strong>present tense</strong>'],
      },
      answerKey: {
        rows: [{ id: 'row-1', cells: { latin: { content: '<strong>amo</strong>', isBlank: false } } }],
      },
      itemResults: { cells: [] },
    } as never;

    const { container } = render(<TableFillExerciseReview item={item} />);

    expect(container.querySelector('strong')).toHaveTextContent('Conjugation');
    expect(container.querySelector('em')).toHaveTextContent('Latin');
    expect(Array.from(container.querySelectorAll('strong')).map(element => element.textContent)).toEqual(
      expect.arrayContaining(['Conjugation', 'amo', 'present tense'])
    );
  });
});
