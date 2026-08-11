import { OddOneOutExercise } from '@/src/types/exercise';
import { richTextToPlainText } from './helpers';

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
  const hasRequiredExplanation =
    !exercise.data.requireExplanation ||
    richTextToPlainText(userExplanation).replace(/[\u200B-\u200D\uFEFF]/g, '').length > 0;

  return {
    isCorrect: selectedItemId === correctItem?.id && hasRequiredExplanation,
    correctItemId: correctItem?.id,
    selectedItemText: selectedItem?.text,
  };
};
