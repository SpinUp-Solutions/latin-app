import type { Exercise } from '@/src/types/exercises';
import type { RenderableContentItem } from '@/src/types/page';
import type { StudentTestDelivery, TestAttemptDeliveryState, TestVersion } from '@/src/types/test';
import { isExerciseType, isTestEligibleExerciseType } from '@/src/lib/content/registry';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { GeneratedWordLoader } from './generated-exercises';
import { resolveGeneratedExerciseItems } from './generated-exercises';
import type { GeneratedTranslationItem } from '@/src/utils/exercises/generatedTranslationExercise';
import { gradeExercise, maxPointsFor, type ExerciseScore, type ResolvedGeneratedItem } from './grading';

export interface FrozenTestDeliveryState extends TestAttemptDeliveryState {
  resolvedExercises: Record<string, { items: ResolvedGeneratedItem[] }>;
}

export interface GradedExerciseResult extends ExerciseScore {
  exerciseId: string;
  title: string;
}

export interface FrozenDeliveryScore {
  awardedPoints: number;
  maxPoints: number;
  exerciseResults: GradedExerciseResult[];
}

const cloneSerializable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function createFrozenTestDeliveryState(
  version: TestVersion,
  loadGeneratedWords: GeneratedWordLoader
): Promise<FrozenTestDeliveryState> {
  const pages = cloneSerializable(version.pages);
  const resolvedExercises: FrozenTestDeliveryState['resolvedExercises'] = {};

  for (const page of pages) {
    for (const item of page.items) {
      if (item.type !== 'generated-translation' && item.type !== 'generated-form-identification') continue;
      const items = await resolveGeneratedExerciseItems(item, loadGeneratedWords);
      if (items.length === 0) throw new Error(`Generated exercise ${item.id} did not resolve any items`);
      resolvedExercises[item.id] = { items: cloneSerializable(items as ResolvedGeneratedItem[]) };
    }
  }

  return { versionId: version.id, pages, resolvedExercises };
}

const withoutKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

function sanitizeExercise(exercise: Exercise): Record<string, unknown> {
  const base = { ...exercise, feedbackConfig: undefined } as Record<string, unknown>;
  const data = exercise.data as unknown as Record<string, unknown>;

  switch (exercise.type) {
    case 'matching':
      return {
        ...base,
        data: {
          ...withoutKeys(data, ['answers', 'hint']),
          expectedMatchCount: Object.keys(exercise.data.answers).length,
        },
      };
    case 'fill':
      return {
        ...base,
        data: { ...data, items: exercise.data.items.map(item => withoutKeys(item, ['answer', 'hint', 'explanation'])) },
      };
    case 'multiple-choice':
      return {
        ...base,
        data: {
          ...data,
          allowMultipleSelections:
            exercise.data.allowMultipleSelections || exercise.data.options.filter(option => option.isCorrect).length > 1,
          options: exercise.data.options.map(option =>
            withoutKeys(option as unknown as Record<string, unknown>, ['isCorrect'])
          ),
          hint: undefined,
          explanation: undefined,
        },
      };
    case 'odd-one-out':
      return {
        ...base,
        data: {
          ...data,
          items: exercise.data.items.map(item =>
            withoutKeys(item as unknown as Record<string, unknown>, ['isOddOneOut'])
          ),
          hint: undefined,
          explanation: undefined,
        },
      };
    case 'text-selection':
      return {
        ...base,
        data: {
          ...data,
          questions: exercise.data.questions.map(question =>
            withoutKeys(question as unknown as Record<string, unknown>, ['correctWordIndex', 'hint', 'explanation'])
          ),
        },
      };
    case 'fill-embolded-text':
      return {
        ...base,
        data: {
          ...data,
          words: exercise.data.words.map(word => withoutKeys(word, ['correctAnswer', 'hint', 'explanation'])),
        },
      };
    case 'sentence-diagramming':
      return { ...base, data: withoutKeys(data, ['solutionAnnotations', 'hint', 'explanation']) };
    case 'table-fill':
      return {
        ...base,
        data: {
          ...data,
          rows: exercise.data.rows.map(row => ({
            ...row,
            cells: Object.fromEntries(
              Object.entries(row.cells).map(([key, cell]) => [
                key,
                withoutKeys(cell as unknown as Record<string, unknown>, ['answer']),
              ])
            ),
          })),
          hint: undefined,
          explanation: undefined,
        },
      };
    case 'click-on-multiple-words':
      return { ...base, data: withoutKeys(data, ['correctWordIndices', 'minimumCorrect', 'hint', 'explanation']) };
    case 'generated-translation':
    case 'generated-form-identification':
      return { ...base, data: withoutKeys(data, ['generatorConfig', 'posConfigs', 'paradigmConfigs']) };
    default:
      throw new Error(`Exercise type ${exercise.type} is not eligible for test delivery`);
  }
}

function sanitizeContentItem(item: RenderableContentItem): unknown {
  if (!isExerciseType(item.type)) return item;
  if (!isTestEligibleExerciseType(item.type))
    throw new Error(`Exercise type ${item.type} is not eligible for test delivery`);
  return sanitizeExercise(item as Exercise);
}

function sanitizeResolvedItem(item: ResolvedGeneratedItem): unknown {
  if ('wordId' in item && 'acceptedAnswers' in item) {
    return {
      ...withoutKeys(item as unknown as Record<string, unknown>, [
        'acceptedAnswers',
        'correctAnswer',
        'hint',
        'primaryFormPaths',
        'optionalFormPaths',
      ]),
      expectedAnswerCount: 1,
    };
  }
  if ('wordId' in item && 'correctAnswerDisplay' in item) {
    return {
      ...withoutKeys(item as unknown as Record<string, unknown>, [
        'correctAnswerDisplay',
        'hint',
        'primaryFormPaths',
        'optionalFormPaths',
      ]),
      expectedAnswerCount: 'expectedAnswerCount' in item ? item.expectedAnswerCount : item.primaryFormPaths.length,
    };
  }
  return withoutKeys(item as unknown as GeneratedTranslationItem as unknown as Record<string, unknown>, [
    'acceptedAnswers',
    'hint',
  ]);
}

export function sanitizeTestDeliveryState(state: FrozenTestDeliveryState): StudentTestDelivery {
  return {
    versionId: state.versionId,
    pages: state.pages.map(page => ({ ...page, items: page.items.map(sanitizeContentItem) })),
    resolvedExercises: Object.fromEntries(
      Object.entries(state.resolvedExercises).map(([exerciseId, resolved]) => [
        exerciseId,
        { items: resolved.items.map(sanitizeResolvedItem) },
      ])
    ),
  };
}

export function gradeFrozenTestDelivery(
  state: FrozenTestDeliveryState,
  answers: Record<string, ExerciseAnswer | unknown>
): FrozenDeliveryScore {
  const exerciseResults: GradedExerciseResult[] = [];

  for (const page of state.pages) {
    for (const item of page.items) {
      if (!isExerciseType(item.type)) continue;
      if (!isTestEligibleExerciseType(item.type))
        throw new Error(`Exercise type ${item.type} is not eligible for tests`);

      const exercise = item as Exercise;
      const rawAnswer = answers[exercise.id];
      const score =
        rawAnswer === undefined
          ? { awardedPoints: 0, maxPoints: maxPointsFor(exercise) }
          : gradeExercise({ exercise, resolvedItems: state.resolvedExercises[exercise.id]?.items }, rawAnswer);

      exerciseResults.push({ exerciseId: exercise.id, title: exercise.title || exercise.type, ...score });
    }
  }

  return {
    awardedPoints: exerciseResults.reduce((total, result) => total + result.awardedPoints, 0),
    maxPoints: exerciseResults.reduce((total, result) => total + result.maxPoints, 0),
    exerciseResults,
  };
}
