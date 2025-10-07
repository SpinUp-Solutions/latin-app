import { OddOneOutExercise } from '@/src/types/exercise';

export interface OddOneOutValidationResult {
  isCorrect: boolean;
  correctItemId?: string;
  selectedItemText?: string;
}

export const validateOddOneOutExercise = (
  selectedItemId: string,
  userExplanation: string,
  exercise: OddOneOutExercise
): OddOneOutValidationResult => {
  const correctItem = exercise.data.items.find(item => item.isOddOneOut);
  const selectedItem = exercise.data.items.find(item => item.id === selectedItemId);

  return {
    isCorrect: selectedItemId === correctItem?.id,
    correctItemId: correctItem?.id,
    selectedItemText: selectedItem?.text,
  };
};
