import type {
  PartOfSpeech,
  WordType,
  PronounType,
  PronounPerson,
  NounDeclension,
  AdjectiveDeclension,
} from '@/shared/types/vocabulary/schemas/enums';
import type { VerbConjugation } from '@/shared/types/vocabulary/schemas/verb-conjugation';

export interface PoolFilters {
  partOfSpeech: PartOfSpeech | 'all';
  /** Missing or null matches both core and non-core words. */
  coreType?: WordType | null;
  search: string;
  verbConjugation: VerbConjugation[] | 'all';
  isDeponent: 'true' | 'false' | 'both';
  nounDeclension: NounDeclension[] | 'all';
  adjectiveDeclension: AdjectiveDeclension[] | 'all';
  pronounType: PronounType[] | 'all';
  pronounPerson: PronounPerson[] | 'all';
}
