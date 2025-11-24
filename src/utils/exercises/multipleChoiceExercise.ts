import { MultipleChoiceExercise } from '@/src/types/exercise';

export interface MultipleChoiceValidationResult {
  isCorrect: boolean;
  correctOptionIds: string[];
  selectedOptionIds: string[];
}

export const validateMultipleChoiceExercise = (
  selectedOptionIds: string[],
  exercise: MultipleChoiceExercise
): MultipleChoiceValidationResult => {
  const correctOptions = exercise.data.options.filter(opt => opt.isCorrect);
  const correctOptionIds = correctOptions.map(opt => opt.id);

  const allCorrectSelected = correctOptionIds.every(id => selectedOptionIds.includes(id));
  const noIncorrectSelected = selectedOptionIds.every(id => correctOptionIds.includes(id));
  const isCorrect = allCorrectSelected && noIncorrectSelected && selectedOptionIds.length > 0;

  return {
    isCorrect,
    correctOptionIds,
    selectedOptionIds,
  };
};
