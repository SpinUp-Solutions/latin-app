import type { VocabularyWordWithId } from '@/src/types/vocabulary/index';
import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import { DeclensionTableSchema, AdjectiveDeclensionTableSchema } from '@/src/types/vocabulary/schemas/declension';
import { DegreesTableSchema } from '@/src/types/vocabulary/schemas/adjective';
import { ConjugationTableSchema } from '@/src/types/vocabulary/schemas/verb-conjugation';
import { buildEmptyFromSchema } from '@/src/utils/schema-defaults';

const ZERO_TIMESTAMP = new Date(0).toISOString();
let placeholderCounter = 0;

const createPlaceholderId = (partOfSpeech: PartOfSpeech): string => {
  placeholderCounter += 1;
  return `NEW-${partOfSpeech}-${placeholderCounter}`;
};

const buildBaseWord = (partOfSpeech: PartOfSpeech) => ({
  id: createPlaceholderId(partOfSpeech),
  word: '',
  translation: '',
  definitions: [] as string[],
  etymology: null,
  pronunciation: null,
  type: 'core' as const,
  alternate_form: null,
  createdAt: ZERO_TIMESTAMP,
  updatedAt: ZERO_TIMESTAMP,
});

export const buildEmptyWord = (partOfSpeech: PartOfSpeech): VocabularyWordWithId => {
  const base = buildBaseWord(partOfSpeech);

  switch (partOfSpeech) {
    case 'noun':
      return {
        ...base,
        part_of_speech: 'noun',
        gender: null,
        declension: null,
        declension_table: buildEmptyFromSchema(DeclensionTableSchema),
        nominative_singular: null,
        genitive_singular: null,
      };
    case 'pronoun':
      return {
        ...base,
        part_of_speech: 'pronoun',
        pronoun_type: null,
        declension_table: buildEmptyFromSchema(AdjectiveDeclensionTableSchema),
      };
    case 'adjective':
      return {
        ...base,
        part_of_speech: 'adjective',
        declension: null,
        dictionary_forms: [],
        degrees_table: buildEmptyFromSchema(DegreesTableSchema),
      };
    case 'verb':
      return {
        ...base,
        part_of_speech: 'verb',
        conjugation: null,
        conjugation_table: buildEmptyFromSchema(ConjugationTableSchema),
        principal_parts: [],
        is_deponent: null,
      };
    case 'adverb':
    case 'preposition':
    case 'conjunction':
    case 'interjection':
    default:
      return {
        ...base,
        part_of_speech: partOfSpeech,
      };
  }
};

export const isPlaceholderWord = (word: VocabularyWordWithId | null): boolean => {
  if (!word) return false;
  return word.id.startsWith('NEW-');
};
