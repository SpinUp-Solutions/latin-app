import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises';
import type { PartOfSpeech, PronounPerson, PronounType } from '@/shared/types/vocabulary/schemas/enums';
import { deriveParadigm } from '@/src/utils/paradigm';
import { buildLegacyParadigmConfigs } from '@/src/utils/exercises/legacyExerciseCompat';
import {
  deduplicatePathsBySteps,
  enrichPathsWithSteps,
  getAnswerableStepsForWord,
  getFallbackAnswerableStepsForWord,
} from '@/src/utils/exercises/formIdentificationHelpers';

export interface PreparedFormIdentificationWord {
  steps: ReturnType<typeof getAnswerableStepsForWord>;
  primary: Array<Record<string, string | undefined>>;
  optional: Array<Record<string, string | undefined>>;
}

const getPaths = (word: ExerciseWordResponse) => ({
  primary: (word.primary_form_paths || (word.form_path ? [word.form_path] : [])) as Array<
    Record<string, string | undefined>
  >,
  optional: (word.optional_form_paths || []) as Array<Record<string, string | undefined>>,
});

/**
 * Resolves the answerable steps and syncretic paths for a generated morphology
 * word. Returns null when the word cannot produce any identification item.
 */
export function prepareGeneratedFormIdentificationWord(
  exercise: GeneratedFormIdentificationExercise,
  word: ExerciseWordResponse
): PreparedFormIdentificationWord | null {
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
    return null;
  }

  const enrichedOptional = enrichPathsWithSteps(paths.optional, word, steps).filter(path =>
    steps.every(step => Boolean(path[step]))
  );

  const primary = deduplicatePathsBySteps(enrichedPrimary, steps);
  if (primary.length === 0) return null;

  return {
    steps,
    primary,
    optional: deduplicatePathsBySteps(enrichedOptional, steps),
  };
}
