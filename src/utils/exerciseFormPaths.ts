import type {
  VerbFormPath,
  FiniteVerbMood,
  NounFormPath,
  AdjectiveFormPath,
  PronounFormPath,
} from '@/src/types/api/exercise-word-responses';
import type { TableType } from '@/src/utils/schema-helpers';

const FINITE_MOODS = new Set(['indicative', 'subjunctive', 'imperative']);

const nonFiniteVerbPath = (
  verbForm: VerbFormPath['verb_form'],
  { tense = '', voice = '', number = '', caseValue, gender }: Record<string, string | undefined>
): VerbFormPath => ({
  verb_form: verbForm,
  tense,
  voice,
  mood: '',
  person: '',
  number,
  ...(caseValue ? { case: caseValue } : {}),
  ...(gender ? { gender } : {}),
});

export const parseFormPathFromString = (
  path: string,
  tableType: TableType
): VerbFormPath | NounFormPath | AdjectiveFormPath | PronounFormPath | null => {
  if (!path) return null;

  const parts = path.split('.');

  switch (tableType) {
    case 'conjugation':
      if (parts.length === 5 && FINITE_MOODS.has(parts[0])) {
        const [mood, voice, tense, number, person] = parts;
        return { verb_form: 'finite', tense, voice, mood: mood as FiniteVerbMood, person, number };
      }
      if (parts.length === 4 && parts[0] === 'nonFinite' && parts[1] === 'infinitive') {
        return nonFiniteVerbPath('infinitive', { tense: parts[2], voice: parts[3] });
      }
      if (parts.length === 7 && parts[0] === 'nonFinite' && parts[1] === 'participle') {
        const [, , tense, voice, caseValue, gender, number] = parts;
        return nonFiniteVerbPath('participle', { tense, voice, number, caseValue, gender });
      }
      if (parts.length === 2 && (parts[0] === 'gerund' || parts[0] === 'supine')) {
        return nonFiniteVerbPath(parts[0], { caseValue: parts[1] });
      }
      return null;
    case 'adjective-declension':
      if (parts.length === 4) {
        const [degree, caseValue, gender, number] = parts;
        return { degree, gender, number, case: caseValue };
      }
      break;
    case 'pronoun-adjective-declension':
      if (parts.length === 3) {
        const [caseValue, gender, number] = parts;
        return { gender, number, case: caseValue };
      }
      break;
    case 'declension':
    case 'pronoun-declension':
      break;
    default:
      return null;
  }

  return parts.length === 2 ? { number: parts[1], case: parts[0] } : null;
};
