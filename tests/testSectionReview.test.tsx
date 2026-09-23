import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SectionAnswerReview } from '@/src/components/ui/test/section-answer-review';
import { TEST_ELIGIBLE_EXERCISE_TYPES } from '@/src/lib/content/registry';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { StudentTestDelivery } from '@/src/types/test';

jest.mock('@/src/components/ui/lesson/content-renderer', () => ({
  __esModule: true,
  default: ({ content }: { content: { content: string } }) => <p>{content.content}</p>,
}));
const fixtures = [
  { type: 'fill', data: { items: [{ text: 'First prompt' }, { text: 'Second prompt' }] } },
  {
    type: 'fill-embolded-text',
    data: {
      passage: 'Puella cantat.',
      words: [
        { wordIndex: 0, question: 'Identify puella' },
        { wordIndex: 1, question: 'Identify cantat' },
      ],
    },
  },
  { type: 'generated-translation', data: {}, resolved: [{ text: 'amo' }, { text: 'video' }] },
  { type: 'translation-grading', data: { items: [{ latinText: 'Puella cantat.' }, { latinText: 'Puer currit.' }] } },
  {
    type: 'generated-form-identification',
    data: { mode: 'single-field', showDictionaryEntry: true },
    resolved: [
      {
        id: 'word-1',
        selected_form: 'puella',
        hasSelectedForm: true,
        dictionary_entry: 'puella, puellae',
        steps: ['case', 'number'],
        expectedAnswerCount: 2,
      },
    ],
  },
  {
    type: 'multiple-choice',
    data: {
      question: 'Choose',
      options: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Beta' },
      ],
      allowMultipleSelections: true,
    },
  },
  {
    type: 'odd-one-out',
    data: {
      question: 'Pick one',
      items: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Beta' },
      ],
      requireExplanation: true,
    },
  },
  {
    type: 'matching',
    data: {
      leftColumn: [
        { id: 'l1', value: 'amo' },
        { id: 'l2', value: 'video' },
      ],
      rightColumn: [
        { id: 'r1', value: 'love' },
        { id: 'r2', value: 'see' },
      ],
      requiredRepetitions: 2,
    },
  },
  {
    type: 'table-fill',
    data: {
      columns: [{ id: 'column', header: 'Meaning' }],
      rows: [
        { id: 'row-1', cells: { column: { isBlank: true } } },
        { id: 'row-2', cells: { column: { isBlank: true } } },
      ],
      footnotes: ['Keep the row order.'],
    },
  },
  {
    type: 'text-selection',
    data: {
      passage: 'Puella cantat',
      questions: [
        { id: 'q1', text: 'Select the noun' },
        { id: 'q2', text: 'Select the verb' },
      ],
    },
  },
  { type: 'click-on-multiple-words', data: { passage: 'Puella cantat' } },
  {
    type: 'sentence-diagramming',
    data: {
      latin: 'Puella cantat',
      translation: '',
      tokens: [
        { id: 't1', index: 0, text: 'Puella' },
        { id: 't2', index: 1, text: 'cantat' },
      ],
      availableStudentTools: ['nominative'],
      difficulty: 'beginner',
    },
  },
];
const delivery = (type: string): StudentTestDelivery => {
  const fixture = fixtures.find(item => item.type === type)!;
  return {
    versionId: 'v1',
    pages: [
      {
        id: 'page-1',
        title: 'Current section',
        items: [
          { id: 'supporting', type: 'text', content: 'Supporting passage' },
          {
            id: 'exercise',
            ...fixture,
            title: `Review ${type}`,
            instructions: 'Read carefully',
            maxPoints: 10,
            feedbackConfig: { escalationLevels: [] },
          },
        ],
      },
    ],
    resolvedExercises: { exercise: { items: fixture.resolved ?? [] } },
  } as unknown as StudentTestDelivery;
};
function Review({
  type,
  initial = {},
  disabled = false,
  changed = jest.fn(),
}: {
  type: string;
  initial?: Record<string, ExerciseAnswer>;
  disabled?: boolean;
  changed?: jest.Mock;
}) {
  const [answers, setAnswers] = useState(initial);
  return (
    <SectionAnswerReview
      delivery={delivery(type)}
      answers={answers}
      disabled={disabled}
      onAnswer={event => {
        changed(event);
        setAnswers(current => ({ ...current, [event.exerciseId]: event.answer }));
      }}
    />
  );
}

describe('student-answer-only section review', () => {
  it('covers every registered eligible exercise', () => {
    expect(fixtures.map(f => f.type).sort()).toEqual([...TEST_ELIGIBLE_EXERCISE_TYPES].sort());
  });
  it.each(fixtures.map(f => f.type))('renders %s with context and missing-answer status', type => {
    render(<Review type={type} />);
    expect(screen.getByText('Supporting passage')).toBeVisible();
    expect(screen.getAllByText(`Review ${type}`)[0]).toBeVisible();
    expect(screen.getByText('This exercise has unanswered parts.')).toBeVisible();
    expect(screen.queryByText(/correct answer|accepted answer|score|feedback/i)).not.toBeInTheDocument();
  });
  it.each(['fill', 'fill-embolded-text', 'generated-translation', 'translation-grading'])(
    'edits one %s field without clearing another',
    type => {
      const initial =
        type === 'translation-grading'
          ? { type, translations: ['first', 'second'] }
          : { type, answers: ['first', 'second'] };
      const changed = jest.fn();
      render(<Review type={type} initial={{ exercise: initial as ExerciseAnswer }} changed={changed} />);
      fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'revised' } });
      expect(screen.getAllByRole('textbox')[0]).toHaveValue('first');
      expect(changed).toHaveBeenLastCalledWith({
        exerciseId: 'exercise',
        answer:
          type === 'translation-grading'
            ? { type, translations: ['first', 'revised'] }
            : { type, answers: ['first', 'revised'] },
      });
    }
  );
  it('preserves table cell IDs and unrelated cells', () => {
    const changed = jest.fn();
    render(
      <Review
        type="table-fill"
        initial={{ exercise: { type: 'table-fill', answers: { 'row-1-column': 'love', 'row-2-column': 'see' } } }}
        changed={changed}
      />
    );
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '' } });
    expect(changed).toHaveBeenLastCalledWith({
      exerciseId: 'exercise',
      answer: { type: 'table-fill', answers: { 'row-1-column': 'love', 'row-2-column': '' } },
    });
    expect(screen.getByText('This exercise has unanswered parts.')).toBeVisible();
  });
  it('preserves other matching rounds and prevents duplicate right selections', () => {
    const changed = jest.fn();
    render(
      <Review
        type="matching"
        initial={{ exercise: { type: 'matching', rounds: [{ l1: 'r1', l2: 'r2' }, { l1: 'r1' }] } }}
        changed={changed}
      />
    );
    fireEvent.change(screen.getByLabelText('Round 2: video'), { target: { value: 'r2' } });
    expect(changed).toHaveBeenLastCalledWith({
      exerciseId: 'exercise',
      answer: {
        type: 'matching',
        rounds: [
          { l1: 'r1', l2: 'r2' },
          { l1: 'r1', l2: 'r2' },
        ],
      },
    });
  });
  it('edits a selection using keyboard-accessible buttons without losing another question', () => {
    const changed = jest.fn();
    render(
      <Review
        type="text-selection"
        initial={{ exercise: { type: 'text-selection', selectedWordIndices: [0, 1] } }}
        changed={changed}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'cantat' })[0]);
    expect(changed).toHaveBeenLastCalledWith({
      exerciseId: 'exercise',
      answer: { type: 'text-selection', selectedWordIndices: [1, 1] },
    });
  });
  it('disables editing during confirmation', () => {
    render(<Review type="fill" disabled />);
    screen.getAllByRole('textbox').forEach(input => expect(input).toBeDisabled());
  });
  it('restores diagram annotations in an editable surface without revealing comparison results', () => {
    render(
      <Review
        type="sentence-diagramming"
        initial={{
          exercise: {
            type: 'sentence-diagramming',
            annotations: [
              {
                id: 'canonical-annotation',
                kind: 'nominative',
                span: { startTokenIndex: 0, endTokenIndex: 0, startCharOffset: 0, endCharOffset: 6 },
              },
            ],
          },
        }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reset$/ })).toBeEnabled();
    expect(screen.queryByText(/correct|feedback/i)).not.toBeInTheDocument();
  });
});
