import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import type { VerbConjugation } from '@/shared/types/vocabulary/schemas/verb-conjugation';
import type { NounDeclension } from '@/shared/types/vocabulary/schemas/enums';
import type { AdjectiveDeclension } from '@/shared/types/vocabulary/schemas/enums';

export interface PoolFilters {
  partOfSpeech: PartOfSpeech | 'all';
  search: string;
  verbConjugation: VerbConjugation | 'all';
  isDeponent: 'true' | 'false' | 'both';
  nounDeclension: NounDeclension | 'all';
  adjectiveDeclension: AdjectiveDeclension | 'all';
  pronounType: PronounType | 'all';
  pronounPerson: PronounPerson | 'all';
}

export const DEFAULT_POOL_FILTERS: PoolFilters = {
  partOfSpeech: 'all',
  search: '',
  verbConjugation: 'all',
  isDeponent: 'both',
  nounDeclension: 'all',
  adjectiveDeclension: 'all',
  pronounType: 'all',
  pronounPerson: 'all',
};
