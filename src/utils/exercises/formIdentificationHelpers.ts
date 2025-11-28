import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import {
  CaseSchema,
  GenderSchema,
  NumberSchema,
  NounDeclensionSchema,
  AdjectiveDeclensionSchema,
  VerbConjugationSchema,
  DegreeSchema,
  VoiceSchema,
  PersonSchema,
  GrammaticalNumberSchema,
} from '@/shared/types/vocabulary/schemas';

type VerbWordResponse = Extract<ExerciseWordResponse, { part_of_speech: 'verb' }>;
type NounWordResponse = Extract<ExerciseWordResponse, { part_of_speech: 'noun' }>;
type AdjectiveWordResponse = Extract<ExerciseWordResponse, { part_of_speech: 'adjective' }>;
type PronounWordResponse = Extract<ExerciseWordResponse, { part_of_speech: 'pronoun' }>;

export const extractStepValue = (word: ExerciseWordResponse, step: FormIdentificationStep): string => {
  if (word.part_of_speech === 'verb') {
    const verbWord = word as VerbWordResponse;
    switch (step) {
      case 'conjugation':
        return verbWord.conjugation || '';
      case 'tense':
        return verbWord.form_path?.tense || '';
      case 'voice':
        return verbWord.form_path?.voice || '';
      case 'mood':
        return verbWord.form_path?.mood || '';
      case 'person':
        return verbWord.form_path?.person || '';
      case 'number':
        return verbWord.form_path?.number || '';
      default:
        return '';
    }
  }

  if (word.part_of_speech === 'noun') {
    const nounWord = word as NounWordResponse;
    switch (step) {
      case 'declension':
        return nounWord.declension || '';
      case 'case':
        return nounWord.form_path?.case || '';
      case 'number':
        return nounWord.form_path?.number || '';
      case 'gender':
        return nounWord.gender || '';
      default:
        return '';
    }
  }

  if (word.part_of_speech === 'adjective') {
    const adjWord = word as AdjectiveWordResponse;
    switch (step) {
      case 'declension':
        return adjWord.declension || '';
      case 'degree':
        return adjWord.form_path?.degree || '';
      case 'case':
        return adjWord.form_path?.case || '';
      case 'number':
        return adjWord.form_path?.number || '';
      case 'gender':
        return adjWord.form_path?.gender || '';
      default:
        return '';
    }
  }

  if (word.part_of_speech === 'pronoun') {
    const pronounWord = word as PronounWordResponse;
    switch (step) {
      case 'case':
        return pronounWord.form_path?.case || '';
      case 'number':
        return pronounWord.form_path?.number || '';
      case 'gender':
        return pronounWord.form_path?.gender || '';
      default:
        return '';
    }
  }

  return '';
};

export function extractStepValuesFromPaths<T extends { [key: string]: string | undefined }>(
  formPaths: T[],
  step: FormIdentificationStep
): string[] {
  const values: string[] = [];

  for (const formPath of formPaths) {
    const value = formPath[step as keyof T];
    if (value && typeof value === 'string' && !values.includes(value)) {
      values.push(value);
    }
  }

  return values;
}

export function filterPathsByPreviousAnswers<T extends Record<string, string | undefined>>(
  paths: T[],
  previousAnswers: Record<string, string>
): T[] {
  const previousEntries = Object.entries(previousAnswers);
  if (previousEntries.length === 0) return paths;

  return paths.filter(path => {
    for (const [step, userAnswer] of previousEntries) {
      const pathValue = path[step];
      if (!pathValue) return false;

      const acceptedVariants = getAcceptedAnswersForStep(pathValue).map(v => v.toLowerCase().trim());
      const normalizedUserAnswer = userAnswer.toLowerCase().trim();

      if (!acceptedVariants.includes(normalizedUserAnswer)) return false;
    }
    return true;
  });
}

export function getAcceptedAnswersForMultipleValues(correctValues: string[]): string[] {
  const allVariants: string[] = [];

  for (const value of correctValues) {
    const variants = getAcceptedAnswersForStep(value);
    for (const variant of variants) {
      if (!allVariants.includes(variant)) {
        allVariants.push(variant);
      }
    }
  }

  return allVariants;
}

export function formatPrimaryAnswersDisplay(
  primaryFormPaths: Array<{ [key: string]: string | undefined }>,
  step: FormIdentificationStep
): string {
  const values = extractStepValuesFromPaths(primaryFormPaths, step);

  if (values.length === 0) return '';
  if (values.length === 1) return values[0];

  return values.join(' OR ');
}

const createVariantMap = () => {
  const variants: Record<string, string[]> = {};

  CaseSchema.options.forEach(caseValue => {
    const abbrevMap: Record<string, string> = {
      nominative: 'nom',
      genitive: 'gen',
      dative: 'dat',
      accusative: 'acc',
      ablative: 'abl',
      locative: 'loc',
      vocative: 'voc',
    };
    const abbrev = abbrevMap[caseValue];
    variants[caseValue] = abbrev ? [caseValue, `${abbrev}.`, abbrev] : [caseValue];
  });

  NumberSchema.options.forEach(numberValue => {
    const abbrevMap: Record<string, string> = {
      singular: 'sg',
      plural: 'pl',
    };
    const abbrev = abbrevMap[numberValue];
    variants[numberValue] = abbrev ? [numberValue, abbrev, numberValue.substring(0, 4)] : [numberValue];
  });

  GrammaticalNumberSchema.options.forEach(numberValue => {
    if (!variants[numberValue]) {
      const abbrevMap: Record<string, string> = {
        singular: 'sg',
        plural: 'pl',
      };
      const abbrev = abbrevMap[numberValue];
      variants[numberValue] = abbrev ? [numberValue, abbrev, numberValue.substring(0, 4)] : [numberValue];
    }
  });

  VoiceSchema.options.forEach(voiceValue => {
    const abbrevMap: Record<string, string> = {
      active: 'act',
      passive: 'pass',
    };
    const abbrev = abbrevMap[voiceValue];
    variants[voiceValue] = abbrev ? [voiceValue, `${abbrev}.`, abbrev] : [voiceValue];
  });

  PersonSchema.options.forEach(personValue => {
    const displayMap: Record<string, string[]> = {
      first: ['first', '1st', '1'],
      second: ['second', '2nd', '2'],
      third: ['third', '3rd', '3'],
    };
    variants[personValue] = displayMap[personValue] || [personValue];
    const withPerson = `${personValue} person`;
    variants[withPerson] = displayMap[personValue]?.map(v => `${v} person`) || [withPerson];
  });

  GenderSchema.options.forEach(genderValue => {
    const abbrevMap: Record<string, string> = {
      masculine: 'm',
      feminine: 'f',
      neuter: 'n',
    };
    const fullAbbrevMap: Record<string, string> = {
      masculine: 'masc',
      feminine: 'fem',
      neuter: 'neut',
    };
    const abbrev = abbrevMap[genderValue];
    const fullAbbrev = fullAbbrevMap[genderValue];
    variants[genderValue] = [genderValue, `${fullAbbrev}.`, fullAbbrev, abbrev];
  });

  DegreeSchema.options.forEach(degreeValue => {
    const abbrevMap: Record<string, string> = {
      positive: 'pos',
      comparative: 'comp',
      superlative: 'superl',
    };
    const abbrev = abbrevMap[degreeValue];
    variants[degreeValue] = abbrev ? [degreeValue, `${abbrev}.`, abbrev] : [degreeValue];
  });

  NounDeclensionSchema.options.forEach(declValue => {
    const normalized = declValue.replace('-istem', '');
    variants[declValue] = [declValue, normalized, `${normalized} declension`];
    if (declValue.includes('-')) {
      variants[declValue].push(declValue.replace('-istem', ' istem'));
    }
  });

  AdjectiveDeclensionSchema.options.forEach(declValue => {
    variants[declValue] = [declValue, declValue, `${declValue} declension`];
  });

  VerbConjugationSchema.options.forEach(conjValue => {
    const normalized = conjValue.replace('io', '');
    variants[conjValue] = [conjValue, normalized, `${normalized} conjugation`];
    if (conjValue.includes('io')) {
      variants[conjValue].push(`${normalized}io`, `${normalized}-io`);
    }
  });

  const tenseVariants: Record<string, string[]> = {
    present: ['present', 'pres.', 'pres'],
    imperfect: ['imperfect', 'imperf.', 'imperf'],
    future: ['future', 'fut.', 'fut'],
    perfect: ['perfect', 'perf.', 'perf'],
    pluperfect: ['pluperfect', 'pluperf.', 'pluperf'],
    future_perfect: ['future perfect', 'fut. perf.', 'fut perf'],
  };
  Object.entries(tenseVariants).forEach(([key, value]) => {
    variants[key] = value;
  });

  const moodVariants: Record<string, string[]> = {
    indicative: ['indicative', 'ind.', 'ind'],
    subjunctive: ['subjunctive', 'subj.', 'subj'],
    imperative: ['imperative', 'imp.', 'imp'],
    infinitive: ['infinitive', 'inf.', 'inf'],
    participle: ['participle', 'part.', 'part'],
  };
  Object.entries(moodVariants).forEach(([key, value]) => {
    variants[key] = value;
  });

  return variants;
};

const ANSWER_VARIANTS = createVariantMap();

export const getAcceptedAnswersForStep = (correctAnswer: string): string[] => {
  const normalized = correctAnswer.toLowerCase().trim();
  return ANSWER_VARIANTS[normalized] || [correctAnswer];
};

export const getHintForStep = (word: ExerciseWordResponse, step: FormIdentificationStep): string | undefined => {
  if (word.definitions && word.definitions.length > 0) {
    return word.definitions.join('; ');
  }

  const stepGuideMap: Record<FormIdentificationStep, string> = {
    conjugation: 'Determine the verb conjugation',
    declension: 'Determine the declension',
    tense: 'Identify the verb tense',
    voice: 'Determine if this is active or passive',
    mood: 'Identify the mood (indicative, subjunctive, or imperative)',
    person: 'Identify the person (1st, 2nd, or 3rd)',
    number: 'Determine if this is singular or plural',
    case: 'Identify the grammatical case',
    gender: 'Determine the gender (masculine, feminine, or neuter)',
    degree: 'Identify the degree (positive, comparative, or superlative)',
  };

  return stepGuideMap[step];
};
