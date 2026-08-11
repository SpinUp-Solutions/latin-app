/**
 * Matching Exercise Validation Utilities
 */

import { MatchingExercise } from '@/src/types/exercise';
import { MatchingValidationResult } from './types';

/**
 * Validates a matching exercise pair
 */
export const validateMatchingExercise = (
  leftItem: { id: string; value: string },
  rightItem: { id: string; value: string },
  exercise: MatchingExercise
): MatchingValidationResult => {
  const { rightColumn, answers: finalAnswer } = exercise.data;

  // Get the expected right item for this left item
  const expectedRightId = finalAnswer[leftItem.id];
  const expectedRightItem = rightColumn.find(item => item.id === expectedRightId);

  // IDs are the authored answer identity. Display values are not necessarily
  // unique, so comparing labels could credit a different right-side item.
  const isCorrect = Boolean(expectedRightItem && rightItem.id === expectedRightId);

  return {
    isCorrect,
    leftItem,
    rightItem,
    correctAnswer: expectedRightItem?.value,
    expectedMatch: expectedRightItem ? `"${leftItem.value}" matches with "${expectedRightItem.value}"` : undefined,
  };
};
