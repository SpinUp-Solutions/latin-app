import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FillExercise from '@/src/components/ui/exercises/fill-exercise';
import MultipleChoiceExercise from '@/src/components/ui/exercises/multiple-choice-exercise';
import type { FillExercise as FillExerciseType } from '@/src/types/exercises/fill';
import type { MultipleChoiceExercise as MultipleChoiceExerciseType } from '@/src/types/exercises/multiple-choice';

const manualProgression = {
  escalationLevels: [],
  maxLevelFailures: 1,
  progressionRules: {
    autoAdvanceOnCorrect: false,
    pauseForExplanation: true,
    showProgress: true,
  },
};

describe('exercise test mode scoring', () => {
  it('scores a multiple-choice exercise on its first submission', () => {
    const onComplete = jest.fn();
    const exercise: MultipleChoiceExerciseType = {
      id: 'multiple-choice-test',
      type: 'multiple-choice',
      title: 'Question',
      instructions: '',
      feedbackConfig: manualProgression,
      data: {
        question: 'Choose one',
        allowMultipleSelections: false,
        options: [
          { id: 'wrong', text: 'Wrong', isCorrect: false },
          { id: 'right', text: 'Right', isCorrect: true },
        ],
      },
    };

    render(<MultipleChoiceExercise exercise={exercise} onComplete={onComplete} testMode />);

    fireEvent.click(screen.getByRole('button', { name: /wrong/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(onComplete).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('advances after an incorrect multi-item answer and retains first-attempt credit', () => {
    const onComplete = jest.fn();
    const exercise: FillExerciseType = {
      id: 'fill-test',
      type: 'fill',
      title: 'Fill',
      instructions: '',
      feedbackConfig: manualProgression,
      data: {
        items: [
          { text: 'First', answer: 'one' },
          { text: 'Second', answer: 'two' },
        ],
      },
    };

    render(<FillExercise exercise={exercise} onComplete={onComplete} testMode />);

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByText('Second')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onComplete).toHaveBeenCalledWith(50);
  });
});
