/**
 * Text Selection Exercise Validation Utilities
 */

import { TextSelectionExercise } from '@/src/types/exercise';
import { ValidationResult } from './types';

/**
 * Validates a text selection exercise answer
 */
export const validateTextSelectionExercise = (
  selectedWordIndex: number,
  exercise: TextSelectionExercise,
  currentIndex: number
): ValidationResult => {
  const currentQuestion = exercise.data.questions[currentIndex];
  const isCorrect = selectedWordIndex === currentQuestion.correctWordIndex;

  const correctWord = exercise.data.passage.split(' ')[currentQuestion.correctWordIndex];

  return {
    isCorrect,
    correctAnswer: correctWord,
    hint: currentQuestion.hint,
    explanation: currentQuestion.explanation,
  };
};
