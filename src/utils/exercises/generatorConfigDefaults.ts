import type { GeneratorConfigBase, GeneratorFilters } from '@/src/types/exercises/base';

export const DEFAULT_POS_FILTERS: Omit<GeneratorFilters, 'partOfSpeech'> = {
  search: '',
  verbConjugation: 'all',
  isDeponent: 'both',
  nounDeclension: 'all',
  adjectiveDeclension: 'all',
  pronounType: 'all',
  pronounPerson: 'all',
};

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfigBase = {
  collection: '',
  wordSource: 'filters',
  poolId: null,
  count: 5,
};

export const ensureGeneratorConfig = (config?: Partial<GeneratorConfigBase>): GeneratorConfigBase => {
  return {
    ...DEFAULT_GENERATOR_CONFIG,
    ...config,
    poolId: config?.poolId ?? null,
  };
};
