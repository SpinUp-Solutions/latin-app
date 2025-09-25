import { ClickOnMultipleWordsExercise } from '@/src/types/exercise';

export interface ClickOnMultipleWordsValidationResult {
  isCorrect: boolean;
  correctSelections: number;
  totalRequired: number;
  overSelections: number;
  selectedIndices: Set<number>;
  correctIndices: Set<number>;
  missedIndices: Set<number>;
  extraIndices: Set<number>;
  score: number;
}

export const validateClickOnMultipleWords = (
  selectedIndices: Set<number>,
  exercise: ClickOnMultipleWordsExercise
): ClickOnMultipleWordsValidationResult => {
  const correctIndices = new Set(exercise.data.correctWordIndices);
  const totalRequired = correctIndices.size;

  // Calculate intersections and differences
  const correctSelections = new Set(Array.from(selectedIndices).filter(i => correctIndices.has(i))).size;
  const missedIndices = new Set(Array.from(correctIndices).filter(i => !selectedIndices.has(i)));
  const extraIndices = new Set(Array.from(selectedIndices).filter(i => !correctIndices.has(i)));
  const overSelections = extraIndices.size;

  // Determine correctness
  const minimumCorrect = exercise.data.minimumCorrect ?? totalRequired;
  const allowOverSelection = exercise.data.allowOverSelection ?? false;

  let isCorrect: boolean;
  if (allowOverSelection) {
    // In lenient mode, only need minimum correct selections
    isCorrect = correctSelections >= minimumCorrect;
  } else {
    // In strict mode, must have exact match (no over-selections)
    isCorrect = correctSelections === totalRequired && overSelections === 0;
  }

  // Calculate score
  let score = 0;
  if (totalRequired > 0) {
    const baseScore = (correctSelections / totalRequired) * 100;
    if (allowOverSelection && overSelections > 0) {
      // Apply penalty for over-selections in lenient mode
      const penalty = Math.min(baseScore, overSelections * 10); // 10% penalty per extra selection
      score = Math.max(0, baseScore - penalty);
    } else {
      score = isCorrect ? 100 : baseScore;
    }
    score = Math.round(score);
  }

  return {
    isCorrect,
    correctSelections,
    totalRequired,
    overSelections,
    selectedIndices: new Set(selectedIndices),
    correctIndices: new Set(correctIndices),
    missedIndices,
    extraIndices,
    score,
  };
};