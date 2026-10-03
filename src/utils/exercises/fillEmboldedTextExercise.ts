import { FillEmboldedTextExercise } from '@/src/types/exercise';
import { isTextMatch } from './helpers';

export const validateFillEmboldedTextExercise = (
  userAnswer: string,
  exercise: FillEmboldedTextExercise,
  currentIndex: number
) => {
  const currentWord = exercise.data.words[currentIndex];
  return { isCorrect: Boolean(currentWord) && isTextMatch(userAnswer, currentWord.correctAnswer) };
};
