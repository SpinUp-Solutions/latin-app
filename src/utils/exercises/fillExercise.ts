import { FillExercise } from '@/src/types/exercise';
import { isTextMatch } from './helpers';

export const validateFillExercise = (userAnswer: string, exercise: FillExercise, currentIndex: number) => ({
  isCorrect: isTextMatch(userAnswer, exercise.data.items[currentIndex].answer),
});
