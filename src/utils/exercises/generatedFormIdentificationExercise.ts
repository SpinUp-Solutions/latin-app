import { normalizeAnswer } from './helpers';
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

export const validateGeneratedFormIdentificationExercise = (
  userAnswer: string,
  currentItem: FormIdentificationItem
) => {
  const validatedItem = FormIdentificationItemSchema.parse(currentItem);
  const input = normalizeAnswer(userAnswer);
  return { isCorrect: input !== '' && validatedItem.acceptedAnswers.map(normalizeAnswer).includes(input) };
};

export const validateSingleFieldFormIdentificationExercise = (
  userAnswer: string,
  currentItem: SingleFieldFormIdentificationItem
) => {
  const validatedItem = SingleFieldFormIdentificationItemSchema.parse(currentItem);
  const userPaths = userAnswer.split(';').map(pathStr => pathStr.split(',').map(normalizeAnswer));

  if (
    !normalizeAnswer(userAnswer) ||
    userPaths.length !== validatedItem.primaryFormPaths.length ||
    userPaths.some(userPath => userPath.length !== validatedItem.steps.length)
  ) {
    return { isCorrect: false };
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

      const variantsPerStep = pathStepValues.map(value => getAcceptedAnswersForStep(value || '').map(normalizeAnswer));
      const matchesPath = userPath.every((userPart, index) => variantsPerStep[index].includes(userPart));

      if (matchesPath) {
        matchedPathIndices.add(pathIdx);
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) return { isCorrect: false };
  }

  return { isCorrect: true };
};

export interface SingleFieldPartialCredit {
  earnedUnits: number;
  availableUnits: number;
}

/**
 * Scores each requested grammatical field independently. Submitted paths are
 * paired with distinct expected paths to produce the highest legitimate score.
 * The submitted answer must retain the authored path and field shape so extra
 * guesses cannot be hidden among otherwise valid partial answers.
 */
export const scoreSingleFieldFormIdentificationAnswer = (
  userAnswer: string,
  currentItem: SingleFieldFormIdentificationItem
): SingleFieldPartialCredit => {
  const validatedItem = SingleFieldFormIdentificationItemSchema.parse(currentItem);
  const expectedPaths = validatedItem.primaryFormPaths;
  const steps = validatedItem.steps;
  const availableUnits = expectedPaths.length * steps.length;
  const userPaths = userAnswer.split(';').map(path => path.split(',').map(normalizeAnswer));

  if (userPaths.length !== expectedPaths.length || userPaths.some(path => path.length > steps.length)) {
    return { earnedUnits: 0, availableUnits };
  }

  const pathScores = userPaths.map(userPath =>
    expectedPaths.map(expectedPath =>
      steps.reduce((score, step, stepIndex) => {
        const expected = expectedPath[step];
        if (!expected || !userPath[stepIndex]) return score;
        const accepted = getAcceptedAnswersForStep(expected).map(normalizeAnswer);
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

export const validateMultiAnswerStep = (userAnswer: string, currentItem: MultiAnswerFormIdentificationItem) => {
  const validatedItem = MultiAnswerFormIdentificationItemSchema.parse(currentItem);
  const userParts = userAnswer.split(';').map(part => part.trim());
  const rejected = { isCorrect: false, answerSlots: [] as string[] };

  if (!normalizeAnswer(userAnswer) || userParts.length !== validatedItem.expectedAnswerCount) return rejected;

  const step = validatedItem.step;
  const primaryPaths = validatedItem.primaryFormPaths;
  const normalizedUserParts = userParts.map(normalizeAnswer);
  const acceptedByPath = primaryPaths.map(path => {
    const value = path[step];
    return value ? getAcceptedAnswersForStep(value).map(normalizeAnswer) : [];
  });
  const userAssignedToPath = Array<number>(acceptedByPath.length).fill(-1);
  const assignUserToPath = (userIndex: number, visitedPaths: Set<number>): boolean => {
    for (let pathIndex = 0; pathIndex < acceptedByPath.length; pathIndex++) {
      if (visitedPaths.has(pathIndex) || !acceptedByPath[pathIndex].includes(normalizedUserParts[userIndex])) continue;

      visitedPaths.add(pathIndex);
      const assignedUser = userAssignedToPath[pathIndex];
      if (assignedUser === -1 || assignUserToPath(assignedUser, visitedPaths)) {
        userAssignedToPath[pathIndex] = userIndex;
        return true;
      }
    }

    return false;
  };

  if (!normalizedUserParts.every((_, userIndex) => assignUserToPath(userIndex, new Set()))) return rejected;

  return { isCorrect: true, answerSlots: userParts };
};

export const validatePartialMultiAnswerPaths = (
  answerSlotsSoFar: string[][],
  stepsCompleted: FormIdentificationStep[],
  primaryFormPaths: Array<Record<string, string | undefined>>
) => {
  const slotCount = answerSlotsSoFar[0]?.length ?? 0;
  if (slotCount === 0) return { isCorrect: false, failedSlots: [] as number[] };

  const partialPaths = Array.from({ length: slotCount }, (_, slotIndex) => {
    const partialPath: Record<string, string> = {};
    for (let stepIndex = 0; stepIndex < stepsCompleted.length; stepIndex++) {
      const step = stepsCompleted[stepIndex];
      partialPath[step] = answerSlotsSoFar[stepIndex][slotIndex];
    }
    return partialPath;
  });
  const pathAssignedToSlot = Array<number>(primaryFormPaths.length).fill(-1);
  const assignSlotToPath = (slotIndex: number, visitedPaths: Set<number>): boolean => {
    const partialPath = partialPaths[slotIndex];

    for (let pathIndex = 0; pathIndex < primaryFormPaths.length; pathIndex++) {
      if (visitedPaths.has(pathIndex)) continue;

      const primaryPath = primaryFormPaths[pathIndex];
      const matches = stepsCompleted.every(step => {
        const userValue = normalizeAnswer(partialPath[step] || '');
        const primaryValue = primaryPath[step];
        if (!primaryValue) return false;
        return getAcceptedAnswersForStep(primaryValue).map(normalizeAnswer).includes(userValue);
      });

      if (!matches) continue;

      visitedPaths.add(pathIndex);
      const assignedSlot = pathAssignedToSlot[pathIndex];
      if (assignedSlot === -1 || assignSlotToPath(assignedSlot, visitedPaths)) {
        pathAssignedToSlot[pathIndex] = slotIndex;
        return true;
      }
    }

    return false;
  };
  const failedSlots: number[] = [];
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    if (!assignSlotToPath(slotIndex, new Set())) failedSlots.push(slotIndex);
  }

  return { isCorrect: failedSlots.length === 0, failedSlots };
};
