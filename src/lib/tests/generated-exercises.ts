import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { GeneratedFormIdentificationExercise, GeneratedTranslationExercise } from '@/src/types/exercises';
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

export type GeneratedWordLoader = (exercise: GeneratedExercise) => Promise<ExerciseWordResponse[]>;

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
  words: ExerciseWordResponse[],
  previousAnswers: Record<string, Record<string, string>> = {}
): ResolvedFormIdentificationItem[] {
  const usableWords = words.filter(word => getExerciseDisplayForm(word).trim().length > 0);

  if (exercise.data.mode === 'single-field') {
    return usableWords.flatMap<SingleFieldFormIdentificationItem>(word => {
      const paths = prepareGeneratedFormIdentificationWord(exercise, word);
      if (!paths) return [];

      const correctAnswerDisplay = paths.primary
        .map(path => paths.steps.map(step => (path[step] ? getDisplayForm(path[step]!) : '')).join(','))
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
    const answered = previousAnswers[word.id] || {};

    return paths.steps.map(step => {
      const primary = filterPathsByPreviousAnswers(paths.primary, answered);
      const optional = filterPathsByPreviousAnswers(paths.optional, answered);
      const allValues = Array.from(
        new Set([...extractStepValuesFromPaths(primary, step), ...extractStepValuesFromPaths(optional, step)])
      );
      const correctAnswer =
        formatPrimaryAnswersDisplay(primary, step) ||
        formatPrimaryAnswersDisplay(optional, step) ||
        extractStepValue(word, step);
      const acceptedAnswers = getAcceptedAnswersForMultipleValues(allValues);

      return {
        id: `${word.id}-${step}`,
        wordId: word.id,
        word: word.root_word,
        root_word: word.root_word,
        dictionary_entry: word.dictionary_entry ?? null,
        selected_form: word.selected_form,
        hasSelectedForm: hasSelectedForm(word),
        step,
        correctAnswer,
        acceptedAnswers: acceptedAnswers.length ? acceptedAnswers : getAcceptedAnswersForStep(correctAnswer),
        hint: getHintForStep(word, step),
        primaryFormPaths: primary,
        optionalFormPaths: optional,
      };
    });
  });
}

export async function resolveGeneratedExerciseItems(exercise: GeneratedExercise, loadWords: GeneratedWordLoader) {
  const words = await loadWords(exercise);
  return exercise.type === 'generated-translation'
    ? createGeneratedTranslationItems(exercise, words)
    : createGeneratedFormIdentificationItems(exercise, makeWordIdsUnique(words));
}

function makeWordIdsUnique(words: ExerciseWordResponse[]): ExerciseWordResponse[] {
  const usedIds = new Set<string>();

  return words.map(word => {
    const baseId = word.id;
    let uniqueId = baseId;
    let occurrence = 2;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${baseId}::${occurrence}`;
      occurrence += 1;
    }
    usedIds.add(uniqueId);
    return uniqueId === baseId ? word : { ...word, id: uniqueId };
  });
}
