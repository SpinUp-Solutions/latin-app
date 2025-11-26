import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import type { VerbConjugation } from '@/src/types/vocabulary/schemas/verb-conjugation';
import type { NounDeclension } from '@/src/types/vocabulary/schemas/enums';
import type { AdjectiveDeclension } from '@/src/types/vocabulary/schemas/enums';

export interface PoolFilters {
  partOfSpeech: PartOfSpeech | 'all';
  search: string;
  verbConjugation: VerbConjugation | 'all';
  isDeponent: 'true' | 'false' | 'both';
  nounDeclension: NounDeclension | 'all';
  adjectiveDeclension: AdjectiveDeclension | 'all';
}

export const DEFAULT_POOL_FILTERS: PoolFilters = {
  partOfSpeech: 'all',
  search: '',
  verbConjugation: 'all',
  isDeponent: 'both',
  nounDeclension: 'all',
  adjectiveDeclension: 'all',
};
