import { MultipleChoiceExercise } from '@/src/types/exercise';

export const validateMultipleChoiceExercise = (selectedOptionIds: string[], exercise: MultipleChoiceExercise) => {
  const correctOptionIds = exercise.data.options.filter(opt => opt.isCorrect).map(opt => opt.id);

  const allCorrectSelected = correctOptionIds.every(id => selectedOptionIds.includes(id));
  const noIncorrectSelected = selectedOptionIds.every(id => correctOptionIds.includes(id));
  return { isCorrect: allCorrectSelected && noIncorrectSelected && selectedOptionIds.length > 0 };
};
