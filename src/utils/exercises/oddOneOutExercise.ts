import { OddOneOutExercise } from '@/src/types/exercise';
import { richTextToPlainText } from './helpers';

export const validateOddOneOutExercise = (
  selectedItemId: string,
  userExplanation: string,
  exercise: OddOneOutExercise
) => {
  const correctItem = exercise.data.items.find(item => item.isOddOneOut);
  const hasRequiredExplanation =
    !exercise.data.requireExplanation || richTextToPlainText(userExplanation).replace(/[​-‍﻿]/g, '').length > 0;

  return { isCorrect: selectedItemId === correctItem?.id && hasRequiredExplanation };
};
