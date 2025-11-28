import { TableType } from '@/src/utils/schema-helpers';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';

export type { TableType };

export const deriveTableTypeFromPOS = (partOfSpeech?: PartOfSpeech | 'all' | string): TableType | undefined => {
  if (!partOfSpeech || partOfSpeech === 'all') return undefined;
  switch (partOfSpeech) {
    case 'verb':
      return 'conjugation';
    case 'noun':
      return 'declension';
    case 'adjective':
      return 'adjective-declension';
    default:
      return undefined;
  }
};
