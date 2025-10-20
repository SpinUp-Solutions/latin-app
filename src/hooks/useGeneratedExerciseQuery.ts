import { useMemo } from 'react';
import { composeSelectFields } from '@/src/utils/generated/selectComposer';
import { getExerciseAdditionalFields, type GeneratedExerciseType } from '@/src/config/exerciseSelectFields';
import type { GeneratorConfigBase } from '@/src/types/exercises/base';

const PART_OF_SPEECH_TO_TABLE_TYPE = {
  verb: 'conjugation',
  noun: 'declension',
  adjective: 'adjective-declension',
} as const;

export const deriveTableType = (partOfSpeech?: string): 'conjugation' | 'declension' | 'adjective-declension' | undefined => {
  if (!partOfSpeech || partOfSpeech === 'all') return undefined;
  return PART_OF_SPEECH_TO_TABLE_TYPE[partOfSpeech as keyof typeof PART_OF_SPEECH_TO_TABLE_TYPE];
};

export const useGeneratedExerciseQuery = (
  exerciseType: GeneratedExerciseType,
  config: GeneratorConfigBase,
  limit?: number
) => {
  const additionalFields = useMemo(
    () => getExerciseAdditionalFields(exerciseType),
    [exerciseType]
  );

  const selectFields = useMemo(
    () => composeSelectFields(additionalFields, { formSelection: config.formSelection }),
    [additionalFields, config.formSelection]
  );

  const tableType = useMemo(
    () => deriveTableType(config.filters.partOfSpeech),
    [config.filters.partOfSpeech]
  );

  const queryArgs = useMemo(() => ({
    collection: config.collection,
    partOfSpeech: config.filters.partOfSpeech,
    search: config.filters.search,
    verbConjugation: config.filters.verbConjugation,
    isDeponent: config.filters.isDeponent,
    nounDeclension: config.filters.nounDeclension,
    adjectiveDeclension: config.filters.adjectiveDeclension,
    cellPaths: config.formSelection?.selectedCellPaths || [],
    tableType,
    limit: limit ?? config.count,
    select: selectFields,
  }), [config, selectFields, tableType, limit]);

  return { queryArgs, selectFields, tableType };
};
