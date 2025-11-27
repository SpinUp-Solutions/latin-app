import { ValidationResult } from './types';
import { stripHtmlTags } from './helpers';
import {
  FormIdentificationItemSchema,
  type FormIdentificationItem,
  SingleFieldFormIdentificationItemSchema,
  type SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import { getAcceptedAnswersForStep } from './formIdentificationHelpers';

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

export const validateSingleFieldFormIdentificationExercise = (
  userAnswer: string,
  currentItem: SingleFieldFormIdentificationItem
): ValidationResult => {
  const validatedItem = SingleFieldFormIdentificationItemSchema.parse(currentItem);

  const userParts = userAnswer.split(';').map(part => normalize(part));
  const expectedStepCount = validatedItem.steps.length;

  if (userParts.length !== expectedStepCount) {
    return {
      isCorrect: false,
      correctAnswer: validatedItem.correctAnswerDisplay,
      hint: `Expected ${expectedStepCount} answers separated by semicolons`,
    };
  }

  const allPaths = [...validatedItem.primaryFormPaths, ...validatedItem.optionalFormPaths];

  for (const path of allPaths) {
    const pathStepValues = validatedItem.steps.map(step => path[step]);

    if (pathStepValues.some(v => !v)) continue;

    const variantsPerStep = pathStepValues.map(value => getAcceptedAnswersForStep(value || '').map(normalize));

    const matchesPath = userParts.every((userPart, index) => variantsPerStep[index].includes(userPart));

    if (matchesPath) {
      return {
        isCorrect: true,
        correctAnswer: validatedItem.correctAnswerDisplay,
      };
    }
  }

  return {
    isCorrect: false,
    correctAnswer: validatedItem.correctAnswerDisplay,
    hint: validatedItem.hint,
  };
};
