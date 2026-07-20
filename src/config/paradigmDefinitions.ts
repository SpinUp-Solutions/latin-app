import type { FormParadigm } from '@/src/types/exercises/paradigm';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { TableType } from '@/src/utils/schema-helpers';
import type { GeneratorFilters } from '@/src/types/exercises/base';

export const PARADIGM_STEPS: Readonly<Record<FormParadigm, readonly FormIdentificationStep[]>> = {
  'verb-conjugation': ['conjugation', 'tense', 'voice', 'mood', 'person', 'number'],
  'noun-declension': ['declension', 'case', 'number', 'gender'],
  'adjective-declension': ['declension', 'degree', 'gender', 'number', 'case'],
  'pronoun-personal': ['pronoun_type', 'person', 'case', 'number'],
  'pronoun-gendered': ['pronoun_type', 'gender', 'case', 'number'],
} as const;

export const PARADIGM_AVAILABLE_STEPS: Readonly<Record<FormParadigm, readonly FormIdentificationStep[]>> = {
  'verb-conjugation': ['conjugation', 'tense', 'voice', 'mood', 'person', 'number', 'case', 'gender'],
  'noun-declension': PARADIGM_STEPS['noun-declension'],
  'adjective-declension': PARADIGM_STEPS['adjective-declension'],
  'pronoun-personal': PARADIGM_STEPS['pronoun-personal'],
  'pronoun-gendered': PARADIGM_STEPS['pronoun-gendered'],
} as const;

export const PARADIGM_TABLE_TYPE: Readonly<Record<FormParadigm, TableType>> = {
  'verb-conjugation': 'conjugation',
  'noun-declension': 'declension',
  'adjective-declension': 'adjective-declension',
  'pronoun-personal': 'pronoun-declension',
  'pronoun-gendered': 'pronoun-adjective-declension',
} as const;

export const PARADIGM_LABELS: Readonly<Record<FormParadigm, string>> = {
  'verb-conjugation': 'Verb Conjugation',
  'noun-declension': 'Noun Declension',
  'adjective-declension': 'Adjective Declension',
  'pronoun-personal': 'Personal Pronouns (1st/2nd)',
  'pronoun-gendered': 'Gendered Pronouns (3rd/Other)',
} as const;

export const PARADIGM_POS_GROUP: Readonly<Record<FormParadigm, string>> = {
  'verb-conjugation': 'verb',
  'noun-declension': 'noun',
  'adjective-declension': 'adjective',
  'pronoun-personal': 'pronoun',
  'pronoun-gendered': 'pronoun',
} as const;

type FilterKey = keyof Omit<GeneratorFilters, 'partOfSpeech'>;

export const PARADIGM_RELEVANT_FILTERS: Readonly<Record<FormParadigm, readonly FilterKey[]>> = {
  'verb-conjugation': ['verbConjugation', 'isDeponent', 'search'],
  'noun-declension': ['nounDeclension', 'search'],
  'adjective-declension': ['adjectiveDeclension', 'search'],
  'pronoun-personal': ['search'],
  'pronoun-gendered': ['pronounType', 'search'],
} as const;
