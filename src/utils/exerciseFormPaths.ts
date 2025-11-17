import type {
  VerbFormPath,
  NounFormPath,
  AdjectiveFormPath,
  PronounFormPath,
  AdverbFormPath,
} from '@/src/types/api/exercise-word-responses';
import type { TableType } from '@/src/utils/schema-helpers';

export const createVerbFormPath = (
  tense: string,
  voice: string,
  mood: string,
  person: string,
  number: string
): VerbFormPath => ({
  tense,
  voice,
  mood,
  person,
  number,
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
): VerbFormPath | NounFormPath | AdjectiveFormPath | null => {
  if (!path) return null;

  const parts = path.split('.');

  if (tableType === 'conjugation') {
    if (parts.length === 5) {
      return createVerbFormPath(parts[2], parts[1], parts[0], parts[4], parts[3]);
    }
  }

  if (tableType === 'declension') {
    if (parts.length === 2) {
      return createNounFormPath(parts[0], parts[1]);
    }
  }

  if (tableType === 'adjective-declension') {
    if (parts.length === 4) {
      return createAdjectiveFormPath(parts[0], parts[1], parts[2], parts[3]);
    }
    if (parts.length === 2) {
      return createNounFormPath(parts[0], parts[1]);
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
