import { ValidationResult } from './types';
import { stripHtmlTags } from './helpers';
import {
  FormIdentificationItemSchema,
  type FormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';

const normalize = (s: string): string => {
  return stripHtmlTags(s)
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]/g, '')
    .replace(/\s+/g, ' ');
};

export const validateGeneratedFormIdentificationExercise = (
  userAnswer: string,
  currentItem: FormIdentificationItem
): ValidationResult => {
  const validatedItem = FormIdentificationItemSchema.parse(currentItem);

  const input = normalize(userAnswer);
  const normalizedAnswers = validatedItem.acceptedAnswers.map(normalize);
  const isCorrect = normalizedAnswers.includes(input);

  return {
    isCorrect,
    correctAnswer: validatedItem.correctAnswer,
    hint: validatedItem.hint,
  };
};
