import { getAcceptedAnswersForStep, getDisplayForm } from '@/src/utils/exercises/formIdentificationHelpers';
import { scoreSingleFieldFormIdentificationAnswer } from '@/src/utils/exercises/generatedFormIdentificationExercise';
import { normalizeAnswer } from '@/src/utils/exercises/helpers';
import type {
  FormIdentificationStep,
  SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import {
  AdjectiveDeclensionSchema,
  CaseSchema,
  DegreeSchema,
  GenderSchema,
  NounDeclensionSchema,
  NumberSchema,
  PersonSchema,
  PronounPersonSchema,
  PronounTypeSchema,
  VerbConjugationSchema,
  VoiceSchema,
} from '@/shared/types/vocabulary/schemas';

const VALUES: Record<FormIdentificationStep, readonly string[]> = {
  case: CaseSchema.options,
  number: NumberSchema.options,
  gender: GenderSchema.options,
  voice: VoiceSchema.options,
  person: [...PersonSchema.options, ...PronounPersonSchema.options],
  degree: DegreeSchema.options,
  tense: ['present', 'imperfect', 'future', 'perfect', 'pluperfect', 'future_perfect'],
  verb_form: ['finite', 'infinitive', 'participle', 'gerund', 'supine'],
  mood: ['indicative', 'subjunctive', 'imperative'],
  pronoun_type: PronounTypeSchema.options,
  declension: [...new Set([...NounDeclensionSchema.options, ...AdjectiveDeclensionSchema.options])],
  conjugation: VerbConjugationSchema.options,
};

const item = (step: FormIdentificationStep, value: string): SingleFieldFormIdentificationItem => ({
  id: 'word',
  wordId: 'word',
  word: 'word',
  root_word: 'word',
  dictionary_entry: null,
  selected_form: 'word',
  hasSelectedForm: true,
  steps: [step],
  correctAnswerDisplay: getDisplayForm(step, value),
  primaryFormPaths: [{ [step]: value }],
  optionalFormPaths: [],
});

const earns = (answer: string, step: FormIdentificationStep, value: string) =>
  scoreSingleFieldFormIdentificationAnswer(answer, item(step, value)).earnedUnits === 1;

describe('form identification answer spellings', () => {
  it.each(['1', '1st', 'first', '1 declension', '1st declension', 'First Declension'])(
    'accepts %j for the first declension',
    answer => {
      expect(earns(answer, 'declension', '1')).toBe(true);
    }
  );

  it.each(['3', '3rd', 'third', '3 conjugation', '3rd conjugation', 'third conjugation'])(
    'accepts %j for the third conjugation',
    answer => {
      expect(earns(answer, 'conjugation', '3')).toBe(true);
    }
  );

  it('keeps declension and conjugation spellings apart', () => {
    for (const number of ['1', '2', '3', '4']) {
      expect(earns(`${number} conjugation`, 'declension', number)).toBe(false);
      expect(earns(`${number} declension`, 'conjugation', number)).toBe(false);
    }
  });

  it.each(['1-2', '1/2', '1 and 2', '1st/2nd', '1st and 2nd', 'first and second', '2-1-2', '1-2 declension'])(
    'accepts %j for first and second declension adjectives',
    answer => {
      expect(earns(answer, 'declension', '1-2')).toBe(true);
    }
  );

  it('accepts the plain number or the full name for i-stem nouns and -io verbs', () => {
    for (const answer of ['3', '3rd', '3-istem', '3rd i-stem', 'third istem']) {
      expect(earns(answer, 'declension', '3-istem')).toBe(true);
    }
    for (const answer of ['3', 'third', '3io', '3-io', '3rd io']) {
      expect(earns(answer, 'conjugation', '3io')).toBe(true);
    }
    expect(earns('3-istem', 'declension', '3')).toBe(false);
    expect(earns('3io', 'conjugation', '3')).toBe(false);
  });

  it('still accepts one gender alone for a common-gender noun', () => {
    for (const answer of ['m', 'f', 'masculine', 'feminine', 'm/f', 'mf']) {
      expect(earns(answer, 'gender', 'masculine-feminine')).toBe(true);
    }
    expect(earns('n', 'gender', 'masculine-feminine')).toBe(false);
  });

  it('keeps abbreviations for legacy non-finite kinds stored as a mood', () => {
    expect(getAcceptedAnswersForStep('mood', 'infinitive')).toEqual(expect.arrayContaining(['inf']));
  });

  it('falls back to the value itself when it is not a known value for the question', () => {
    expect(getAcceptedAnswersForStep('case', 'ergative')).toEqual(['ergative']);
    expect(getAcceptedAnswersForStep('tense', '3')).toEqual(['3']);
    expect(getDisplayForm('case', 'ergative')).toBe('ergative');
  });
});

describe('form identification answer key labels', () => {
  it('names common gender, -io verbs and the imperfect unambiguously', () => {
    expect(getDisplayForm('gender', 'masculine-feminine')).toBe('m/f');
    expect(getDisplayForm('conjugation', '3io')).toBe('3io');
    expect(getDisplayForm('conjugation', '3')).toBe('3');
    expect(getDisplayForm('tense', 'imperfect')).toBe('imperf');
    expect(getDisplayForm('mood', 'imperative')).toBe('imp');
  });

  it.each(Object.entries(VALUES))(
    'labels every %s value with a spelling that is accepted for it alone',
    (step, values) => {
      const labels = values.map(value => getDisplayForm(step as FormIdentificationStep, value));
      expect(new Set(labels).size).toBe(values.length);
      values.forEach((value, index) => {
        const accepted = getAcceptedAnswersForStep(step as FormIdentificationStep, value).map(normalizeAnswer);
        expect(accepted).toContain(normalizeAnswer(labels[index]));
      });
    }
  );
});
