import type { Firestore } from 'firebase-admin/firestore';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { PARADIGM_POS_GROUP, PARADIGM_TABLE_TYPE } from '@/src/config/paradigmDefinitions';
import type { GeneratorFilters } from '@/src/types/exercises/base';
import type { FormParadigm, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import {
  buildLegacyParadigmConfigs,
  buildLegacyPosConfigs,
  normalizeCollection,
} from '@/src/utils/exercises/legacyExerciseCompat';
import type { GeneratedExercise, GeneratedWordLoader } from './generated-exercises';
import {
  applyValueFilter,
  collectGeneratedExerciseWords,
  GeneratedVocabularySourceError,
  type CollectGeneratedExerciseWordsResult,
  type WordQuerySpec,
} from './generated-word-composition.server';

export { applyValueFilter, GeneratedVocabularySourceError };
export type { WordQuerySpec };

export function requireGeneratedVocabularyCollection(collection?: string): string {
  if (!collection || collection === VOCABULARY_WORDS_COLLECTION) return VOCABULARY_WORDS_COLLECTION;
  if (/^vocabulary_words_v\d+$/.test(collection)) return VOCABULARY_WORDS_COLLECTION;
  throw new GeneratedVocabularySourceError('Generated exercises must use the configured vocabulary collection');
}

const getParadigmConfigs = (
  exercise: Extract<GeneratedExercise, { type: 'generated-form-identification' }>
): ParadigmConfigs => {
  const config = exercise.data.generatorConfig;
  return Object.keys(exercise.data.paradigmConfigs || {}).length
    ? exercise.data.paradigmConfigs
    : buildLegacyParadigmConfigs(config as Parameters<typeof buildLegacyParadigmConfigs>[0]);
};

const getQuerySpecs = (exercise: GeneratedExercise): WordQuerySpec[] => {
  if (exercise.type === 'generated-translation') {
    const config = exercise.data.generatorConfig;
    const posConfigs = Object.keys(exercise.data.posConfigs || {}).length
      ? exercise.data.posConfigs
      : buildLegacyPosConfigs(config as Parameters<typeof buildLegacyPosConfigs>[0]);
    return Object.entries(posConfigs)
      .filter(([, value]) => value?.enabled)
      .map(([partOfSpeech, value]) => ({
        id: partOfSpeech,
        partOfSpeech,
        filters: value!.filters,
        formSelection: value!.formSelection,
        tableType: deriveTableTypeFromPOS(partOfSpeech, value!.filters.pronounType, value!.filters.pronounPerson),
      }));
  }

  const paradigmConfigs = getParadigmConfigs(exercise);

  return Object.entries(paradigmConfigs)
    .filter((entry): entry is [FormParadigm, NonNullable<(typeof entry)[1]>] => entry[1]?.enabled === true)
    .map(([paradigm, value]) => {
      const filters: Omit<GeneratorFilters, 'partOfSpeech'> = { ...value.filters };
      if (paradigm === 'pronoun-personal') {
        filters.pronounType = 'personal';
        filters.pronounPerson = '1st,2nd';
      } else if (paradigm === 'pronoun-gendered' && filters.pronounType === 'personal') {
        filters.pronounPerson = '3rd';
      }
      return {
        id: paradigm,
        paradigm,
        partOfSpeech: PARADIGM_POS_GROUP[paradigm],
        filters,
        formSelection: value.formSelection,
        tableType: PARADIGM_TABLE_TYPE[paradigm],
        steps: value.steps,
      };
    });
};

export async function collectWordsForGeneratedExerciseRequest(
  db: Firestore,
  exercise: GeneratedExercise,
  options?: { rng?: () => number }
): Promise<CollectGeneratedExerciseWordsResult> {
  const config = exercise.data.generatorConfig;
  const collection = requireGeneratedVocabularyCollection(
    normalizeCollection(config.collection || VOCABULARY_WORDS_COLLECTION)
  );
  const poolId = config.wordSource === 'pool' ? config.poolId : null;
  return collectGeneratedExerciseWords({
    db,
    collection,
    specs: getQuerySpecs(exercise),
    count: config.count || 'all',
    exercise,
    poolId,
    poolWordLimit: config.poolWordLimit,
    rng: options?.rng,
    paradigmConfigs: exercise.type === 'generated-form-identification' ? getParadigmConfigs(exercise) : {},
  });
}

export function createFirestoreGeneratedWordLoader(
  db: Firestore,
  options?: { rng?: () => number }
): GeneratedWordLoader {
  return async exercise => {
    const result = await collectWordsForGeneratedExerciseRequest(db, exercise, options);
    return result.words;
  };
}
