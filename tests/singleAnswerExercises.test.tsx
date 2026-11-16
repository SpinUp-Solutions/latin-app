import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TableFillExercise from '@/src/components/ui/exercises/table-fill-exercise';
import ClickOnMultipleWords from '@/src/components/ui/exercises/click-on-multiple-words';
import OddOneOutExercise from '@/src/components/ui/exercises/odd-one-out-exercise';
import type {
  ClickOnMultipleWordsExercise,
  OddOneOutExercise as OddOneOutExerciseType,
  TableFillExercise as TableFillExerciseType,
} from '@/src/types/exercise';

jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));

const feedbackConfig = {
  successMessage: { default: 'Correct!', completion: 'Exercise complete', showExplanation: true },
  escalationLevels: [{ message: 'Not quite', showAnswer: false }],
  progressionRules: { autoAdvanceOnCorrect: false, pauseForExplanation: true, showProgress: true },
};

const tableFill: TableFillExerciseType = {
  id: 'table',
  type: 'table-fill',
  title: 'Table',
  instructions: '',
  feedbackConfig,
  data: {
    columns: [
      { id: 'latin', header: 'Latin' },
      { id: 'english', header: 'English' },
    ],
    rows: [
      {
        id: 'row',
        cells: {
          latin: { content: 'aqua', isBlank: false },
          english: { content: '', isBlank: true, answer: 'water' },
        },
      },
    ],
  },
};

const clickWords: ClickOnMultipleWordsExercise = {
  id: 'click',
  type: 'click-on-multiple-words',
  title: 'Click',
  instructions: '',
  feedbackConfig,
  data: { passage: 'arma virumque cano', correctWordIndices: [1] },
};

const oddOneOut: OddOneOutExerciseType = {
  id: 'odd',
  type: 'odd-one-out',
  title: 'Odd',
  instructions: '',
  feedbackConfig,
  data: {
    question: 'Which does not belong?',
    items: [
      { id: 'a', text: 'rosa', isOddOneOut: false },
      { id: 'b', text: 'amo', isOddOneOut: true },
    ],
  },
};

function expectCompletion(onComplete: jest.Mock, onCompletionAccepted: jest.Mock) {
  expect(screen.getByText('Exercise complete')).toBeInTheDocument();
  expect(onCompletionAccepted).toHaveBeenCalledWith(100);
  expect(onComplete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  expect(onComplete).toHaveBeenCalledWith(100);
}

describe('single-answer exercises in practice', () => {
  it('lets table fill retry a wrong answer and completes on the right one', () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    render(
      <TableFillExercise exercise={tableFill} onComplete={onComplete} onCompletionAccepted={onCompletionAccepted} />
    );
    const cell = () => screen.getByPlaceholderText('Enter answer...');

    fireEvent.change(cell(), { target: { value: 'fire' } });
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }));
    expect(screen.getByText('Not quite')).toBeInTheDocument();
    expect(onCompletionAccepted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(cell()).toHaveValue('');
    expect(screen.queryByText('Not quite')).not.toBeInTheDocument();

    fireEvent.change(cell(), { target: { value: 'water' } });
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }));
    expectCompletion(onComplete, onCompletionAccepted);
  });

  describe('table fill with several blanks', () => {
    const chart = (showAnswer: boolean): TableFillExerciseType => ({
      ...tableFill,
      feedbackConfig: { ...feedbackConfig, escalationLevels: [{ message: 'Not quite', showAnswer }] },
      data: {
        columns: tableFill.data.columns,
        rows: [
          tableFill.data.rows[0],
          {
            id: 'row2',
            cells: {
              latin: { content: 'ignis', isBlank: false },
              english: { content: '', isBlank: true, answer: 'fire' },
            },
          },
        ],
      },
    });
    const cells = () => screen.getAllByRole('textbox');
    const submitOneRightOneWrong = () => {
      fireEvent.change(cells()[0], { target: { value: 'water' } });
      fireEvent.change(cells()[1], { target: { value: 'smoke' } });
      fireEvent.click(screen.getByRole('button', { name: /submit answers/i }));
    };

    it('marks each graded cell in words, not only by colour', () => {
      render(<TableFillExercise exercise={chart(false)} />);
      submitOneRightOneWrong();

      expect(screen.getAllByText('Correct')).toHaveLength(1);
      expect(screen.getAllByText('Incorrect')).toHaveLength(1);
      expect(cells()[0]).not.toHaveAttribute('aria-invalid');
      expect(cells()[1]).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('status')).toHaveTextContent('1 of 2 correct.');
    });

    it('names each blank by its row and column', () => {
      render(<TableFillExercise exercise={chart(false)} />);

      expect(screen.getByRole('textbox', { name: 'aqua, English' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'ignis, English' })).toBeInTheDocument();
    });

    it('keeps the answers hidden when the feedback level does not show them', () => {
      render(<TableFillExercise exercise={chart(false)} />);
      submitOneRightOneWrong();

      expect(screen.queryByText(/correct answer:/i)).not.toBeInTheDocument();
    });

    it('shows the correct answer for each missed cell when the feedback level shows answers', () => {
      render(<TableFillExercise exercise={chart(true)} />);
      submitOneRightOneWrong();

      const revealed = screen.getAllByText(/correct answer:/i);
      expect(revealed).toHaveLength(1);
      expect(revealed[0].parentElement).toHaveTextContent('Correct answer: fire');
      expect(screen.getByRole('status')).toHaveTextContent(/shows the correct answer beneath it/i);
    });

    it('keeps the right cells, locked and still marked, and the revealed answers on Try Again', () => {
      const onComplete = jest.fn();
      const onCompletionAccepted = jest.fn();
      render(
        <TableFillExercise exercise={chart(true)} onComplete={onComplete} onCompletionAccepted={onCompletionAccepted} />
      );
      submitOneRightOneWrong();

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      expect(cells()[0]).toHaveValue('water');
      expect(cells()[0]).toHaveAttribute('readonly');
      expect(screen.getAllByText('Correct')).toHaveLength(1);
      expect(cells()[1]).toHaveValue('');
      expect(cells()[1]).not.toHaveAttribute('readonly');
      expect(screen.getByText(/correct answer:/i).parentElement).toHaveTextContent('Correct answer: fire');
      expect(screen.queryByText('Incorrect')).not.toBeInTheDocument();

      fireEvent.change(cells()[0], { target: { value: 'changed' } });
      expect(cells()[0]).toHaveValue('water');

      fireEvent.change(cells()[1], { target: { value: 'fire' } });
      fireEvent.click(screen.getByRole('button', { name: /submit answers/i }));
      expect(screen.queryByText(/correct answer:/i)).not.toBeInTheDocument();
      expectCompletion(onComplete, onCompletionAccepted);
    });
  });

  it('lets click-on-words retry a wrong selection and completes on the right one', () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    render(
      <ClickOnMultipleWords exercise={clickWords} onComplete={onComplete} onCompletionAccepted={onCompletionAccepted} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Word 1: arma' }));
    fireEvent.click(screen.getByRole('button', { name: /submit selections/i }));
    expect(screen.getByText('Not quite')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByRole('button', { name: 'Word 1: arma' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Word 2: virumque' }));
    fireEvent.click(screen.getByRole('button', { name: /submit selections/i }));
    expectCompletion(onComplete, onCompletionAccepted);
  });

  it('lets odd-one-out retry a wrong choice and completes on the right one', () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    render(
      <OddOneOutExercise exercise={oddOneOut} onComplete={onComplete} onCompletionAccepted={onCompletionAccepted} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'rosa' }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    expect(screen.getByText('Not quite')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    fireEvent.click(screen.getByRole('button', { name: 'amo' }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    expectCompletion(onComplete, onCompletionAccepted);
  });

  it('offers no Try Again after a correct odd-one-out answer, so the way on stays', () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    render(
      <OddOneOutExercise exercise={oddOneOut} onComplete={onComplete} onCompletionAccepted={onCompletionAccepted} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'amo' }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expectCompletion(onComplete, onCompletionAccepted);
  });

  it('lets a restored odd-one-out answer be changed with Try Again', () => {
    render(
      <OddOneOutExercise
        exercise={oddOneOut}
        initialAnswer={{ type: 'odd-one-out', selectedItemId: 'a', explanation: '' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByRole('button', { name: /submit answer/i })).toBeInTheDocument();
  });
});

it('records a test answer without grading or feedback', () => {
  const onAnswer = jest.fn();
  const onComplete = jest.fn();
  const onCompletionAccepted = jest.fn();
  render(
    <TableFillExercise
      exercise={tableFill}
      runtimeMode="test"
      onAnswer={onAnswer}
      onComplete={onComplete}
      onCompletionAccepted={onCompletionAccepted}
    />
  );

  fireEvent.change(screen.getByPlaceholderText('Enter answer...'), { target: { value: 'fire' } });
  fireEvent.click(screen.getByRole('button', { name: /submit answers/i }));

  expect(onAnswer).toHaveBeenCalledWith({ type: 'table-fill', answers: { 'row-english': 'fire' } });
  expect(onComplete).toHaveBeenCalledWith(0);
  expect(onCompletionAccepted).not.toHaveBeenCalled();
  expect(screen.queryByText('Not quite')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
});
