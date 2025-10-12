import { VocabularyWord, Noun, Verb, Adjective, Pronoun } from '@/src/types/vocabulary/index';

export const TABLE_TYPES = {
  DECLENSION: 'declension',
  ADJECTIVE_DECLENSION: 'adjective-declension',
  CONJUGATION: 'conjugation',
} as const;

export type TableType = (typeof TABLE_TYPES)[keyof typeof TABLE_TYPES];

export const getWordTypeColor = (wordType: string): string => {
  const colors = {
    noun: 'bg-blue-100 text-blue-800',
    verb: 'bg-green-100 text-green-800',
    adjective: 'bg-purple-100 text-purple-800',
    adverb: 'bg-orange-100 text-orange-800',
    preposition: 'bg-pink-100 text-pink-800',
    pronoun: 'bg-indigo-100 text-indigo-800',
    conjunction: 'bg-yellow-100 text-yellow-800',
    interjection: 'bg-red-100 text-red-800',
    enclitic: 'bg-gray-100 text-gray-800',
    number: 'bg-teal-100 text-teal-800',
  };
  return colors[wordType as keyof typeof colors] || 'bg-gray-100 text-gray-800';
};

export const cleanFormData = (data: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
};

export const parseEditingCellValue = (value: string): string[] => {
  return value
    .split(',')
    .map(v => v.trim())
    .filter(v => v);
};

export const formatCellValue = (value: string[]): string => {
  return Array.isArray(value) ? value.join(', ') : value;
};

export function isNoun(word: VocabularyWord): word is Noun {
  return word.part_of_speech === 'noun';
}

export function isVerb(word: VocabularyWord): word is Verb {
  return word.part_of_speech === 'verb';
}

export function isAdjective(word: VocabularyWord): word is Adjective {
  return word.part_of_speech === 'adjective';
}

export function isPronoun(word: VocabularyWord): word is Pronoun {
  return word.part_of_speech === 'pronoun';
}

export function hasConjugationTable(word: VocabularyWord): word is Verb {
  return word.part_of_speech === 'verb';
}

export function hasDeclensionTable(word: VocabularyWord): word is Noun | Pronoun {
  return word.part_of_speech === 'noun' || word.part_of_speech === 'pronoun';
}

export function hasAdjectiveDeclensionTable(word: VocabularyWord): word is Adjective {
  return word.part_of_speech === 'adjective';
}
