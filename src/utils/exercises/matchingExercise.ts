/**
 * Matching Exercise Validation Utilities
 */

import { MatchingExercise } from '@/src/types/exercise';
import { MatchingValidationResult } from './types';

/**
 * Returns only answer mappings that can be selected in the rendered exercise.
 *
 * Matching exercises created by an older content factory can contain an
 * orphaned answer key when the clock advanced between creating the column IDs
 * and creating the answer map. Keep those legacy keys from inflating progress
 * and grading denominators. The current content factory reuses the generated
 * column IDs and therefore cannot create this mismatch.
 */
export const getSelectableMatchingAnswers = (exercise: MatchingExercise): Record<string, string> => {
  const leftIds = new Set(exercise.data.leftColumn.map(item => item.id));
  const rightIds = new Set(exercise.data.rightColumn.map(item => item.id));

  return Object.fromEntries(
    Object.entries(exercise.data.answers || {}).filter(
      ([leftId, rightId]) => leftIds.has(leftId) && rightIds.has(rightId)
    )
  );
};

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
