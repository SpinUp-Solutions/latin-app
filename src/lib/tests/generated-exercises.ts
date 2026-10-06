import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { GeneratedFormIdentificationExercise, GeneratedTranslationExercise } from '@/src/types/exercises';
import type { GeneratedExercisePreviewRequest } from './generated-preview-schema';
import type {
  FormIdentificationItem,
  MultiAnswerFormIdentificationItem,
  SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import { hasSelectedForm, getExerciseDisplayForm } from '@/src/utils/exercises/formSelection';
import {
  splitTranslationAnswers,
  type GeneratedTranslationItem,
} from '@/src/utils/exercises/generatedTranslationExercise';
import { prepareGeneratedFormIdentificationWord } from '@/src/utils/exercises/formIdentificationPreparation';
import {
  extractStepValue,
  extractStepValuesFromPaths,
  filterPathsByPreviousAnswers,
  formatPrimaryAnswersDisplay,
  getAcceptedAnswersForMultipleValues,
  getAcceptedAnswersForStep,
  getDisplayForm,
  getHintForStep,
} from '@/src/utils/exercises/formIdentificationHelpers';

export type GeneratedExercise = GeneratedTranslationExercise | GeneratedFormIdentificationExercise;
export type ResolvedFormIdentificationItem =
  | FormIdentificationItem
  | MultiAnswerFormIdentificationItem
  | SingleFieldFormIdentificationItem;

export type ResolvedGeneratedItem = GeneratedTranslationItem | ResolvedFormIdentificationItem;

export type GeneratedWordLoader = (exercise: GeneratedExercise) => Promise<ExerciseWordResponse[]>;
export type GeneratedItemLoader = (exercise: GeneratedExercise) => Promise<ResolvedGeneratedItem[]>;

/** The word request a generated exercise sends, for lesson playback and authoring previews alike. */
export function generatedExerciseWordsRequest(exercise: GeneratedExercise): GeneratedExercisePreviewRequest {
  return exercise.type === 'generated-translation'
    ? {
        type: exercise.type,
        translationDirection: exercise.translationDirection || 'latin-to-english',
        data: exercise.data,
      }
    : { type: exercise.type, data: exercise.data };
}

export function isUsableGeneratedTranslationWord(
  exercise: GeneratedTranslationExercise,
  word: ExerciseWordResponse
): boolean {
  const translations = splitTranslationAnswers(word.translation);
  if (translations.length === 0) return false;
  if (exercise.translationDirection === 'english-to-latin') {
    return Boolean(word.root_word);
  }
  return getExerciseDisplayForm(word).trim().length > 0;
}

export function createGeneratedTranslationItems(
  exercise: GeneratedTranslationExercise,
  words: ExerciseWordResponse[]
): GeneratedTranslationItem[] {
  const direction = exercise.translationDirection || 'latin-to-english';

  return words.flatMap<GeneratedTranslationItem>(word => {
    if (!isUsableGeneratedTranslationWord(exercise, word)) return [];
    const translations = splitTranslationAnswers(word.translation);
    const hint = word.definitions?.length ? word.definitions.join(', ') : undefined;

    if (direction === 'english-to-latin') {
      return [
        {
          text: translations.join(', '),
          acceptedAnswers: [hasSelectedForm(word) ? word.selected_form : word.dictionary_entry || word.selected_form],
          hint,
          stripInfinitive: false,
          stripMacrons: true,
        },
      ];
    }

    return [{ text: getExerciseDisplayForm(word), acceptedAnswers: translations, hint, stripInfinitive: true }];
  });
}

export function createGeneratedFormIdentificationItems(
  exercise: GeneratedFormIdentificationExercise,
  words: ExerciseWordResponse[]
): ResolvedFormIdentificationItem[] {
  // A word can appear several times with different forms; each occurrence needs its own item IDs.
  const usableWords = makeWordIdsUnique(words).filter(word => getExerciseDisplayForm(word).trim().length > 0);

  if (exercise.data.mode === 'single-field') {
    return usableWords.flatMap<SingleFieldFormIdentificationItem>(word => {
      const paths = prepareGeneratedFormIdentificationWord(exercise, word);
      if (!paths) return [];

      const correctAnswerDisplay = paths.primary
        .map(path => paths.steps.map(step => (path[step] ? getDisplayForm(step, path[step]!) : '')).join(','))
        .filter(Boolean)
        .join(';');

      return [
        {
          id: word.id,
          wordId: word.id,
          word: word.root_word,
          root_word: word.root_word,
          dictionary_entry: word.dictionary_entry ?? null,
          selected_form: word.selected_form,
          hasSelectedForm: hasSelectedForm(word),
          steps: paths.steps,
          correctAnswerDisplay,
          hint: word.definitions?.join('; '),
          primaryFormPaths: paths.primary,
          optionalFormPaths: paths.optional,
        },
      ];
    });
  }

  if (exercise.data.requireAllPrimaryAnswers) {
    return usableWords.flatMap(word => {
      const paths = prepareGeneratedFormIdentificationWord(exercise, word);
      if (!paths) return [];
      return paths.steps.map((step, stepIndex) => ({
        id: `${word.id}-${step}`,
        wordId: word.id,
        word: word.root_word,
        root_word: word.root_word,
        dictionary_entry: word.dictionary_entry ?? null,
        selected_form: word.selected_form,
        hasSelectedForm: hasSelectedForm(word),
        step,
        steps: paths.steps,
        stepIndex,
        totalSteps: paths.steps.length,
        primaryFormPaths: paths.primary,
        optionalFormPaths: paths.optional,
        hint: word.definitions?.join('; '),
        expectedAnswerCount: paths.primary.length,
        correctAnswerDisplay: paths.primary
          .map(path => path[step])
          .filter(Boolean)
          .join(';'),
      }));
    });
  }

  return usableWords.flatMap(word => {
    const paths = prepareGeneratedFormIdentificationWord(exercise, word);
    if (!paths) return [];

    return paths.steps.map(step => {
      const answers = stepAnswers(paths.primary, paths.optional, step);
      const fallback = extractStepValue(word, step);

      return {
        id: `${word.id}-${step}`,
        wordId: word.id,
        word: word.root_word,
        root_word: word.root_word,
        dictionary_entry: word.dictionary_entry ?? null,
        selected_form: word.selected_form,
        hasSelectedForm: hasSelectedForm(word),
        step,
        ...(answers.acceptedAnswers.length
          ? answers
          : { correctAnswer: fallback, acceptedAnswers: getAcceptedAnswersForStep(step, fallback) }),
        hint: getHintForStep(word, step),
        primaryFormPaths: paths.primary,
        optionalFormPaths: paths.optional,
      };
    });
  });
}

/** A step's answers, taken from the form paths still consistent with the word's earlier answers. */
function stepAnswers(
  primary: FormIdentificationItem['primaryFormPaths'],
  optional: FormIdentificationItem['optionalFormPaths'],
  step: FormIdentificationItem['step']
) {
  return {
    correctAnswer: formatPrimaryAnswersDisplay(primary, step) || formatPrimaryAnswersDisplay(optional, step),
    acceptedAnswers: getAcceptedAnswersForMultipleValues(step, [
      ...extractStepValuesFromPaths(primary, step),
      ...extractStepValuesFromPaths(optional, step),
    ]),
  };
}

/**
 * Narrows a step to the forms consistent with the word's earlier correct answers: once "rosae" is
 * answered as genitive, only "singular" is accepted for its number. Practice and grading share it.
 */
export function narrowFormIdentificationItem(
  item: FormIdentificationItem,
  previousAnswers: Record<string, string>
): FormIdentificationItem {
  // Nothing to narrow yet; test deliveries also strip the paths from their items.
  if (Object.keys(previousAnswers).length === 0) return item;
  const primaryFormPaths = filterPathsByPreviousAnswers(item.primaryFormPaths, previousAnswers);
  const optionalFormPaths = filterPathsByPreviousAnswers(item.optionalFormPaths, previousAnswers);
  const answers = stepAnswers(primaryFormPaths, optionalFormPaths, item.step);
  // A step no remaining path answers keeps the answer it was built with.
  return answers.acceptedAnswers.length ? { ...item, primaryFormPaths, optionalFormPaths, ...answers } : item;
}

/** The one words→items step every mode shares: lesson playback, admin previews and frozen test delivery. */
export function createGeneratedExerciseItems(
  exercise: GeneratedExercise,
  words: ExerciseWordResponse[]
): ResolvedGeneratedItem[] {
  return exercise.type === 'generated-translation'
    ? createGeneratedTranslationItems(exercise, words)
    : createGeneratedFormIdentificationItems(exercise, words);
}

export async function resolveGeneratedExerciseItems(exercise: GeneratedExercise, loadWords: GeneratedWordLoader) {
  return createGeneratedExerciseItems(exercise, await loadWords(exercise));
}

export const isGeneratedExercise = (item: { type: string }): item is GeneratedExercise =>
  item.type === 'generated-translation' || item.type === 'generated-form-identification';

/** Resolves every generated exercise concurrently, keyed by exercise ID in authored order. */
export async function resolveGeneratedExercises(exercises: GeneratedExercise[], loadItems: GeneratedItemLoader) {
  const entries = await Promise.all(
    exercises.map(async exercise => {
      const items = await loadItems(exercise);
      if (items.length === 0) throw new Error(`Generated exercise ${exercise.id} did not resolve any items`);
      return [exercise.id, { items }] as const;
    })
  );
  return Object.fromEntries(entries);
}

function makeWordIdsUnique(words: ExerciseWordResponse[]): ExerciseWordResponse[] {
  const usedIds = new Set<string>();
  // Resume each base ID's suffix search where its previous repeat stopped.
  const nextOccurrence = new Map<string, number>();

  return words.map(word => {
    const baseId = word.id;
    let uniqueId = baseId;
    let occurrence = nextOccurrence.get(baseId) ?? 2;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${baseId}::${occurrence}`;
      occurrence += 1;
    }
    nextOccurrence.set(baseId, occurrence);
    usedIds.add(uniqueId);
    return uniqueId === baseId ? word : { ...word, id: uniqueId };
  });
}
