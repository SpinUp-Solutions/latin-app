import { ValidationResult } from './types';
import { stripHtmlTags } from './helpers';
import {
  FormIdentificationItemSchema,
  type FormIdentificationItem,
  SingleFieldFormIdentificationItemSchema,
  type SingleFieldFormIdentificationItem,
  MultiAnswerFormIdentificationItemSchema,
  type MultiAnswerFormIdentificationItem,
  type FormIdentificationStep,
} from '@/src/types/exercises/schemas/form-identification';
import { getAcceptedAnswersForStep } from './formIdentificationHelpers';

export const normalize = (s: string): string => {
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

export interface MultiAnswerStepValidationResult extends ValidationResult {
  answerSlots: string[];
}

export const validateMultiAnswerStep = (
  userAnswer: string,
  currentItem: MultiAnswerFormIdentificationItem
): MultiAnswerStepValidationResult => {
  const validatedItem = MultiAnswerFormIdentificationItemSchema.parse(currentItem);

  const userParts = userAnswer.split(';').map(part => part.trim());
  const expectedCount = validatedItem.expectedAnswerCount;

  if (userParts.length !== expectedCount) {
    return {
      isCorrect: false,
      correctAnswer: validatedItem.correctAnswerDisplay,
      hint: `Expected ${expectedCount} answers separated by semicolons`,
      answerSlots: [],
    };
  }

  const step = validatedItem.step;
  const primaryPaths = validatedItem.primaryFormPaths;

  const validAnswersForStep = new Set<string>();
  primaryPaths.forEach(path => {
    const value = path[step];
    if (value) {
      getAcceptedAnswersForStep(value).forEach(variant => {
        validAnswersForStep.add(normalize(variant));
      });
    }
  });

  const normalizedUserParts = userParts.map(normalize);
  const allAnswersValid = normalizedUserParts.every(part => validAnswersForStep.has(part));

  if (!allAnswersValid) {
    return {
      isCorrect: false,
      correctAnswer: validatedItem.correctAnswerDisplay,
      hint: validatedItem.hint,
      answerSlots: [],
    };
  }

  return {
    isCorrect: true,
    correctAnswer: validatedItem.correctAnswerDisplay,
    answerSlots: userParts,
  };
};

export interface PartialValidationResult extends ValidationResult {
  failedSlots: number[];
}

export const validatePartialMultiAnswerPaths = (
  answerSlotsSoFar: string[][],
  stepsCompleted: FormIdentificationStep[],
  primaryFormPaths: Array<Record<string, string | undefined>>
): PartialValidationResult => {
  const slotCount = answerSlotsSoFar[0]?.length ?? 0;
  if (slotCount === 0) {
    return {
      isCorrect: false,
      correctAnswer: '',
      hint: 'No answers provided',
      failedSlots: [],
    };
  }

  const failedSlots: number[] = [];

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    const partialPath: Record<string, string> = {};
    for (let stepIdx = 0; stepIdx < stepsCompleted.length; stepIdx++) {
      const step = stepsCompleted[stepIdx];
      partialPath[step] = answerSlotsSoFar[stepIdx][slotIndex];
    }

    const hasValidPath = primaryFormPaths.some(primaryPath => {
      return stepsCompleted.every(step => {
        const userValue = normalize(partialPath[step] || '');
        const primaryValue = primaryPath[step];
        if (!primaryValue) return false;
        const acceptedVariants = getAcceptedAnswersForStep(primaryValue).map(normalize);
        return acceptedVariants.includes(userValue);
      });
    });

    if (!hasValidPath) {
      failedSlots.push(slotIndex);
    }
  }

  const correctDisplay = primaryFormPaths.map(path => stepsCompleted.map(step => path[step]).join(';')).join(' OR ');

  const hint =
    failedSlots.length > 0
      ? `Answer${failedSlots.length > 1 ? 's' : ''} in position ${failedSlots.map(s => s + 1).join(', ')} ${failedSlots.length > 1 ? "don't" : "doesn't"} form a valid combination`
      : undefined;

  return {
    isCorrect: failedSlots.length === 0,
    correctAnswer: correctDisplay,
    hint,
    failedSlots,
  };
};
