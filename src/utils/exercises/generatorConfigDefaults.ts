import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import { PARADIGM_RELEVANT_FILTERS } from '@/src/config/paradigmDefinitions';
import type { GeneratorConfigBase, GeneratorFilters } from '@/src/types/exercises/base';
import type { FormParadigm } from '@/src/types/exercises/paradigm';

export type PosFilterKey = keyof Omit<GeneratorFilters, 'partOfSpeech'>;

export const DEFAULT_POS_FILTERS: Omit<GeneratorFilters, 'partOfSpeech'> = {
  search: '',
  verbConjugation: 'all',
  isDeponent: 'both',
  nounDeclension: 'all',
  adjectiveDeclension: 'all',
  pronounType: 'all',
  pronounPerson: 'all',
};

const POS_RELEVANT_FILTERS: Readonly<Record<PartOfSpeech, readonly PosFilterKey[]>> = {
  verb: ['verbConjugation', 'isDeponent', 'search'],
  noun: ['nounDeclension', 'search'],
  adjective: ['adjectiveDeclension', 'search'],
  pronoun: ['pronounType', 'pronounPerson', 'search'],
  adverb: ['search'],
  preposition: ['search'],
  conjunction: ['search'],
  interjection: ['search'],
};

const isActivePosFilterValue = (key: PosFilterKey, value: unknown): boolean => {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (key === 'search') return true;
  if (key === 'isDeponent') return value === 'true' || value === 'false';
  return value !== 'all' && value !== 'both' && value.split(',').some(part => part.trim().length > 0);
};

export const getActiveParadigmFilterKeys = (
  paradigm: FormParadigm,
  filters?: Omit<GeneratorFilters, 'partOfSpeech'>
): PosFilterKey[] => {
  if (!filters) return [];
  return PARADIGM_RELEVANT_FILTERS[paradigm].filter(key => isActivePosFilterValue(key, filters[key]));
};

export const getActivePosFilterKeys = (
  partOfSpeech: PartOfSpeech,
  filters?: Omit<GeneratorFilters, 'partOfSpeech'>
): PosFilterKey[] => {
  if (!filters) return [];
  return POS_RELEVANT_FILTERS[partOfSpeech].filter(key => isActivePosFilterValue(key, filters[key]));
};

export const formatActiveFilterSummary = (
  keys: readonly PosFilterKey[],
  filters?: Omit<GeneratorFilters, 'partOfSpeech'>
): string => {
  if (!filters || keys.length === 0) return '';
  return keys
    .map(key => {
      const value = filters[key] ?? '';
      switch (key) {
        case 'search':
          return `Search ("${value}")`;
        case 'verbConjugation':
          return `Conjugation (${value})`;
        case 'isDeponent':
          return value === 'true' ? 'Deponent Only' : 'Non-Deponent Only';
        case 'nounDeclension':
        case 'adjectiveDeclension':
          return `Declension (${value})`;
        case 'pronounType':
          return `Pronoun Type (${value})`;
        case 'pronounPerson':
          return `Person (${value})`;
      }
    })
    .join(', ');
};

export type EnsuredGeneratorConfig = GeneratorConfigBase & {
  filters: GeneratorFilters;
  poolId: string | null;
};

export const DEFAULT_GENERATOR_CONFIG: EnsuredGeneratorConfig = {
  collection: '',
  wordSource: 'filters',
  poolId: null,
  count: 5,
  filters: { partOfSpeech: 'all' },
};

/**
 * A pool exercise uses every eligible pool word until the admin enters a number. Custom filters never inherit
 * that unbounded count, because with broad filters it would draw from the whole vocabulary collection.
 */
export const getWordSourceUpdate = (
  wordSource: GeneratorConfigBase['wordSource'],
  count: GeneratorConfigBase['count']
): Pick<GeneratorConfigBase, 'wordSource' | 'count'> =>
  wordSource === 'pool'
    ? { wordSource, count: 'all' }
    : { wordSource, count: count === 'all' ? DEFAULT_GENERATOR_CONFIG.count : count };

export const ensureGeneratorConfig = (config?: Partial<GeneratorConfigBase>): EnsuredGeneratorConfig => {
  const normalized = {
    ...DEFAULT_GENERATOR_CONFIG,
    ...config,
    poolId: config?.poolId ?? null,
    filters: config?.filters ?? { partOfSpeech: 'all' },
  };
  // Retired candidate caps must not be saved again when an old exercise is edited.
  delete (normalized as EnsuredGeneratorConfig & { poolWordLimit?: unknown }).poolWordLimit;
  // A unique-word limit above the question count has no effect, so keep it in range whenever the count changes.
  if (
    typeof normalized.count === 'number' &&
    normalized.uniqueWordCount &&
    normalized.uniqueWordCount > normalized.count
  ) {
    normalized.uniqueWordCount = normalized.count;
  }
  return normalized;
};

/**
 * The unique-word limit, or null when the setting has no effect. The generator caps it at the question
 * count, and the editor's config is already capped by ensureGeneratorConfig.
 */
export const getAppliedUniqueWordCount = (config: Partial<GeneratorConfigBase>): number | null =>
  config.wordSource === 'pool' && typeof config.count === 'number' && config.uniqueWordCount
    ? config.uniqueWordCount
    : null;
