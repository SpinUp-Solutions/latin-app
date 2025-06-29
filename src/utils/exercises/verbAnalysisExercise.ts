/**
 * Verb Analysis Exercise Validation Utilities
 */

import { VerbAnalysisExercise } from '@/src/types/exercise';
import { ValidationResult } from './types';
import { isTextMatch } from './helpers';

/**
 * Validates a verb analysis exercise answer
 */
export const validateVerbAnalysisExercise = (
  userAnswer: string,
  exercise: VerbAnalysisExercise,
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
