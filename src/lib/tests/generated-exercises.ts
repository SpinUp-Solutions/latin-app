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
import { buildLegacyParadigmConfigs } from '@/src/utils/exercises/legacyExerciseCompat';
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
  getFallbackAnswerableStepsForWord,
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
  const paradigmConfigs =
    exercise.data.paradigmConfigs && Object.keys(exercise.data.paradigmConfigs).length > 0
      ? exercise.data.paradigmConfigs
      : buildLegacyParadigmConfigs(exercise.data.generatorConfig as Parameters<typeof buildLegacyParadigmConfigs>[0]);
  const config = paradigm ? paradigmConfigs[paradigm] : undefined;
  const paths = getPaths(word);
  const configuredSteps = config?.steps || [];
  let candidateSteps = getAnswerableStepsForWord(word, configuredSteps, paths.primary);
  const preferredPath = (word.form_path || paths.primary[0]) as Record<string, string | undefined> | undefined;

  // A selected path can be answerable even when a syncretic alternative in
  // `primary_form_paths` cannot answer any of the same questions (for example
  // a finite form and a gerund with the same spelling). Fall back to the
  // selected interpretation and discard incompatible alternatives below.
  if (candidateSteps.length === 0) {
    candidateSteps = getFallbackAnswerableStepsForWord(word, configuredSteps, preferredPath);
  }

  let enrichedPrimary = enrichPathsWithSteps(paths.primary, word, candidateSteps);
  const steps = candidateSteps.filter(
    step => enrichedPrimary.length > 0 && enrichedPrimary.some(path => Boolean(path[step]))
  );

  if (steps.length > 0) {
    enrichedPrimary = enrichedPrimary.filter(path => steps.every(step => Boolean(path[step])));
  }

  // Older responses may omit `primary_form_paths` while still carrying the
  // selected `form_path`; preserve that selected path as the answer key.
  if (enrichedPrimary.length === 0 && preferredPath && steps.length > 0) {
    enrichedPrimary = enrichPathsWithSteps([preferredPath], word, steps).filter(path =>
      steps.every(step => Boolean(path[step]))
    );
  }

  if (steps.length === 0) {
    return { steps, primary: [], optional: [] };
  }

  const enrichedOptional = enrichPathsWithSteps(paths.optional, word, steps).filter(path =>
    steps.every(step => Boolean(path[step]))
  );

  return {
    steps,
    primary: deduplicatePathsBySteps(enrichedPrimary, steps),
    optional: deduplicatePathsBySteps(enrichedOptional, steps),
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
  const usableWords = words.filter(word => getExerciseDisplayForm(word).trim().length > 0);

  if (exercise.data.mode === 'single-field') {
    return usableWords.flatMap<SingleFieldFormIdentificationItem>(word => {
      const paths = getPreparedPaths(exercise, word);
      if (paths.steps.length === 0 || paths.primary.length === 0) return [];

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
        correctAnswerDisplay: paths.primary
          .map(path => path[step])
          .filter(Boolean)
          .join(';'),
      }));
    });
  }

  return usableWords.flatMap(word => {
    const paths = getPreparedPaths(exercise, word);
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
