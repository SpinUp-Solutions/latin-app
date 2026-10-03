import { MatchingExercise } from '@/src/types/exercise';

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

export const validateMatchingExercise = (
  leftItem: { id: string; value: string },
  rightItem: { id: string; value: string },
  exercise: MatchingExercise
) => {
  const expectedRightId = exercise.data.answers[leftItem.id];
  // IDs are the authored answer identity. Display values are not necessarily
  // unique, so comparing labels could credit a different right-side item.
  const expectedRightItem = exercise.data.rightColumn.find(item => item.id === expectedRightId);
  return { isCorrect: Boolean(expectedRightItem && rightItem.id === expectedRightId) };
};
