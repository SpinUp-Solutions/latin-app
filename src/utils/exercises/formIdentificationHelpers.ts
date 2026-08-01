import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { normalize } from './generatedFormIdentificationExercise';
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
  PronounTypeSchema,
  PronounPersonSchema,
} from '@/shared/types/vocabulary/schemas';
import {
  getSupportedVerbFormStepsForParsedPath,
  getVerbFormKindForParsedPath,
  normalizeVerbFormStepsForParsedPaths,
} from './verbFormStepCompatibility';

type VerbWordResponse = Extract<ExerciseWordResponse, { part_of_speech: 'verb' }>;
type NounWordResponse = Extract<ExerciseWordResponse, { part_of_speech: 'noun' }>;
type AdjectiveWordResponse = Extract<ExerciseWordResponse, { part_of_speech: 'adjective' }>;
type PronounWordResponse = Extract<ExerciseWordResponse, { part_of_speech: 'pronoun' }>;
type AdverbWordResponse = Extract<ExerciseWordResponse, { part_of_speech: 'adverb' }>;

function isVerb(word: ExerciseWordResponse): word is VerbWordResponse {
  return word.part_of_speech === 'verb';
}

function isNoun(word: ExerciseWordResponse): word is NounWordResponse {
  return word.part_of_speech === 'noun';
}

function isAdjective(word: ExerciseWordResponse): word is AdjectiveWordResponse {
  return word.part_of_speech === 'adjective';
}

export function isPronoun(word: ExerciseWordResponse): word is PronounWordResponse {
  return word.part_of_speech === 'pronoun';
}

function isAdverb(word: ExerciseWordResponse): word is AdverbWordResponse {
  return word.part_of_speech === 'adverb';
}

export const extractStepValue = (word: ExerciseWordResponse, step: FormIdentificationStep): string => {
  if (isVerb(word)) {
    switch (step) {
      case 'conjugation':
        return word.conjugation || '';
      case 'tense':
        return word.form_path?.tense || '';
      case 'voice':
        return word.form_path?.voice || '';
      case 'verb_form':
        return getVerbFormKindForParsedPath(word.form_path);
      case 'mood':
        return word.form_path?.mood || '';
      case 'person':
        return word.form_path?.person || '';
      case 'number':
        return word.form_path?.number || '';
      case 'case':
        return word.form_path?.case || '';
      case 'gender':
        return word.form_path?.gender || '';
      default:
        return '';
    }
  }

  if (isNoun(word)) {
    switch (step) {
      case 'declension':
        return word.declension || '';
      case 'case':
        return word.form_path?.case || '';
      case 'number':
        return word.form_path?.number || '';
      case 'gender':
        return word.gender || '';
      default:
        return '';
    }
  }

  if (isAdjective(word)) {
    switch (step) {
      case 'declension':
        return word.declension || '';
      case 'degree':
        return word.form_path?.degree || '';
      case 'case':
        return word.form_path?.case || '';
      case 'number':
        return word.form_path?.number || '';
      case 'gender':
        return word.form_path?.gender || '';
      default:
        return '';
    }
  }

  if (isPronoun(word)) {
    switch (step) {
      case 'pronoun_type':
        return word.pronoun_type || '';
      case 'person':
        return word.person || '';
      case 'case':
        return word.form_path?.case || '';
      case 'number':
        return word.form_path?.number || '';
      case 'gender':
        return word.form_path?.gender || '';
      default:
        return '';
    }
  }

  if (isAdverb(word)) {
    switch (step) {
      case 'degree':
        return word.form_path?.degree || '';
      default:
        return '';
    }
  }

  return '';
};

export function enrichPathsWithSteps(
  paths: Array<Record<string, string | undefined>>,
  word: ExerciseWordResponse,
  steps: FormIdentificationStep[]
): Array<Record<string, string | undefined>> {
  return paths.map(path => {
    const enrichedPath: Record<string, string | undefined> = { ...path };
    const verbSupport = isVerb(word) ? getSupportedVerbFormStepsForParsedPath(path) : null;
    steps.forEach(step => {
      if (isVerb(word) && (!verbSupport || !verbSupport.supportedSteps.includes(step))) {
        return;
      }
      if (!enrichedPath[step]) {
        enrichedPath[step] = extractStepValue(word, step);
      }
    });
    return enrichedPath;
  });
}

export function getAnswerableStepsForWord(
  word: ExerciseWordResponse,
  steps: FormIdentificationStep[],
  formPaths: Array<Record<string, string | undefined>>
): FormIdentificationStep[] {
  if (!isVerb(word)) {
    return steps;
  }

  if (formPaths.length === 0) return [];

  const normalizedSteps = normalizeVerbFormStepsForParsedPaths(formPaths, steps);
  const supports = formPaths.map(path => getSupportedVerbFormStepsForParsedPath(path));

  if (supports.some(support => support === null)) return [];

  const supportedStepSets = supports.map(support => new Set<FormIdentificationStep>(support!.supportedSteps));

  return normalizedSteps.filter(step => supportedStepSets.every(supportedSteps => supportedSteps.has(step)));
}

/**
 * Deduplicates paths based on only the values of the requested steps.
 *
 * This handles syncretism cases where the same form appears at multiple paths
 * that differ in fields NOT being asked about. For example:
 * - Path 1: { tense: "perfect", mood: "subjunctive", person: "third", number: "plural" }
 * - Path 2: { tense: "future_perfect", mood: "indicative", person: "third", number: "plural" }
 *
 * If steps = ['person', 'number'], both paths have identical values for those steps,
 * so they should be deduplicated to avoid requiring duplicate answers.
 */
export function deduplicatePathsBySteps(
  paths: Array<Record<string, string | undefined>>,
  steps: FormIdentificationStep[]
): Array<Record<string, string | undefined>> {
  const seen = new Set<string>();
  const result: Array<Record<string, string | undefined>> = [];

  for (const path of paths) {
    // Create a key from only the requested step values (normalized)
    const key = steps.map(step => (path[step] || '').toLowerCase().trim()).join('|');

    if (!seen.has(key)) {
      seen.add(key);
      result.push(path);
    }
  }

  return result;
}

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

      const acceptedVariants = getAcceptedAnswersForStep(pathValue).map(normalize);
      const normalizedUserAnswer = normalize(userAnswer);

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

function generateMasculineFeminineVariants(): string[] {
  const mascForms = ['masculine', 'masc.', 'masc', 'm'];
  const femForms = ['feminine', 'fem.', 'fem', 'f'];
  const separators = [',', ', ', '/', '-', ' '];

  const variants: string[] = [
    ...mascForms,
    ...femForms,
    'masculine-feminine',
    'masculine/feminine',
    'm./f.',
    'm/f',
    'mf',
    'fm',
  ];

  for (const sep of separators) {
    for (const masc of mascForms) {
      for (const fem of femForms) {
        variants.push(`${masc}${sep}${fem}`);
        variants.push(`${fem}${sep}${masc}`);
      }
    }
  }

  return [...new Set(variants)];
}

const createVariantMap = () => {
  const v: Record<string, string[]> = {};

  CaseSchema.options.forEach(val => {
    const abbr: Record<string, string> = {
      nominative: 'nom',
      genitive: 'gen',
      dative: 'dat',
      accusative: 'acc',
      ablative: 'abl',
      locative: 'loc',
      vocative: 'voc',
    };
    const a = abbr[val];
    v[val] = a ? [val, `${a}.`, a] : [val];
  });

  NumberSchema.options.forEach(val => {
    v[val] = val === 'singular' ? ['singular', 'sg', 'sing', 's'] : ['plural', 'pl', 'plur', 'p'];
  });
  GrammaticalNumberSchema.options.forEach(val => {
    if (!v[val]) {
      v[val] = val === 'singular' ? ['singular', 'sg', 'sing', 's'] : ['plural', 'pl', 'plur', 'p'];
    }
  });

  GenderSchema.options.forEach(val => {
    const map: Record<string, string[]> = {
      masculine: ['masculine', 'masc.', 'masc', 'm'],
      feminine: ['feminine', 'fem.', 'fem', 'f'],
      neuter: ['neuter', 'neut.', 'neut', 'n'],
      'masculine-feminine': generateMasculineFeminineVariants(),
    };
    v[val] = map[val] || [val];
  });

  VoiceSchema.options.forEach(val => {
    const map: Record<string, string[]> = {
      active: ['active', 'act.', 'act', 'a'],
      passive: ['passive', 'pass.', 'pass'],
    };
    v[val] = map[val] || [val];
  });

  PersonSchema.options.forEach(val => {
    const map: Record<string, string[]> = {
      first: ['first', '1st', '1'],
      second: ['second', '2nd', '2'],
      third: ['third', '3rd', '3'],
    };
    v[val] = map[val] || [val];
    v[`${val} person`] = map[val]?.map(x => `${x} person`) || [`${val} person`];
  });

  DegreeSchema.options.forEach(val => {
    const abbr: Record<string, string> = {
      positive: 'pos',
      comparative: 'comp',
      superlative: 'superl',
    };
    const a = abbr[val];
    v[val] = a ? [val, `${a}.`, a] : [val];
  });

  const tenses: Record<string, string[]> = {
    present: ['present', 'pres.', 'pres'],
    imperfect: ['imperfect', 'imperf.', 'imperf', 'imp.', 'imp'],
    future: ['future', 'fut.', 'fut'],
    perfect: ['perfect', 'perf.', 'perf', 'per.', 'per'],
    pluperfect: ['pluperfect', 'pluperf.', 'pluperf', 'plup.', 'plup', 'pp'],
    future_perfect: [
      'future perfect',
      'fut. perf.',
      'fut perf',
      'futp.',
      'futp',
      'fp',
      'futureperfect',
      'future perf',
      'fut perfect',
    ],
  };
  Object.entries(tenses).forEach(([k, arr]) => {
    v[k] = arr;
  });

  const moods: Record<string, string[]> = {
    finite: ['finite', 'fin.', 'fin'],
    indicative: ['indicative', 'ind.', 'ind'],
    subjunctive: ['subjunctive', 'subj.', 'subj'],
    imperative: ['imperative', 'imp.', 'imp'],
    infinitive: ['infinitive', 'inf.', 'inf'],
    participle: ['participle', 'part.', 'part'],
    gerund: ['gerund', 'ger.', 'ger'],
    supine: ['supine', 'sup.', 'sup'],
  };
  Object.entries(moods).forEach(([k, arr]) => {
    v[k] = arr;
  });

  PronounTypeSchema.options.forEach(val => {
    const abbr: Record<string, string> = {
      personal: 'pers',
      reflexive: 'refl',
      demonstrative: 'dem',
      intensive: 'intens',
      relative: 'rel',
      interrogative: 'interr',
      indefinite: 'indef',
      possessive: 'poss',
    };
    const a = abbr[val];
    v[val] = a ? [val, `${a}.`, a] : [val];
  });

  PronounPersonSchema.options.forEach(val => {
    const map: Record<string, string[]> = {
      '1st': ['1st', 'first', '1', '1st person', 'first person'],
      '2nd': ['2nd', 'second', '2', '2nd person', 'second person'],
      '3rd': ['3rd', 'third', '3', '3rd person', 'third person'],
    };
    v[val] = map[val] || [val];
  });

  NounDeclensionSchema.options.forEach(val => {
    const n = val.replace('-istem', '');
    v[val] = [`${n} declension`, val, n];
    if (val.includes('-')) v[val].push(val.replace('-istem', ' istem'));
  });

  AdjectiveDeclensionSchema.options.forEach(val => {
    v[val] = [`${val} declension`, val];
  });

  VerbConjugationSchema.options.forEach(val => {
    if (val === 'irregular') {
      v[val] = ['irregular conjugation', 'irregular', 'irr.', 'irr'];
      return;
    }
    const n = val.replace('io', '');
    v[val] = val.includes('io') ? [`${n} conjugation`, val, `${n}io`, `${n}-io`, n] : [`${n} conjugation`, val, n];
  });

  return v;
};

const ANSWER_VARIANTS = createVariantMap();

const normalizeVariantKey = (value: string): string => {
  const normalized = value.toLowerCase().trim();
  if (!normalized) return normalized;

  const directGenderAliases: Record<string, string> = {
    m: 'masculine',
    'masc.': 'masculine',
    masc: 'masculine',
    f: 'feminine',
    'fem.': 'feminine',
    fem: 'feminine',
    n: 'neuter',
    'neut.': 'neuter',
    neut: 'neuter',
    mf: 'masculine-feminine',
    fm: 'masculine-feminine',
  };

  if (directGenderAliases[normalized]) {
    return directGenderAliases[normalized];
  }

  const tokens = normalized
    .replace(/[.,;:!?]/g, '')
    .split(/[\s/,-]+/)
    .filter(Boolean);

  if (tokens.length >= 2) {
    const tokenSet = new Set(tokens);
    const hasMasc = tokenSet.has('m') || tokenSet.has('masc') || tokenSet.has('masculine');
    const hasFem = tokenSet.has('f') || tokenSet.has('fem') || tokenSet.has('feminine');
    if (hasMasc && hasFem) {
      return 'masculine-feminine';
    }
  }

  return normalized;
};

export const getAcceptedAnswersForStep = (correctAnswer: string): string[] => {
  const normalized = normalizeVariantKey(correctAnswer);
  return ANSWER_VARIANTS[normalized] || [correctAnswer];
};

export const getDisplayForm = (value: string): string => {
  const normalized = normalizeVariantKey(value);
  const variants = ANSWER_VARIANTS[normalized];
  return variants ? variants[variants.length - 1] : value;
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
    verb_form: 'Identify the verb form (finite, infinitive, participle, gerund, or supine)',
    mood: 'Identify the mood (indicative, subjunctive, or imperative)',
    person: 'Identify the person (1st, 2nd, or 3rd)',
    number: 'Determine if this is singular or plural',
    case: 'Identify the grammatical case',
    gender: 'Determine the gender (masculine, feminine, neuter, or masculine/feminine)',
    degree: 'Identify the degree (positive, comparative, or superlative)',
    pronoun_type: 'Identify the pronoun type (personal, demonstrative, relative, etc.)',
  };

  return stepGuideMap[step];
};

export function hasValidFormData(word: ExerciseWordResponse, steps: FormIdentificationStep[]): boolean {
  const primaryPaths = word.primary_form_paths;
  const formPath = word.form_path;

  const hasFormPaths = formPath !== null || (primaryPaths !== undefined && primaryPaths.length > 0);

  if (!hasFormPaths) {
    return false;
  }

  if (isPronoun(word)) {
    if (!word.pronoun_type) {
      return false;
    }

    if (steps.includes('person') && word.pronoun_type === 'personal' && !word.person) {
      return false;
    }
  }

  const formPaths = primaryPaths || (formPath ? [formPath] : []);
  const answerableSteps = getAnswerableStepsForWord(
    word,
    steps,
    formPaths as Array<Record<string, string | undefined>>
  );

  if (answerableSteps.length === 0) return false;

  return formPaths.some(path => {
    return answerableSteps.every(step => {
      const pathRecord = path as Record<string, string | undefined>;
      if (pathRecord[step]) return true;

      const wordValue = extractStepValue(word, step);
      return wordValue !== '';
    });
  });
}
