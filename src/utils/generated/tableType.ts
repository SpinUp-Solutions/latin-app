import { TableType } from '@/src/utils/schema-helpers';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';

export type { TableType };

export const shouldUsePersonalPronounSchema = (
  pronounType?: PronounType | 'all' | string,
  pronounPerson?: PronounPerson | 'all' | string
): boolean => {
  return pronounType === 'personal' && (pronounPerson === '1st' || pronounPerson === '2nd');
};

export const deriveTableTypeFromPOS = (
  partOfSpeech?: PartOfSpeech | 'all' | string,
  pronounType?: PronounType | 'all' | string,
  pronounPerson?: PronounPerson | 'all' | string
): TableType | undefined => {
  if (!partOfSpeech || partOfSpeech === 'all') return undefined;
  switch (partOfSpeech) {
    case 'verb':
      return 'conjugation';
    case 'noun':
      return 'declension';
    case 'adjective':
      return 'adjective-declension';
    case 'pronoun': {
      return shouldUsePersonalPronounSchema(pronounType, pronounPerson)
        ? 'pronoun-declension'
        : 'pronoun-adjective-declension';
    }
    default:
      return undefined;
  }
};
