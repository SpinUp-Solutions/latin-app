import { FillExercise } from '@/src/types/exercise';
import { ValidationResult } from './types';
import { isTextMatch } from './helpers';

export const validateFillExercise = (
  userAnswer: string,
  exercise: FillExercise,
  currentIndex: number
): ValidationResult => {
  const currentItem = exercise.data.items[currentIndex];
  const isCorrect = isTextMatch(userAnswer, currentItem.answer);

  return {
    isCorrect,
    correctAnswer: currentItem.answer,
    hint: currentItem.hint,
  };
};
