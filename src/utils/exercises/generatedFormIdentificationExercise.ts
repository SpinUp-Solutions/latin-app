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
  const score = scoreSingleFieldFormIdentificationAnswer(userAnswer, currentItem);
  return { isCorrect: score.availableUnits > 0 && score.earnedUnits === score.availableUnits };
};

export interface SingleFieldPartialCredit {
  earnedUnits: number;
  availableUnits: number;
}

/**
 * Preserves field-level credit for a single interpretation. Multiple expected
 * or submitted interpretations earn credit only for complete, distinct parses;
 * extra guesses reduce the fraction earned without changing the item's weight.
 */
export const scoreSingleFieldFormIdentificationAnswer = (
  userAnswer: string,
  currentItem: SingleFieldFormIdentificationItem
): SingleFieldPartialCredit => {
  const validatedItem = SingleFieldFormIdentificationItemSchema.parse(currentItem);
  const expectedPaths = validatedItem.primaryFormPaths;
  const steps = validatedItem.steps;
  const availableUnits = expectedPaths.length * steps.length;
  // A trailing comma is harmless; internal empty fields still retain their positions.
  const userPaths = userAnswer.split(';').map(path =>
    path
      .trim()
      .replace(/(?:,\s*)+$/u, '')
      .split(',')
      .map(normalizeAnswer)
  );
  const acceptedPaths = expectedPaths.map(path =>
    steps.map(step => (path[step] ? getAcceptedAnswersForStep(path[step]).map(normalizeAnswer) : []))
  );

  if (availableUnits === 0) return { earnedUnits: 0, availableUnits };

  if (expectedPaths.length === 1 && userPaths.length === 1) {
    const userPath = userPaths[0];
    if (userPath.length > steps.length) return { earnedUnits: 0, availableUnits };
    const earnedUnits = acceptedPaths[0].reduce(
      (score, accepted, index) => score + (userPath[index] && accepted.includes(userPath[index]) ? 1 : 0),
      0
    );
    return { earnedUnits, availableUnits };
  }

  const matchingPaths = userPaths.map(userPath =>
    acceptedPaths.flatMap((path, index) =>
      userPath.length === steps.length &&
      userPath.every((value, stepIndex) => value !== '' && path[stepIndex].includes(value))
        ? [index]
        : []
    )
  );
  const assignedUsers = expectedPaths.map(() => -1);
  // Reassign earlier matches when aliases overlap so submitted order cannot affect credit.
  const assignPath = (userIndex: number, visited: Set<number>): boolean => {
    for (const expectedIndex of matchingPaths[userIndex]) {
      if (visited.has(expectedIndex)) continue;
      visited.add(expectedIndex);
      const previousUser = assignedUsers[expectedIndex];
      if (previousUser === -1 || assignPath(previousUser, visited)) {
        assignedUsers[expectedIndex] = userIndex;
        return true;
      }
    }
    return false;
  };
  const matchedCount = userPaths.reduce((count, _, userIndex) => count + (assignPath(userIndex, new Set()) ? 1 : 0), 0);

  return {
    earnedUnits: (availableUnits * matchedCount) / Math.max(expectedPaths.length, userPaths.length),
    availableUnits,
  };
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
