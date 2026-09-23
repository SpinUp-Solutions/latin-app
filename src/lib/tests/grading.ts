import type { Exercise } from '@/src/types/exercises';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { GeneratedTranslationItem } from '@/src/utils/exercises/generatedTranslationExercise';
import type {
  FormIdentificationItem,
  MultiAnswerFormIdentificationItem,
  SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import { compareDiagramAnnotationSets } from '@/src/features/sentence-diagramming/model';
import { validateGeneratedTranslationExercise } from '@/src/utils/exercises/generatedTranslationExercise';
import {
  scoreSingleFieldFormIdentificationAnswer,
  normalize,
  validateGeneratedFormIdentificationExercise,
  validateMultiAnswerStep,
  validatePartialMultiAnswerPaths,
} from '@/src/utils/exercises/generatedFormIdentificationExercise';
import { getAcceptedAnswersForStep } from '@/src/utils/exercises/formIdentificationHelpers';
import { validateMultipleChoiceExercise } from '@/src/utils/exercises/multipleChoiceExercise';
import {
  getSelectableMatchingAnswers,
  validateMatchingExercise,
} from '@/src/utils/exercises/matchingExercise';
import { validateFillExercise } from '@/src/utils/exercises/fillExercise';
import { validateOddOneOutExercise } from '@/src/utils/exercises/oddOneOutExercise';
import { validateTextSelectionExercise } from '@/src/utils/exercises/textSelectionExercise';
import { validateFillEmboldedTextExercise } from '@/src/utils/exercises/fillEmboldedTextExercise';
import { validateTableFillExercise } from '@/src/utils/exercises/tableFillExercise';
import { validateClickOnMultipleWords } from '@/src/utils/exercises/clickOnMultipleWords';
import type { TestEligibleExerciseType } from '@/src/lib/content/registry';
import { isAnswerForExercise, parseExerciseAnswer } from './answer-schemas';

export type ResolvedGeneratedItem =
  | GeneratedTranslationItem
  | FormIdentificationItem
  | MultiAnswerFormIdentificationItem
  | SingleFieldFormIdentificationItem;

export interface ExerciseGradingInput {
  exercise: Exercise;
  resolvedItems?: ResolvedGeneratedItem[];
}

export interface ExerciseScore {
  awardedPoints: number;
  maxPoints: number;
}

type ExerciseOfType<T extends TestEligibleExerciseType> = Extract<Exercise, { type: T }>;
type AnswerOfType<T extends ExerciseAnswer['type']> = Extract<ExerciseAnswer, { type: T }>;

const scoreFraction = (correct: number, total: number, maxPoints: number): ExerciseScore => ({
  awardedPoints: total > 0 ? (maxPoints * correct) / total : 0,
  maxPoints,
});

export const maxPointsFor = (exercise: Exercise): number => {
  if (!Number.isInteger(exercise.maxPoints) || (exercise.maxPoints ?? 0) <= 0) {
    throw new Error(`Exercise ${exercise.id} has invalid maxPoints`);
  }
  return exercise.maxPoints!;
};

export function gradeMatching(
  exercise: ExerciseOfType<'matching'>,
  answer: AnswerOfType<'matching'>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  const expected = Object.entries(getSelectableMatchingAnswers(exercise));
  const requiredRounds = exercise.data.requiredRepetitions ?? 1;
  if (!Number.isInteger(requiredRounds) || requiredRounds < 1 || requiredRounds > 10) {
    throw new Error(`Matching exercise ${exercise.id} has invalid requiredRepetitions`);
  }
  let correct = 0;

  for (let roundIndex = 0; roundIndex < requiredRounds; roundIndex += 1) {
    const round = answer.rounds[roundIndex] || {};
    correct += expected.filter(([leftId]) => {
      const left = exercise.data.leftColumn.find(item => item.id === leftId);
      const right = exercise.data.rightColumn.find(item => item.id === round[leftId]);
      return left && right ? validateMatchingExercise(left, right, exercise).isCorrect : false;
    }).length;
  }

  return scoreFraction(correct, expected.length * requiredRounds, maxPoints);
}

export function gradeFill(
  exercise: ExerciseOfType<'fill'>,
  answer: AnswerOfType<'fill'>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  const correct = exercise.data.items.filter(
    (_, index) => validateFillExercise(answer.answers[index] ?? '', exercise, index).isCorrect
  ).length;
  return scoreFraction(correct, exercise.data.items.length, maxPoints);
}

export function gradeMultipleChoice(
  exercise: ExerciseOfType<'multiple-choice'>,
  answer: AnswerOfType<'multiple-choice'>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  return scoreFraction(
    validateMultipleChoiceExercise(answer.selectedOptionIds, exercise).isCorrect ? 1 : 0,
    1,
    maxPoints
  );
}

export function gradeOddOneOut(
  exercise: ExerciseOfType<'odd-one-out'>,
  answer: AnswerOfType<'odd-one-out'>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  const result = validateOddOneOutExercise(answer.selectedItemId, answer.explanation, exercise);
  return scoreFraction(result.isCorrect ? 1 : 0, 1, maxPoints);
}

export function gradeTextSelection(
  exercise: ExerciseOfType<'text-selection'>,
  answer: AnswerOfType<'text-selection'>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  const correct = exercise.data.questions.filter(
    (_, index) => validateTextSelectionExercise(answer.selectedWordIndices[index], exercise, index).isCorrect
  ).length;
  return scoreFraction(correct, exercise.data.questions.length, maxPoints);
}

export function gradeFillEmboldedText(
  exercise: ExerciseOfType<'fill-embolded-text'>,
  answer: AnswerOfType<'fill-embolded-text'>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  const correct = exercise.data.words.filter(
    (_, index) => validateFillEmboldedTextExercise(answer.answers[index] ?? '', exercise, index).isCorrect
  ).length;
  return scoreFraction(correct, exercise.data.words.length, maxPoints);
}

export function gradeSentenceDiagramming(
  exercise: ExerciseOfType<'sentence-diagramming'>,
  answer: AnswerOfType<'sentence-diagramming'>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  const comparison = compareDiagramAnnotationSets(
    answer.annotations,
    exercise.data.solutionAnnotations,
    exercise.data.tokens
  );
  return scoreFraction(comparison.accuracy, 100, maxPoints);
}

export function gradeTableFill(
  exercise: ExerciseOfType<'table-fill'>,
  answer: AnswerOfType<'table-fill'>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  const result = validateTableFillExercise(answer.answers, exercise);
  return scoreFraction(result.correctAnswers, result.totalBlanks, maxPoints);
}

export function gradeClickOnMultipleWords(
  exercise: ExerciseOfType<'click-on-multiple-words'>,
  answer: AnswerOfType<'click-on-multiple-words'>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  const result = validateClickOnMultipleWords(new Set(answer.selectedWordIndices), exercise);
  return scoreFraction(result.score, 100, maxPoints);
}

export function gradeGeneratedTranslation(
  exercise: ExerciseOfType<'generated-translation'>,
  answer: AnswerOfType<'generated-translation'>,
  resolvedItems: GeneratedTranslationItem[],
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  const correct = resolvedItems.filter(
    (item, index) => validateGeneratedTranslationExercise(answer.answers[index] ?? '', item).isCorrect
  ).length;
  return scoreFraction(correct, resolvedItems.length, maxPoints);
}

export function gradeTranslationAssessment(
  exercise: ExerciseOfType<'translation-grading'>,
  scoresOutOfTen: number[]
): ExerciseScore {
  if (scoresOutOfTen.length !== exercise.data.items.length) {
    throw new Error(`Translation exercise ${exercise.id} has an invalid score count`);
  }
  if (scoresOutOfTen.some(score => !Number.isFinite(score) || score < 0 || score > 10)) {
    throw new Error(`Translation exercise ${exercise.id} has an invalid score`);
  }
  return scoreFraction(
    scoresOutOfTen.reduce((total, score) => total + score, 0),
    exercise.data.items.length * 10,
    maxPointsFor(exercise)
  );
}

const isSingleFieldItem = (item: ResolvedGeneratedItem): item is SingleFieldFormIdentificationItem =>
  'steps' in item && !('step' in item) && 'correctAnswerDisplay' in item;

const isMultiAnswerItem = (item: ResolvedGeneratedItem): item is MultiAnswerFormIdentificationItem =>
  'stepIndex' in item && 'expectedAnswerCount' in item;

const isStepItem = (item: ResolvedGeneratedItem): item is FormIdentificationItem =>
  'step' in item && 'acceptedAnswers' in item;

export function gradeGeneratedFormIdentification(
  exercise: ExerciseOfType<'generated-form-identification'>,
  answer: AnswerOfType<'generated-form-identification'>,
  resolvedItems: Array<FormIdentificationItem | MultiAnswerFormIdentificationItem | SingleFieldFormIdentificationItem>,
  maxPoints = maxPointsFor(exercise)
): ExerciseScore {
  let correctUnits = 0;
  let totalUnits = 0;

  if (exercise.data.mode === 'single-field') {
    for (const item of resolvedItems) {
      if (!isSingleFieldItem(item)) continue;
      const result = scoreSingleFieldFormIdentificationAnswer(answer.answers[item.id] ?? '', item);
      correctUnits += result.earnedUnits;
      totalUnits += result.availableUnits;
    }
    return scoreFraction(correctUnits, totalUnits, maxPoints);
  }

  if (exercise.data.requireAllPrimaryAnswers) {
    const groups = new Map<string, MultiAnswerFormIdentificationItem[]>();
    for (const item of resolvedItems) {
      if (!isMultiAnswerItem(item)) continue;
      groups.set(item.wordId, [...(groups.get(item.wordId) ?? []), item]);
    }

    for (const items of groups.values()) {
      const ordered = [...items].sort((a, b) => a.stepIndex - b.stepIndex);
      const slots: string[][] = [];
      for (const item of ordered) {
        totalUnits += 1;
        const step = validateMultiAnswerStep(answer.answers[item.id] ?? '', item);
        if (!step.isCorrect) continue;
        slots[item.stepIndex] = step.answerSlots;
        const completedItems = ordered.slice(0, item.stepIndex + 1);
        if (completedItems.some(entry => !slots[entry.stepIndex])) continue;
        const completedSlots = completedItems.map(entry => slots[entry.stepIndex]!);
        const completedSteps = completedItems.map(entry => entry.step);
        if (validatePartialMultiAnswerPaths(completedSlots, completedSteps, item.primaryFormPaths).isCorrect) {
          correctUnits += 1;
        }
      }
    }
    return scoreFraction(correctUnits, totalUnits, maxPoints);
  }

  const groups = new Map<string, FormIdentificationItem[]>();
  for (const item of resolvedItems) {
    if (!isStepItem(item)) continue;
    groups.set(item.wordId, [...(groups.get(item.wordId) ?? []), item]);
  }

  for (const items of groups.values()) {
    const firstItem = items[0];
    let compatiblePaths = [...firstItem.primaryFormPaths, ...firstItem.optionalFormPaths];

    for (const item of items) {
      totalUnits += 1;
      const submitted = normalize(answer.answers[item.id] ?? '');
      const pathsForStep = compatiblePaths.filter(path => Boolean(path[item.step]));
      if (pathsForStep.length === 0) {
        if (validateGeneratedFormIdentificationExercise(answer.answers[item.id] ?? '', item).isCorrect) {
          correctUnits += 1;
        }
        continue;
      }

      const matchingPaths = pathsForStep.filter(path => {
        const expected = path[item.step];
        return expected ? getAcceptedAnswersForStep(expected).map(normalize).includes(submitted) : false;
      });

      if (matchingPaths.length > 0) {
        correctUnits += 1;
        compatiblePaths = matchingPaths;
      }
    }
  }
  return scoreFraction(correctUnits, totalUnits, maxPoints);
}

function gradeExerciseAtPoints(input: ExerciseGradingInput, rawAnswer: unknown, maxPoints?: number): ExerciseScore {
  const answer = parseExerciseAnswer(rawAnswer);
  if (!isAnswerForExercise(answer, input.exercise.type)) {
    throw new Error(`Answer type ${answer.type} does not match exercise type ${input.exercise.type}`);
  }

  const exercise = input.exercise;
  switch (exercise.type) {
    case 'matching':
      return gradeMatching(exercise, answer as AnswerOfType<'matching'>, maxPoints);
    case 'fill':
      return gradeFill(exercise, answer as AnswerOfType<'fill'>, maxPoints);
    case 'multiple-choice':
      return gradeMultipleChoice(exercise, answer as AnswerOfType<'multiple-choice'>, maxPoints);
    case 'odd-one-out':
      return gradeOddOneOut(exercise, answer as AnswerOfType<'odd-one-out'>, maxPoints);
    case 'text-selection':
      return gradeTextSelection(exercise, answer as AnswerOfType<'text-selection'>, maxPoints);
    case 'fill-embolded-text':
      return gradeFillEmboldedText(exercise, answer as AnswerOfType<'fill-embolded-text'>, maxPoints);
    case 'sentence-diagramming':
      return gradeSentenceDiagramming(exercise, answer as AnswerOfType<'sentence-diagramming'>, maxPoints);
    case 'table-fill':
      return gradeTableFill(exercise, answer as AnswerOfType<'table-fill'>, maxPoints);
    case 'click-on-multiple-words':
      return gradeClickOnMultipleWords(exercise, answer as AnswerOfType<'click-on-multiple-words'>, maxPoints);
    case 'generated-translation':
      return gradeGeneratedTranslation(
        exercise,
        answer as AnswerOfType<'generated-translation'>,
        (input.resolvedItems ?? []) as GeneratedTranslationItem[],
        maxPoints
      );
    case 'generated-form-identification':
      return gradeGeneratedFormIdentification(
        exercise,
        answer as AnswerOfType<'generated-form-identification'>,
        (input.resolvedItems ?? []) as Array<
          FormIdentificationItem | MultiAnswerFormIdentificationItem | SingleFieldFormIdentificationItem
        >,
        maxPoints
      );
    case 'translation-grading':
      throw new Error('Translation grading requires an AI assessment score');
    default:
      throw new Error(`Exercise type ${(exercise as Exercise).type} is not eligible for tests`);
  }
}

export function gradeExercise(input: ExerciseGradingInput, rawAnswer: unknown): ExerciseScore {
  return gradeExerciseAtPoints(input, rawAnswer);
}

/** Uses the same grading path as server scoring without requiring lesson content to define maxPoints. */
export function gradeExercisePercentage(input: ExerciseGradingInput, rawAnswer: unknown): number {
  return gradeExerciseAtPoints(input, rawAnswer, 100).awardedPoints;
}
