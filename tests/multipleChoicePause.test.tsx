import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MultipleChoiceExercise from '@/src/components/ui/exercises/multiple-choice-exercise';
import type { MultipleChoiceExercise as MultipleChoiceExerciseType } from '@/src/types/exercises/multiple-choice';

describe('MultipleChoiceExercise pause for explanation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('waits for explicit continue when explanation pause is enabled', () => {
    const onComplete = jest.fn();
    const exercise: MultipleChoiceExerciseType = {
      id: 'exercise-1',
      type: 'multiple-choice',
      title: 'Multiple Choice',
      instructions: 'Pick the correct answer.',
      feedbackConfig: {
        escalationLevels: [],
        successMessage: {
          default: 'Correct!',
          completion: 'Done!',
          advance: 'Next!',
          showExplanation: true,
        },
        progressionRules: {
          autoAdvanceOnCorrect: true,
          pauseForExplanation: true,
          showProgress: true,
        },
      },
      data: {
        question: 'Which answer is right?',
        allowMultipleSelections: false,
        explanation: 'Because this option matches the prompt.',
        options: [
          { id: 'a', text: 'Wrong', isCorrect: false },
          { id: 'b', text: 'Right', isCorrect: true },
        ],
      },
    };

    render(<MultipleChoiceExercise exercise={exercise} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /right/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(screen.getByText(/because this option matches the prompt/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onComplete).toHaveBeenCalledWith(100);
  });
});
