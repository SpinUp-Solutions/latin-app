import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import FillExercise from '@/src/components/ui/exercises/fill-exercise';
import OddOneOutExerciseComponent from '@/src/components/ui/exercises/odd-one-out-exercise';
import TableFillExerciseComponent from '@/src/components/ui/exercises/table-fill-exercise';
import type { FillExercise as FillExerciseType, OddOneOutExercise, TableFillExercise } from '@/src/types/exercise';

jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({
  SimpleRichEditor: ({
    content,
    disabled,
    onChange,
  }: {
    content: string;
    disabled?: boolean;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Explanation"
      disabled={disabled}
      value={content}
      onChange={event => onChange(event.target.value)}
    />
  ),
}));

const feedbackConfig = {
  escalationLevels: [],
  progressionRules: {
    autoAdvanceOnCorrect: false,
    pauseForExplanation: true,
    showProgress: true,
  },
};

describe('test-mode incomplete answer guards', () => {
  it('keeps a restored blank fill answer editable instead of committing it', () => {
    const exercise: FillExerciseType = {
      id: 'fill-1',
      type: 'fill',
      instructions: 'Complete the forms',
      feedbackConfig,
      data: {
        items: [
          { text: 'amo', answer: 'amo' },
          { text: 'amas', answer: 'amas' },
        ],
      },
    };

    render(
      <FillExercise
        exercise={exercise}
        initialAnswer={{ type: 'fill', answers: ['', 'already answered'] }}
        runtimeMode="test"
        onAnswer={jest.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Type your answer');
    expect(input).toHaveValue('');
    expect(input).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'amo' } });
    expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled();
  });

  it('only commits a table answer after every required cell is filled', () => {
    const onAnswer = jest.fn();
    const exercise: TableFillExercise = {
      id: 'table-1',
      type: 'table-fill',
      instructions: 'Complete the table',
      feedbackConfig,
      data: {
        columns: [
          { id: 'singular', header: 'Singular' },
          { id: 'plural', header: 'Plural' },
        ],
        rows: [
          {
            id: 'present',
            cells: {
              singular: { content: '', isBlank: true, answer: 'amo' },
              plural: { content: '', isBlank: true, answer: 'amamus' },
            },
          },
        ],
      },
    };

    render(<TableFillExerciseComponent exercise={exercise} runtimeMode="test" onAnswer={onAnswer} />);

    const submit = screen.getByRole('button', { name: 'Submit Answers' });
    const inputs = screen.getAllByRole('textbox');
    expect(submit).toBeDisabled();

    fireEvent.change(inputs[0], { target: { value: 'amo' } });
    expect(submit).toBeDisabled();

    fireEvent.change(inputs[1], { target: { value: 'amamus' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(onAnswer).toHaveBeenCalledWith({
      type: 'table-fill',
      answers: {
        'present-singular': 'amo',
        'present-plural': 'amamus',
      },
    });
  });

  it('requires the odd-one-out explanation before committing', () => {
    const onAnswer = jest.fn();
    const exercise: OddOneOutExercise = {
      id: 'odd-1',
      type: 'odd-one-out',
      instructions: 'Choose and explain',
      feedbackConfig,
      data: {
        question: 'Which word does not belong?',
        items: [
          { id: 'amo', text: 'amo', isOddOneOut: false },
          { id: 'amas', text: 'amas', isOddOneOut: false },
          { id: 'bellum', text: 'bellum', isOddOneOut: true },
        ],
        requireExplanation: true,
        explanation: 'bellum is a noun',
      },
    };

    render(<OddOneOutExerciseComponent exercise={exercise} runtimeMode="test" onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: 'bellum' }));
    const submit = screen.getByRole('button', { name: 'Submit Answer' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Explanation'), {
      target: { value: 'It is the only noun.' },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(onAnswer).toHaveBeenCalledWith({
      type: 'odd-one-out',
      selectedItemId: 'bellum',
      explanation: 'It is the only noun.',
    });
  });
});
