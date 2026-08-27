import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FillExercise from '@/src/components/ui/exercises/fill-exercise';
import type { FillExercise as FillExerciseType } from '@/src/types/exercises/fill';
import { ExerciseProgress } from '@/src/components/ui/exercises/exercise-progress';

const feedbackConfig = {
  escalationLevels: [],
  maxLevelFailures: 1,
  progressionRules: {
    autoAdvanceOnCorrect: false,
    pauseForExplanation: true,
    showProgress: true,
  },
};

const exercise: FillExerciseType = {
  id: 'fill-progress',
  type: 'fill',
  title: 'Fill',
  instructions: '',
  feedbackConfig,
  data: {
    items: [
      { text: 'First', answer: 'one' },
      { text: 'Second', answer: 'two' },
    ],
  },
};

describe('exercise progress bars', () => {
  it('clamps zero totals and reports completion separately from position', () => {
    render(<ExerciseProgress currentIndex={0} completed={0} total={0} />);
    expect(screen.getByText('Question 0 of 0')).toBeInTheDocument();
    expect(screen.getByText('0 of 0 complete (0%)')).toBeInTheDocument();
  });

  it('counts practice completions from successful items', () => {
    render(<FillExercise exercise={exercise} />);
    expect(screen.getByText('0 of 2 complete (0%)')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'one' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(screen.getByText('1 of 2 complete (50%)')).toBeInTheDocument();
  });

  it('counts test-mode recorded answers even when they are incorrect', () => {
    render(<FillExercise exercise={exercise} runtimeMode="test" />);
    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(screen.getByText('1 of 2 complete (50%)')).toBeInTheDocument();
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();
  });
});
