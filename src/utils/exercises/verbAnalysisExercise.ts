/**
 * Fill Embolded Text Exercise Validation Utilities
 */

import { FillEmboldedTextExercise } from '@/src/types/exercise';
import { ValidationResult } from './types';
import { isTextMatch } from './helpers';

/**
 * Validates a fill embolded text exercise answer
 */
export const validateVerbAnalysisExercise = (
  userAnswer: string,
  exercise: FillEmboldedTextExercise,
  currentIndex: number
): ValidationResult => {
  const currentVerb = exercise.data.verbs[currentIndex];
  const isCorrect = isTextMatch(userAnswer, currentVerb.correctPronoun);

  return {
    isCorrect,
    correctAnswer: currentVerb.correctPronoun,
    hint: currentVerb.hint,
    explanation: currentVerb.explanation,
  };
};
