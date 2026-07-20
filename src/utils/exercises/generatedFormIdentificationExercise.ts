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

  if (!input) {
    return {
      isCorrect: false,
      correctAnswer: validatedItem.correctAnswer,
      hint: validatedItem.hint,
    };
  }

  const normalizedAnswers = validatedItem.acceptedAnswers.map(normalize).filter(a => a !== '');
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

  if (!normalize(userAnswer)) {
    return {
      isCorrect: false,
      correctAnswer: validatedItem.correctAnswerDisplay,
      hint: 'Please enter an answer',
    };
  }

  const userPaths = userAnswer.split(';').map(pathStr => pathStr.split(',').map(part => normalize(part)));
  const expectedPathCount = validatedItem.primaryFormPaths.length;
  const expectedStepCount = validatedItem.steps.length;

  if (userPaths.length !== expectedPathCount) {
    return {
      isCorrect: false,
      correctAnswer: validatedItem.correctAnswerDisplay,
      hint: `Expected ${expectedPathCount} path${expectedPathCount > 1 ? 's' : ''} separated by semicolons`,
    };
  }

  for (const userPath of userPaths) {
    if (userPath.length !== expectedStepCount) {
      return {
        isCorrect: false,
        correctAnswer: validatedItem.correctAnswerDisplay,
        hint: `Each path should have ${expectedStepCount} values separated by commas`,
      };
    }
  }

  const primaryPaths = validatedItem.primaryFormPaths;
  const matchedPathIndices = new Set<number>();

  for (const userPath of userPaths) {
    let foundMatch = false;

    for (let pathIdx = 0; pathIdx < primaryPaths.length; pathIdx++) {
      if (matchedPathIndices.has(pathIdx)) continue;

      const path = primaryPaths[pathIdx];
      const pathStepValues = validatedItem.steps.map(step => path[step]);

      if (pathStepValues.some(v => !v)) continue;

      const variantsPerStep = pathStepValues.map(value => getAcceptedAnswersForStep(value || '').map(normalize));
      const matchesPath = userPath.every((userPart, index) => variantsPerStep[index].includes(userPart));

      if (matchesPath) {
        matchedPathIndices.add(pathIdx);
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      return {
        isCorrect: false,
        correctAnswer: validatedItem.correctAnswerDisplay,
        hint: validatedItem.hint,
      };
    }
  }

  return {
    isCorrect: true,
    correctAnswer: validatedItem.correctAnswerDisplay,
  };
};

export interface SingleFieldPartialCredit {
  earnedUnits: number;
  availableUnits: number;
}

/**
 * Scores each requested grammatical field independently. Submitted paths are
 * paired with distinct expected paths to produce the highest legitimate score;
 * missing and extra values receive no credit and never subtract points.
 */
export const scoreSingleFieldFormIdentificationAnswer = (
  userAnswer: string,
  currentItem: SingleFieldFormIdentificationItem
): SingleFieldPartialCredit => {
  const validatedItem = SingleFieldFormIdentificationItemSchema.parse(currentItem);
  const expectedPaths = validatedItem.primaryFormPaths;
  const steps = validatedItem.steps;
  const availableUnits = expectedPaths.length * steps.length;
  const userPaths = userAnswer
    .split(';')
    .map(path => path.split(',').map(normalize))
    .filter(path => path.some(Boolean));

  const pathScores = userPaths.map(userPath =>
    expectedPaths.map(expectedPath =>
      steps.reduce((score, step, stepIndex) => {
        const expected = expectedPath[step];
        if (!expected || !userPath[stepIndex]) return score;
        const accepted = getAcceptedAnswersForStep(expected).map(normalize);
        return score + (accepted.includes(userPath[stepIndex]) ? 1 : 0);
      }, 0)
    )
  );

  const search = (userIndex: number, usedExpected: Set<number>): number => {
    if (userIndex >= pathScores.length) return 0;
    let best = search(userIndex + 1, usedExpected);
    for (let expectedIndex = 0; expectedIndex < expectedPaths.length; expectedIndex++) {
      if (usedExpected.has(expectedIndex)) continue;
      usedExpected.add(expectedIndex);
      best = Math.max(best, pathScores[userIndex][expectedIndex] + search(userIndex + 1, usedExpected));
      usedExpected.delete(expectedIndex);
    }
    return best;
  };

  return { earnedUnits: search(0, new Set()), availableUnits };
};

export interface MultiAnswerStepValidationResult extends ValidationResult {
  answerSlots: string[];
}

export const validateMultiAnswerStep = (
  userAnswer: string,
  currentItem: MultiAnswerFormIdentificationItem
): MultiAnswerStepValidationResult => {
  const validatedItem = MultiAnswerFormIdentificationItemSchema.parse(currentItem);

  if (!normalize(userAnswer)) {
    return {
      isCorrect: false,
      correctAnswer: validatedItem.correctAnswerDisplay,
      hint: 'Please enter an answer',
      answerSlots: [],
    };
  }

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

  const variantToCanonical = new Map<string, string>();
  primaryPaths.forEach(path => {
    const value = path[step];
    if (!value) return;
    const canonical = normalize(value);
    getAcceptedAnswersForStep(value).forEach(variant => {
      const normalizedVariant = normalize(variant);
      if (!variantToCanonical.has(normalizedVariant)) {
        variantToCanonical.set(normalizedVariant, canonical);
      }
    });
  });

  const seenCanonicalValues = new Set<string>();
  for (const normalizedPart of normalizedUserParts) {
    const canonical = variantToCanonical.get(normalizedPart) || normalizedPart;
    if (seenCanonicalValues.has(canonical)) {
      return {
        isCorrect: false,
        correctAnswer: validatedItem.correctAnswerDisplay,
        hint: 'Duplicate answers are not allowed.',
        answerSlots: [],
      };
    }
    seenCanonicalValues.add(canonical);
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
  const matchedPathIndices = new Set<number>();

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    const partialPath: Record<string, string> = {};
    for (let stepIdx = 0; stepIdx < stepsCompleted.length; stepIdx++) {
      const step = stepsCompleted[stepIdx];
      partialPath[step] = answerSlotsSoFar[stepIdx][slotIndex];
    }

    let foundPathIndex = -1;
    for (let pathIdx = 0; pathIdx < primaryFormPaths.length; pathIdx++) {
      if (matchedPathIndices.has(pathIdx)) continue;

      const primaryPath = primaryFormPaths[pathIdx];
      const matches = stepsCompleted.every(step => {
        const userValue = normalize(partialPath[step] || '');
        const primaryValue = primaryPath[step];
        if (!primaryValue) return false;
        const acceptedVariants = getAcceptedAnswersForStep(primaryValue).map(normalize);
        return acceptedVariants.includes(userValue);
      });

      if (matches) {
        foundPathIndex = pathIdx;
        break;
      }
    }

    if (foundPathIndex >= 0) {
      matchedPathIndices.add(foundPathIndex);
    } else {
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
