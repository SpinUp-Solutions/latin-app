import type { VocabularyWord, VocabularyWordWithId } from '../index';
import { BaseWordFormSchema, BaseWordFormValues } from './base';
import { NounFormSchema, NounFormValues } from './noun';
import { PronounFormSchema, PronounFormValues } from './pronoun';
import { AdjectiveFormSchema, AdjectiveFormValues } from './adjective';
import { VerbFormSchema, VerbFormValues } from './verb';
import { VerbConjugationSchema } from '../schemas/enums';
import type { z } from 'zod';

type SpecificSchema =
  | typeof NounFormSchema
  | typeof PronounFormSchema
  | typeof AdjectiveFormSchema
  | typeof VerbFormSchema
  | typeof BaseWordFormSchema;

const schemaMap: Record<VocabularyWord['part_of_speech'], SpecificSchema> = {
  noun: NounFormSchema,
  pronoun: PronounFormSchema,
  adjective: AdjectiveFormSchema,
  verb: VerbFormSchema,
  adverb: BaseWordFormSchema,
  preposition: BaseWordFormSchema,
  conjunction: BaseWordFormSchema,
  interjection: BaseWordFormSchema,
};

export const getFormSchemaForPartOfSpeech = (partOfSpeech: VocabularyWord['part_of_speech']) => {
  const specific = schemaMap[partOfSpeech];
  return BaseWordFormSchema.merge(specific);
};

const emptyWordForm = { full_form: '', shortened_form: '' } as const;

type VerbConjugationValue = z.infer<typeof VerbConjugationSchema>;

const verbConjugationValues = VerbConjugationSchema.options as readonly VerbConjugationValue[];

const normalizeConjugation = (value: unknown): VerbConjugationValue | null => {
  if (value === undefined || value === null) return null;
  const candidate = String(value)
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '');
  const match = verbConjugationValues.find(option => option.toLowerCase() === candidate);
  return match ?? null;
};

export type VocabularyFormValues =
  | (BaseWordFormValues & NounFormValues)
  | (BaseWordFormValues & PronounFormValues)
  | (BaseWordFormValues & AdjectiveFormValues)
  | (BaseWordFormValues & VerbFormValues)
  | BaseWordFormValues;

export const toFormDefaultValues = (word: VocabularyWordWithId): VocabularyFormValues => {
  const base: BaseWordFormValues = {
    word: word.word,
    translation: word.translation,
    definitions: [...word.definitions],
    etymology: word.etymology ?? '',
    pronunciation: word.pronunciation ?? '',
    type: word.type,
    alternate_form: word.alternate_form ?? '',
  };

  if (word.part_of_speech === 'noun') {
    return {
      ...base,
      gender: word.gender ?? null,
      declension: word.declension ?? null,
      nominative_singular: word.nominative_singular ?? { ...emptyWordForm },
      genitive_singular: word.genitive_singular ?? { ...emptyWordForm },
    };
  }

  if (word.part_of_speech === 'pronoun') {
    return {
      ...base,
      pronoun_type: word.pronoun_type ?? null,
    };
  }

  if (word.part_of_speech === 'adjective') {
    return {
      ...base,
      declension: word.declension ?? null,
    };
  }

  if (word.part_of_speech === 'verb') {
    const conjugationValue = normalizeConjugation(word.conjugation);
    return {
      ...base,
      conjugation: conjugationValue,
      is_deponent: word.is_deponent ?? null,
      principal_parts: word.principal_parts ?? [],
    };
  }

  return base;
};

const toNullableString = (value: string | null | undefined) => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const applyFormValuesToWord = (
  word: VocabularyWordWithId,
  values: VocabularyFormValues
): VocabularyWordWithId => {
  const baseApplied = {
    ...word,
    word: values.word,
    translation: values.translation,
    definitions: values.definitions,
    etymology: toNullableString(values.etymology),
    pronunciation: toNullableString(values.pronunciation),
    type: values.type,
    alternate_form: toNullableString(values.alternate_form),
  } as VocabularyWordWithId;

  if (word.part_of_speech === 'noun') {
    const nounValues = values as BaseWordFormValues & NounFormValues;
    return {
      ...baseApplied,
      gender: nounValues.gender ?? null,
      declension: nounValues.declension ?? word.declension,
      declension_table: word.declension_table,
      nominative_singular: nounValues.nominative_singular ?? null,
      genitive_singular: nounValues.genitive_singular ?? null,
    } as VocabularyWordWithId;
  }

  if (word.part_of_speech === 'pronoun') {
    const pronounValues = values as BaseWordFormValues & PronounFormValues;
    return {
      ...baseApplied,
      pronoun_type: pronounValues.pronoun_type ?? word.pronoun_type,
      declension_table: word.declension_table,
    } as VocabularyWordWithId;
  }

  if (word.part_of_speech === 'adjective') {
    const adjectiveValues = values as BaseWordFormValues & AdjectiveFormValues;
    return {
      ...baseApplied,
      declension: adjectiveValues.declension ?? word.declension,
      dictionary_forms: word.dictionary_forms,
      degrees_table: word.degrees_table,
    } as VocabularyWordWithId;
  }

  if (word.part_of_speech === 'verb') {
    const verbValues = values as BaseWordFormValues & VerbFormValues;
    return {
      ...baseApplied,
      conjugation: verbValues.conjugation ?? word.conjugation,
      is_deponent: verbValues.is_deponent ?? word.is_deponent,
      principal_parts: verbValues.principal_parts ?? word.principal_parts,
      conjugation_table: word.conjugation_table,
    } as VocabularyWordWithId;
  }

  return baseApplied;
};

export type FormSchema = ReturnType<typeof BaseWordFormSchema.merge>;

export const getTableFieldName = (partOfSpeech: VocabularyWord['part_of_speech'], tableType: string): string | null => {
  if (tableType === 'declension') {
    return partOfSpeech === 'noun' || partOfSpeech === 'pronoun' ? 'declension_table' : null;
  }
  if (tableType === 'adjective-declension') {
    return partOfSpeech === 'adjective' ? 'degrees_table' : null;
  }
  if (tableType === 'conjugation') {
    return partOfSpeech === 'verb' ? 'conjugation_table' : null;
  }
  return null;
};
