import { useMemo } from 'react';
import { composeSelectFields } from '@/src/utils/generated/selectComposer';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { getExerciseAdditionalFields, type GeneratedExerciseType } from '@/src/config/exerciseSelectFields';
import type { GeneratorConfigBase } from '@/src/types/exercises/base';

export const useGeneratedExerciseQuery = (
  exerciseType: GeneratedExerciseType,
  config: GeneratorConfigBase,
  limit?: number
) => {
  const additionalFields = useMemo(() => getExerciseAdditionalFields(exerciseType), [exerciseType]);

  const selectFields = useMemo(
    () => composeSelectFields(additionalFields, { formSelection: config.formSelection }),
    [additionalFields, config.formSelection]
  );

  const tableType = useMemo(() => deriveTableTypeFromPOS(config.filters.partOfSpeech), [config.filters.partOfSpeech]);

  const queryArgs = useMemo(
    () => ({
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
    }),
    [config, selectFields, tableType, limit]
  );

  return { queryArgs, selectFields, tableType };
};
