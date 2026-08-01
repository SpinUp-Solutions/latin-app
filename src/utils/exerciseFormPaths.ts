import type {
  VerbFormPath,
  VerbFormKind,
  FiniteVerbMood,
  NounFormPath,
  AdjectiveFormPath,
  PronounFormPath,
  AdverbFormPath,
} from '@/src/types/api/exercise-word-responses';
import type { TableType } from '@/src/utils/schema-helpers';

export const createVerbFormPath = (
  verbForm: VerbFormKind,
  tense: string,
  voice: string,
  mood: FiniteVerbMood | '',
  person: string,
  number: string,
  caseValue?: string,
  gender?: string
): VerbFormPath => ({
  verb_form: verbForm,
  tense,
  voice,
  mood,
  person,
  number,
  ...(caseValue ? { case: caseValue } : {}),
  ...(gender ? { gender } : {}),
});

export const createNounFormPath = (number: string, caseValue: string): NounFormPath => ({
  number,
  case: caseValue,
});

export const createAdjectiveFormPath = (
  degree: string,
  gender: string,
  number: string,
  caseValue: string
): AdjectiveFormPath => ({
  degree,
  gender,
  number,
  case: caseValue,
});

export const createPronounFormPath = (gender: string, number: string, caseValue: string): PronounFormPath => ({
  gender,
  number,
  case: caseValue,
});

export const createAdverbFormPath = (degree: string): AdverbFormPath => ({
  degree,
});

type FormPath = VerbFormPath | NounFormPath | AdjectiveFormPath | PronounFormPath | AdverbFormPath;

export const parseFormPathFromString = (
  path: string,
  tableType: TableType
): VerbFormPath | NounFormPath | AdjectiveFormPath | PronounFormPath | null => {
  if (!path) return null;

  const parts = path.split('.');

  if (tableType === 'conjugation') {
    const finiteMoods = new Set(['indicative', 'subjunctive', 'imperative']);

    if (parts.length === 5 && finiteMoods.has(parts[0])) {
      return createVerbFormPath(
        'finite',
        parts[2],
        parts[1],
        parts[0] as FiniteVerbMood,
        parts[4],
        parts[3]
      );
    }

    if (parts.length === 4 && parts[0] === 'nonFinite' && parts[1] === 'infinitive') {
      return createVerbFormPath('infinitive', parts[2], parts[3], '', '', '');
    }

    if (parts.length === 7 && parts[0] === 'nonFinite' && parts[1] === 'participle') {
      return createVerbFormPath('participle', parts[2], parts[3], '', '', parts[6], parts[4], parts[5]);
    }

    if (parts.length === 2 && parts[0] === 'gerund') {
      return createVerbFormPath('gerund', '', '', '', '', '', parts[1]);
    }

    if (parts.length === 2 && parts[0] === 'supine') {
      return createVerbFormPath('supine', '', '', '', '', '', parts[1]);
    }
  }

  if (tableType === 'declension') {
    if (parts.length === 2) {
      return createNounFormPath(parts[1], parts[0]);
    }
  }

  if (tableType === 'adjective-declension') {
    if (parts.length === 4) {
      return createAdjectiveFormPath(parts[0], parts[2], parts[3], parts[1]);
    }
    if (parts.length === 2) {
      return createNounFormPath(parts[1], parts[0]);
    }
  }

  if (tableType === 'pronoun-declension') {
    if (parts.length === 2) {
      return createNounFormPath(parts[1], parts[0]);
    }
  }

  if (tableType === 'pronoun-adjective-declension') {
    if (parts.length === 3) {
      return createPronounFormPath(parts[1], parts[2], parts[0]);
    }
    if (parts.length === 2) {
      return createNounFormPath(parts[1], parts[0]);
    }
  }

  return null;
};

export const formatFormPath = (formPath: FormPath | null): string => {
  if (!formPath) return '';
  return Object.values(formPath)
    .filter(v => v)
    .join(' ');
};
