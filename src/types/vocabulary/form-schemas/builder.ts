import type { VocabularyWord, VocabularyWordWithId } from '../vocabulary-new';
import { BaseWordFormSchema, BaseWordFormValues } from './base';
import { NounFormSchema, NounFormValues } from './noun';
import { PronounFormSchema, PronounFormValues } from './pronoun';
import { AdjectiveFormSchema, AdjectiveFormValues } from './adjective';
import { VerbFormSchema, VerbFormValues } from './verb';
import { IndeclinableFormSchema } from './indeclinable';

type SpecificSchema =
  | typeof NounFormSchema
  | typeof PronounFormSchema
  | typeof AdjectiveFormSchema
  | typeof VerbFormSchema
  | typeof IndeclinableFormSchema;

const schemaMap: Record<VocabularyWord['part_of_speech'], SpecificSchema> = {
  noun: NounFormSchema,
  pronoun: PronounFormSchema,
  adjective: AdjectiveFormSchema,
  verb: VerbFormSchema,
  adverb: IndeclinableFormSchema,
  preposition: IndeclinableFormSchema,
  conjunction: IndeclinableFormSchema,
  interjection: IndeclinableFormSchema,
};

export const getFormSchemaForPartOfSpeech = (partOfSpeech: VocabularyWord['part_of_speech']) => {
  const specific = schemaMap[partOfSpeech];
  return BaseWordFormSchema.merge(specific);
};

const emptyWordForm = { full_form: '', shortened_form: '' } as const;

type ExtendedFormFields = {
  gender?: NounFormValues['gender'];
  declension?: NounFormValues['declension'] | AdjectiveFormValues['declension'];
  declension_table?: NounFormValues['declension_table'];
  adjective_declension_table?: AdjectiveFormValues['adjective_declension_table'];
  pronoun_type?: PronounFormValues['pronoun_type'];
  nominative_singular?: NounFormValues['nominative_singular'];
  genitive_singular?: NounFormValues['genitive_singular'];
  conjugation?: VerbFormValues['conjugation'];
  is_deponent?: VerbFormValues['is_deponent'];
  principal_parts?: VerbFormValues['principal_parts'];
  conjugation_table?: VerbFormValues['conjugation_table'];
};

export type VocabularyFormValues = BaseWordFormValues & ExtendedFormFields;

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
      declension_table: word.declension_table ?? {},
      nominative_singular: word.nominative_singular ?? { ...emptyWordForm },
      genitive_singular: word.genitive_singular ?? { ...emptyWordForm },
    };
  }

  if (word.part_of_speech === 'pronoun') {
    return {
      ...base,
      pronoun_type: word.pronoun_type ?? null,
      declension_table: word.declension_table ?? {},
    };
  }

  if (word.part_of_speech === 'adjective') {
    return {
      ...base,
      declension: word.declension ?? null,
      adjective_declension_table: word.adjective_declension_table ?? {},
    };
  }

  if (word.part_of_speech === 'verb') {
    return {
      ...base,
      conjugation: word.conjugation ?? null,
      is_deponent: word.is_deponent ?? null,
      principal_parts: word.principal_parts ?? [],
      conjugation_table: word.conjugation_table ?? {},
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
    return {
      ...baseApplied,
      gender: values.gender ?? null,
      declension: values.declension ?? word.declension,
      declension_table: values.declension_table ?? word.declension_table,
      nominative_singular: values.nominative_singular ?? null,
      genitive_singular: values.genitive_singular ?? null,
    } as VocabularyWordWithId;
  }

  if (word.part_of_speech === 'pronoun') {
    return {
      ...baseApplied,
      pronoun_type: values.pronoun_type ?? word.pronoun_type,
      declension_table: values.declension_table ?? word.declension_table,
    } as VocabularyWordWithId;
  }

  if (word.part_of_speech === 'adjective') {
    return {
      ...baseApplied,
      declension: values.declension ?? word.declension,
      adjective_declension_table: values.adjective_declension_table ?? word.adjective_declension_table,
    } as VocabularyWordWithId;
  }

  if (word.part_of_speech === 'verb') {
    return {
      ...baseApplied,
      conjugation: values.conjugation ?? word.conjugation,
      is_deponent: values.is_deponent ?? word.is_deponent,
      principal_parts: values.principal_parts ?? word.principal_parts,
      conjugation_table: values.conjugation_table ?? word.conjugation_table,
    } as VocabularyWordWithId;
  }

  return baseApplied;
};

export type FormSchema = ReturnType<typeof BaseWordFormSchema.merge>;
