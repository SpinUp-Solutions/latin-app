import { FillEmboldedTextExercise } from '@/src/types/exercise';
import { ValidationResult } from './types';
import { isTextMatch } from './helpers';

export const validateFillEmboldedTextExercise = (
  userAnswer: string,
  exercise: FillEmboldedTextExercise,
  currentIndex: number
): ValidationResult => {
  const currentWord = exercise.data.words[currentIndex];

  if (!currentWord) {
    return {
      isCorrect: false,
      correctAnswer: '',
    };
  }

  const isCorrect = isTextMatch(userAnswer, currentWord.correctAnswer);

  return {
    isCorrect,
    correctAnswer: currentWord.correctAnswer,
    hint: currentWord.hint,
    explanation: currentWord.explanation,
  };
};
