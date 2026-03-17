/**
 * Backward-compatibility helpers for exercises created before the multi-POS
 * config system (posConfigs / paradigmConfigs).
 *
 * Old format stored filters and formSelection directly in generatorConfig,
 * with no wordSource, poolId, posConfigs or paradigmConfigs fields.
 * Collection was vocabulary_words_v4 (now v5).
 */

import type {
  PosConfigs,
  PosGeneratorConfig,
  GeneratorFilters,
  FormSelection,
  GeneratorConfigBase,
} from '@/src/types/exercises/base';
import type { ParadigmConfigs, ParadigmConfig, FormParadigm } from '@/src/types/exercises/paradigm';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import { PARADIGM_STEPS } from '@/src/config/paradigmDefinitions';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

/**
 * Old-format generatorConfig stored formSelection at the config level.
 * This extends GeneratorConfigBase with that legacy field for type safety.
 */
type LegacyAwareConfig = GeneratorConfigBase & { formSelection?: FormSelection };

const POS_TO_PARADIGM: Partial<Record<string, FormParadigm>> = {
  verb: 'verb-conjugation',
  noun: 'noun-declension',
  adjective: 'adjective-declension',
  pronoun: 'pronoun-gendered',
};

/**
 * Maps old vocabulary collection names (v4, etc.) to the current v5 collection.
 */
export function normalizeCollection(collection?: string): string {
  if (!collection) return VOCABULARY_WORDS_COLLECTION;
  if (collection.startsWith('vocabulary_words_v') && collection !== VOCABULARY_WORDS_COLLECTION) {
    return VOCABULARY_WORDS_COLLECTION;
  }
  return collection;
}

/**
 * Builds synthetic PosConfigs from a legacy generatorConfig that stored
 * filters.partOfSpeech and formSelection directly at the config level.
 */
export function buildLegacyPosConfigs(config: LegacyAwareConfig): PosConfigs {
  const pos = config.filters?.partOfSpeech;
  if (!pos || pos === 'all') return {};

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { partOfSpeech, ...restFilters } = config.filters!;

  const posConfig: PosGeneratorConfig = {
    enabled: true,
    filters: restFilters as Omit<GeneratorFilters, 'partOfSpeech'>,
    formSelection: config.formSelection,
  };

  return { [pos as PartOfSpeech]: posConfig };
}

/**
 * Builds synthetic ParadigmConfigs from a legacy generatorConfig.
 * Uses all available paradigm steps as defaults since the old format
 * didn't store step configuration.
 */
export function buildLegacyParadigmConfigs(config: LegacyAwareConfig): ParadigmConfigs {
  const pos = config.filters?.partOfSpeech;
  if (!pos || pos === 'all') return {};

  const paradigm = POS_TO_PARADIGM[pos];
  if (!paradigm) return {};

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { partOfSpeech, ...restFilters } = config.filters!;

  const paradigmConfig: ParadigmConfig = {
    enabled: true,
    steps: [...PARADIGM_STEPS[paradigm]],
    filters: restFilters as Omit<GeneratorFilters, 'partOfSpeech'>,
    formSelection: config.formSelection,
  };

  return { [paradigm]: paradigmConfig };
}
