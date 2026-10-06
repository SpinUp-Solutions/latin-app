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
 * Highest total from pairing each row with a different column (the Hungarian algorithm). The
 * student's answer sets the matrix size, so trying every pairing could stall grading.
 */
const bestPairingTotal = (scores: number[][]): number => {
  const tall = scores.length > (scores[0]?.length ?? 0);
  const matrix = tall ? scores[0].map((_, column) => scores.map(row => row[column])) : scores;
  const columnCount = matrix[0]?.length ?? 0;
  const rowPotential = Array<number>(matrix.length + 1).fill(0);
  const columnPotential = Array<number>(columnCount + 1).fill(0);
  // Index 0 is a placeholder column holding the row currently being placed.
  const rowOfColumn = Array<number>(columnCount + 1).fill(0);
  const previousColumn = Array<number>(columnCount + 1).fill(0);

  for (let row = 1; row <= matrix.length; row++) {
    rowOfColumn[0] = row;
    let column = 0;
    const slack = Array<number>(columnCount + 1).fill(Infinity);
    const visited = Array<boolean>(columnCount + 1).fill(false);
    do {
      visited[column] = true;
      const currentRow = rowOfColumn[column];
      let delta = Infinity;
      let nextColumn = 0;
      for (let candidate = 1; candidate <= columnCount; candidate++) {
        if (visited[candidate]) continue;
        const cost = -matrix[currentRow - 1][candidate - 1] - rowPotential[currentRow] - columnPotential[candidate];
        if (cost < slack[candidate]) {
          slack[candidate] = cost;
          previousColumn[candidate] = column;
        }
        if (slack[candidate] < delta) {
          delta = slack[candidate];
          nextColumn = candidate;
        }
      }
      for (let candidate = 0; candidate <= columnCount; candidate++) {
        if (visited[candidate]) {
          rowPotential[rowOfColumn[candidate]] += delta;
          columnPotential[candidate] -= delta;
        } else {
          slack[candidate] -= delta;
        }
      }
      column = nextColumn;
    } while (rowOfColumn[column] !== 0);
    do {
      const previous = previousColumn[column];
      rowOfColumn[column] = rowOfColumn[previous];
      column = previous;
    } while (column !== 0);
  }

  return rowOfColumn.reduce(
    (total, row, column) => (column > 0 && row > 0 ? total + matrix[row - 1][column - 1] : total),
    0
  );
};

/**
 * Each submitted answer is paired with a different expected answer and earns one unit for every
 * part that matches it, whatever its other parts say; the pairing with the highest total is used.
 * A missing or extra answer reduces the fraction earned without changing the item's weight.
 */
export const scoreSingleFieldFormIdentificationAnswer = (
  userAnswer: string,
  currentItem: SingleFieldFormIdentificationItem
): SingleFieldPartialCredit => {
  const validatedItem = SingleFieldFormIdentificationItemSchema.parse(currentItem);
  const expectedPaths = validatedItem.primaryFormPaths;
  const steps = validatedItem.steps;
  const availableUnits = expectedPaths.length * steps.length;
  if (availableUnits === 0) return { earnedUnits: 0, availableUnits };

  const acceptedValues = (paths: typeof expectedPaths) =>
    paths.map(path =>
      steps.map(step => (path[step] ? getAcceptedAnswersForStep(step, path[step]).map(normalizeAnswer) : []))
    );
  const acceptedPaths = acceptedValues(expectedPaths);
  const unaskedPaths = acceptedValues(validatedItem.optionalFormPaths);
  const isComplete = (userPath: string[], accepted: string[][]) =>
    userPath.length === steps.length && userPath.every((value, index) => accepted[index].includes(value));

  const userPaths = new Map<string, string[]>();
  let guessCount = 0;
  for (const segment of userAnswer.split(';')) {
    // A trailing comma is harmless; internal empty parts still retain their positions.
    const userPath = segment
      .trim()
      .replace(/(?:,\s*)+$/u, '')
      .split(',')
      .map(normalizeAnswer);
    // A stray semicolon is not a guess.
    if (!userPath.some(Boolean)) continue;
    // Answers matching the same expected values are one answer, so repeating an answer in other
    // words, or naming both genders of a common-gender noun, neither earns nor costs credit.
    const key = userPath
      .map((value, index) => {
        const matched = acceptedPaths.flatMap((accepted, path) => (accepted[index]?.includes(value) ? [path] : []));
        return matched.length > 0 ? matched.join('|') : `=${value}`;
      })
      .join(',');
    if (userPaths.has(key)) continue;
    userPaths.set(key, userPath);
    // A correct reading the exercise did not ask for is not a wrong guess.
    const isUnaskedReading =
      !acceptedPaths.some(accepted => isComplete(userPath, accepted)) &&
      unaskedPaths.some(accepted => isComplete(userPath, accepted));
    if (!isUnaskedReading) guessCount += 1;
  }
  if (userPaths.size === 0) return { earnedUnits: 0, availableUnits };

  const matchedParts = bestPairingTotal(
    [...userPaths.values()].map(userPath =>
      acceptedPaths.map(accepted =>
        userPath.length > steps.length
          ? 0
          : accepted.reduce(
              (score, values, index) => score + (userPath[index] && values.includes(userPath[index]) ? 1 : 0),
              0
            )
      )
    )
  );

  return {
    earnedUnits: (matchedParts * expectedPaths.length) / Math.max(expectedPaths.length, guessCount),
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
    return value ? getAcceptedAnswersForStep(step, value).map(normalizeAnswer) : [];
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
        return getAcceptedAnswersForStep(step, primaryValue).map(normalizeAnswer).includes(userValue);
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
