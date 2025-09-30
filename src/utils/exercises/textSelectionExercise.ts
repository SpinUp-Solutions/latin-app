/**
 * Text Selection Exercise Validation Utilities
 */

import { TextSelectionExercise } from '@/src/types/exercise';
import { ValidationResult } from './types';
import { stripHtmlTags } from './helpers';

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

  const plainTextWords = stripHtmlTags(exercise.data.passage)
    .split(/\s+/)
    .filter(w => w.trim());
  const correctWord = plainTextWords[currentQuestion.correctWordIndex] || '';

  return {
    isCorrect,
    correctAnswer: correctWord,
    hint: currentQuestion.hint,
    explanation: currentQuestion.explanation,
  };
};
