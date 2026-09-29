import { TextSelectionExercise } from '@/src/types/exercise';

export const validateTextSelectionExercise = (
  selectedWordIndex: number,
  exercise: TextSelectionExercise,
  currentIndex: number
) => ({
  isCorrect: selectedWordIndex === exercise.data.questions[currentIndex].correctWordIndex,
});
