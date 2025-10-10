import { VocabularyWord, Noun, Verb, Adjective, Pronoun } from '@/src/types/vocabulary-new';

export const TABLE_TYPES = {
  DECLENSION: 'declension',
  ADJECTIVE_DECLENSION: 'adjective-declension',
  CONJUGATION: 'conjugation',
} as const;

export const LATIN_CASES = ['Nominative', 'Genitive', 'Dative', 'Accusative', 'Ablative', 'Vocative'];
export const INDICATIVE_TENSES = ['present', 'imperfect', 'future', 'perfect', 'pluperfect', 'future_perfect'];
export const SUBJUNCTIVE_TENSES = ['present', 'imperfect', 'perfect', 'pluperfect'];
export const IMPERATIVE_FORMS = ['present', 'future'];
export const INFINITIVE_FORMS = ['present', 'perfect', 'future'];
export const PARTICIPLE_FORMS = ['present', 'perfect', 'future', 'gerundive'];

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

export const updateTableCell = (
  formData: Partial<VocabularyWord & { id: string }>,
  tableType: string,
  rowIndex: number,
  cellKey: string,
  newValue: string[]
): Partial<VocabularyWord & { id: string }> | null => {
  if (tableType === TABLE_TYPES.DECLENSION) {
    if (formData.part_of_speech && hasDeclensionTable(formData as VocabularyWord)) {
      const typedFormData = formData as Partial<(Noun | Pronoun) & { id: string }>;
      const declensionTable = typedFormData.declension_table;
      if (declensionTable) {
        const updatedTable = [...declensionTable];
        updatedTable[rowIndex] = {
          ...updatedTable[rowIndex],
          [cellKey]: newValue,
        };
        return { ...formData, declension_table: updatedTable } as Partial<VocabularyWord & { id: string }>;
      }
    }
  } else if (tableType === TABLE_TYPES.ADJECTIVE_DECLENSION) {
    if (formData.part_of_speech && hasAdjectiveDeclensionTable(formData as VocabularyWord)) {
      const typedFormData = formData as Partial<Adjective & { id: string }>;
      const adjectiveDeclensionTable = typedFormData.adjective_declension_table;
      if (adjectiveDeclensionTable) {
        const updatedTable = [...adjectiveDeclensionTable];
        const [gender, number] = cellKey.split('.');
        const row = updatedTable[rowIndex];

        if (gender === 'masculine' || gender === 'feminine' || gender === 'neuter') {
          updatedTable[rowIndex] = {
            ...row,
            [gender]: {
              ...row[gender],
              [number]: newValue,
            },
          };
          return {
            ...formData,
            adjective_declension_table: updatedTable,
          } as Partial<VocabularyWord & { id: string }>;
        }
      }
    }
  } else if (tableType === TABLE_TYPES.CONJUGATION) {
    if (formData.part_of_speech && hasConjugationTable(formData as VocabularyWord)) {
      const typedFormData = formData as Partial<Verb & { id: string }>;
      const conjugationTable = typedFormData.conjugation_table;
      if (conjugationTable) {
        const updatedTable = JSON.parse(JSON.stringify(conjugationTable));
        const parts = cellKey.split('.');

        let current = updatedTable;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        current[parts[parts.length - 1]] = newValue;
        return { ...formData, conjugation_table: updatedTable } as Partial<VocabularyWord & { id: string }>;
      }
    }
  }

  return null;
};
