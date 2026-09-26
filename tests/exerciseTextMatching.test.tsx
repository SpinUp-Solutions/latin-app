import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FillExercise from '@/src/components/ui/exercises/fill-exercise';
import { validateFillExercise } from '@/src/utils/exercises/fillExercise';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';
import type { FillExercise as FillExerciseType } from '@/src/types/exercises/fill';

const exercise: FillExerciseType = {
  id: 'sentence-transform',
  type: 'fill',
  title: 'Change the voice',
  instructions: '',
  maxPoints: 1,
  feedbackConfig: {
    escalationLevels: [],
    progressionRules: { autoAdvanceOnCorrect: false, pauseForExplanation: true },
  },
  data: { items: [{ text: 'Translate the sentence', answer: 'The poem was read.' }] },
};

it('accepts a correct sentence without the authored final period in practice and scoring', () => {
  const onCompletionAccepted = jest.fn();
  render(<FillExercise exercise={exercise} onCompletionAccepted={onCompletionAccepted} />);

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'The poem was read' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));

  expect(onCompletionAccepted).toHaveBeenCalledWith(100);
  expect(gradeExercisePercentage({ exercise }, { type: 'fill', answers: ['The poem was read'] })).toBe(100);
});

it('still rejects a meaningfully different sentence', () => {
  expect(validateFillExercise('The poem was, read', exercise, 0).isCorrect).toBe(false);
  expect(validateFillExercise('The poem was written', exercise, 0).isCorrect).toBe(false);
  expect(validateFillExercise('The poem was read?', exercise, 0).isCorrect).toBe(false);
});
