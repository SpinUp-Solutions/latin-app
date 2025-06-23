/**
 * Verb Conjugation Exercise Validation Utilities
 */

import { VerbConjugationExercise } from '@/src/types/exercise';
import { ValidationResult } from './types';
import { isTextMatch } from './helpers';

/**
 * Validates a verb conjugation task answer
 */
export const validateVerbConjugationTask = (
  userAnswer: string,
  exercise: VerbConjugationExercise
): ValidationResult => {
  if (!exercise.data.conjugationTask) {
    return { isCorrect: false };
  }

  const conjugationTask = exercise.data.conjugationTask;
  const isCorrect = isTextMatch(userAnswer, conjugationTask.answer);

  return {
    isCorrect,
    correctAnswer: conjugationTask.answer,
  };
};

/**
 * Validates a living latin practice exercise answer
 */
export const validateVerbConjugationLivingLatin = (
  userAnswer: string,
  exercise: VerbConjugationExercise,
  currentLivingLatinIndex: number
): ValidationResult => {
  if (!exercise.data.livingLatinPractice) {
    return { isCorrect: false };
  }

  const currentExercise = exercise.data.livingLatinPractice.exercises[currentLivingLatinIndex];
  const isCorrect = isTextMatch(userAnswer, currentExercise.answer);

  return {
    isCorrect,
    correctAnswer: currentExercise.answer,
  };
};
