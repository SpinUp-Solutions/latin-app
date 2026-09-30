import type {
  PartOfSpeech,
  PronounType,
  PronounPerson,
  NounDeclension,
  AdjectiveDeclension,
} from '@/shared/types/vocabulary/schemas/enums';
import type { VerbConjugation } from '@/shared/types/vocabulary/schemas/verb-conjugation';

export interface PoolFilters {
  partOfSpeech: PartOfSpeech | 'all';
  search: string;
  verbConjugation: VerbConjugation[] | 'all';
  isDeponent: 'true' | 'false' | 'both';
  nounDeclension: NounDeclension[] | 'all';
  adjectiveDeclension: AdjectiveDeclension[] | 'all';
  pronounType: PronounType[] | 'all';
  pronounPerson: PronounPerson[] | 'all';
}
