import type { GeneratorConfigBase, GeneratorFilters } from '@/src/types/exercises/base';

const DEFAULT_FILTERS: GeneratorFilters = {
  partOfSpeech: 'all',
  search: '',
  verbConjugation: 'all',
  isDeponent: 'both',
  nounDeclension: 'all',
  adjectiveDeclension: 'all',
};

const DEFAULT_GENERATOR_CONFIG: GeneratorConfigBase = {
  collection: '',
  wordSource: 'filters',
  filters: DEFAULT_FILTERS,
  poolId: null,
  formSelection: undefined,
  count: 5,
};

export const normalizeGeneratorConfig = (config?: GeneratorConfigBase): GeneratorConfigBase => {
  const filters: GeneratorFilters = {
    ...DEFAULT_FILTERS,
    ...(config?.filters ?? {}),
  };

  return {
    ...DEFAULT_GENERATOR_CONFIG,
    ...config,
    filters,
    poolId: config?.poolId ?? null,
  };
};

export const mergeGeneratorConfig = (
  currentConfig: GeneratorConfigBase | undefined,
  updates: Partial<GeneratorConfigBase>
): GeneratorConfigBase => {
  const baseConfig = currentConfig ?? DEFAULT_GENERATOR_CONFIG;
  const mergedFilters =
    updates.filters !== undefined ? { ...baseConfig.filters, ...updates.filters } : baseConfig.filters;

  return {
    ...baseConfig,
    ...updates,
    filters: mergedFilters,
  };
};
