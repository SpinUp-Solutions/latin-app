import { MultipleChoiceExercise } from '@/src/types/exercise';

export interface MultipleChoiceValidationResult {
  isCorrect: boolean;
  correctOptionId?: string;
  selectedOptionText?: string;
}

export const validateMultipleChoiceExercise = (
  selectedOptionId: string,
  exercise: MultipleChoiceExercise
): MultipleChoiceValidationResult => {
  const selectedOption = exercise.data.options.find(opt => opt.id === selectedOptionId);
  const correctOption = exercise.data.options.find(opt => opt.isCorrect);

  return {
    isCorrect: selectedOption?.isCorrect || false,
    correctOptionId: correctOption?.id,
    selectedOptionText: selectedOption?.text,
  };
};
