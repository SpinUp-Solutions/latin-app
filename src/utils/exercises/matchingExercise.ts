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

  // Get the expected right item value for this left item
  const expectedRightId = finalAnswer[leftItem.id];
  const expectedRightItem = rightColumn.find(item => item.id === expectedRightId);
  const expectedValue = expectedRightItem?.value;

  // Check if the selected right item's value matches the expected value
  const isCorrect = Boolean(expectedValue && rightItem.value === expectedValue);

  return {
    isCorrect,
    leftItem,
    rightItem,
    correctAnswer: expectedRightItem?.value,
    expectedMatch: expectedRightItem ? `"${leftItem.value}" matches with "${expectedRightItem.value}"` : undefined,
  };
};
