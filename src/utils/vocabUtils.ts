import type { VocabularyWord, Verb } from '@/src/types/vocabulary/index';

export const parseEditingCellValue = (value: string): string[] => {
  return value
    .split(',')
    .map(v => v.trim())
    .filter(v => v);
};

export const formatCellValue = (value: string[]): string => {
  return Array.isArray(value) ? value.join(', ') : value;
};

export function isVerb(word: VocabularyWord): word is Verb {
  return word.part_of_speech === 'verb';
}
