import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { GeneratedFormIdentificationExercise, GeneratedTranslationExercise } from '@/src/types/exercises';
import type {
  FormIdentificationItem,
  MultiAnswerFormIdentificationItem,
  SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import type { PartOfSpeech, PronounPerson, PronounType } from '@/shared/types/vocabulary/schemas/enums';
import { deriveParadigm } from '@/src/utils/paradigm';
import { hasSelectedForm, getExerciseDisplayForm } from '@/src/utils/exercises/formSelection';
import {
  splitTranslationAnswers,
  type GeneratedTranslationItem,
} from '@/src/utils/exercises/generatedTranslationExercise';
import {
  deduplicatePathsBySteps,
  enrichPathsWithSteps,
  extractStepValue,
  extractStepValuesFromPaths,
  filterPathsByPreviousAnswers,
  formatPrimaryAnswersDisplay,
  getAcceptedAnswersForMultipleValues,
  getAcceptedAnswersForStep,
  getAnswerableStepsForWord,
  getDisplayForm,
  getHintForStep,
} from '@/src/utils/exercises/formIdentificationHelpers';

export type GeneratedExercise = GeneratedTranslationExercise | GeneratedFormIdentificationExercise;
export type ResolvedFormIdentificationItem =
  | FormIdentificationItem
  | MultiAnswerFormIdentificationItem
  | SingleFieldFormIdentificationItem;

export type GeneratedWordLoader = (exercise: GeneratedExercise) => Promise<ExerciseWordResponse[]>;

const getPaths = (word: ExerciseWordResponse) => ({
  primary: (word.primary_form_paths || (word.form_path ? [word.form_path] : [])) as Array<
    Record<string, string | undefined>
  >,
  optional: (word.optional_form_paths || []) as Array<Record<string, string | undefined>>,
});

const getPreparedPaths = (exercise: GeneratedFormIdentificationExercise, word: ExerciseWordResponse) => {
  const data = word as Record<string, unknown>;
  const paradigm = deriveParadigm(
    word.part_of_speech as PartOfSpeech,
    data.pronoun_type as PronounType | undefined,
    data.person as PronounPerson | undefined
  );
  const config = paradigm ? exercise.data.paradigmConfigs?.[paradigm] : undefined;
  const paths = getPaths(word);
  const steps = getAnswerableStepsForWord(word, config?.steps || [], paths.primary);
  return {
    steps,
    primary: deduplicatePathsBySteps(enrichPathsWithSteps(paths.primary, word, steps), steps),
    optional: deduplicatePathsBySteps(enrichPathsWithSteps(paths.optional, word, steps), steps),
  };
};

export function createGeneratedTranslationItems(
  exercise: GeneratedTranslationExercise,
  words: ExerciseWordResponse[]
): GeneratedTranslationItem[] {
  const direction = exercise.translationDirection || 'latin-to-english';

  return words.flatMap<GeneratedTranslationItem>(word => {
    const translations = splitTranslationAnswers(word.translation);
    const hint = word.definitions?.length ? word.definitions.join(', ') : undefined;

    if (direction === 'english-to-latin') {
      if (translations.length === 0 || !word.root_word) return [];
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

    if (translations.length === 0) return [];
    return [{ text: getExerciseDisplayForm(word), acceptedAnswers: translations, hint, stripInfinitive: true }];
  });
}

export function createGeneratedFormIdentificationItems(
  exercise: GeneratedFormIdentificationExercise,
  words: ExerciseWordResponse[],
  previousAnswers: Record<string, Record<string, string>> = {}
): ResolvedFormIdentificationItem[] {
  if (exercise.data.mode === 'single-field') {
    return words.map(word => {
      const paths = getPreparedPaths(exercise, word);
      const correctAnswerDisplay = paths.primary
        .map(path => paths.steps.map(step => (path[step] ? getDisplayForm(path[step]!) : '')).join(','))
        .filter(Boolean)
        .join(';');

      return {
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
      };
    });
  }

  if (exercise.data.requireAllPrimaryAnswers) {
    return words.flatMap(word => {
      const paths = getPreparedPaths(exercise, word);
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
        correctAnswerDisplay: extractStepValuesFromPaths(paths.primary, step).join(';'),
      }));
    });
  }

  return words.flatMap(word => {
    const paths = getPreparedPaths(exercise, word);
    const answered = previousAnswers[word.id] || {};

    return paths.steps.map(step => {
      const primary = filterPathsByPreviousAnswers(paths.primary, answered);
      const optional = filterPathsByPreviousAnswers(paths.optional, answered);
      const allValues = Array.from(
        new Set([...extractStepValuesFromPaths(primary, step), ...extractStepValuesFromPaths(optional, step)])
      );
      const correctAnswer = formatPrimaryAnswersDisplay(primary, step) || extractStepValue(word, step);
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
