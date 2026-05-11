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

export type EnsuredGeneratorConfig = GeneratorConfigBase & {
  filters: GeneratorFilters;
  poolId: string | null;
  poolWordLimit: number | null;
};

export const DEFAULT_GENERATOR_CONFIG: EnsuredGeneratorConfig = {
  collection: '',
  wordSource: 'filters',
  poolId: null,
  poolWordLimit: null,
  count: 5,
  filters: { partOfSpeech: 'all' },
};

export const ensureGeneratorConfig = (config?: Partial<GeneratorConfigBase>): EnsuredGeneratorConfig => {
  return {
    ...DEFAULT_GENERATOR_CONFIG,
    ...config,
    poolId: config?.poolId ?? null,
    poolWordLimit: config?.poolWordLimit ?? null,
    filters: config?.filters ?? { partOfSpeech: 'all' },
  };
};
