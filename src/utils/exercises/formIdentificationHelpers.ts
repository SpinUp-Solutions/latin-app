import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { normalizeAnswer } from './helpers';
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
  PronounTypeSchema,
  PronounPersonSchema,
} from '@/shared/types/vocabulary/schemas';
import { getSupportedVerbFormStepsForParsedPath, getVerbFormKindForParsedPath } from './verbFormStepCompatibility';
import { getParsedFormPathStepSupport } from './formIdentificationCompatibility';

export const extractStepValue = (word: ExerciseWordResponse, step: FormIdentificationStep): string => {
  switch (word.part_of_speech) {
    case 'verb':
      switch (step) {
        case 'conjugation':
          return word.conjugation || '';
        case 'verb_form':
          return getVerbFormKindForParsedPath(word.form_path);
        case 'tense':
        case 'voice':
        case 'mood':
        case 'person':
        case 'number':
        case 'case':
        case 'gender':
          return word.form_path?.[step] || '';
        default:
          return '';
      }
    case 'noun':
      switch (step) {
        case 'declension':
          return word.declension || '';
        case 'gender':
          return word.gender || '';
        case 'case':
        case 'number':
          return word.form_path?.[step] || '';
        default:
          return '';
      }
    case 'adjective':
      switch (step) {
        case 'declension':
          return word.declension || '';
        case 'degree':
        case 'case':
        case 'number':
        case 'gender':
          return word.form_path?.[step] || '';
        default:
          return '';
      }
    case 'pronoun':
      switch (step) {
        case 'pronoun_type':
          return word.pronoun_type || '';
        case 'person':
          return word.person || '';
        case 'case':
        case 'number':
        case 'gender':
          return word.form_path?.[step] || '';
        default:
          return '';
      }
    case 'adverb':
      return step === 'degree' ? word.form_path?.degree || '' : '';
    default:
      return '';
  }
};

export function enrichPathsWithSteps(
  paths: Array<Record<string, string | undefined>>,
  word: ExerciseWordResponse,
  steps: FormIdentificationStep[]
): Array<Record<string, string | undefined>> {
  const isVerb = word.part_of_speech === 'verb';
  return paths.map(path => {
    const enrichedPath: Record<string, string | undefined> = { ...path };
    const verbSupport = isVerb ? getSupportedVerbFormStepsForParsedPath(path) : null;
    steps.forEach(step => {
      if (isVerb && !verbSupport?.supportedSteps.includes(step)) {
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
  if (formPaths.length === 0) return [];

  const supports = formPaths.map(path => getParsedFormPathStepSupport(word.part_of_speech, path));
  if (supports.some(support => support === null)) return [];

  return steps.filter(step => supports.every(support => support!.supportedSteps.includes(step)));
}

/**
 * Select one path's applicable questions when a word has no shared question
 * across all of its syncretic interpretations. This keeps a selected form
 * answerable while later path preparation removes incompatible alternatives.
 */
export function getFallbackAnswerableStepsForWord(
  word: ExerciseWordResponse,
  steps: FormIdentificationStep[],
  preferredPath: Record<string, string | undefined> | null | undefined
): FormIdentificationStep[] {
  if (!preferredPath) return [];
  const support = getParsedFormPathStepSupport(word.part_of_speech, preferredPath);
  return support ? support.supportedSteps.filter(step => steps.includes(step)) : [];
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
  return paths.filter(path => {
    const key = steps.map(step => (path[step] || '').toLowerCase().trim()).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractStepValuesFromPaths(
  formPaths: Array<Record<string, string | undefined>>,
  step: FormIdentificationStep
): string[] {
  return [...new Set(formPaths.map(path => path[step]).filter((value): value is string => Boolean(value)))];
}

export function filterPathsByPreviousAnswers<T extends Record<string, string | undefined>>(
  paths: T[],
  previousAnswers: Record<string, string>
): T[] {
  const previousEntries = Object.entries(previousAnswers);
  if (previousEntries.length === 0) return paths;

  return paths.filter(path =>
    previousEntries.every(([step, userAnswer]) => {
      const pathValue = path[step];
      if (!pathValue) return false;
      return getAcceptedAnswersForStep(step as FormIdentificationStep, pathValue)
        .map(normalizeAnswer)
        .includes(normalizeAnswer(userAnswer));
    })
  );
}

export function getAcceptedAnswersForMultipleValues(step: FormIdentificationStep, correctValues: string[]): string[] {
  return [...new Set(correctValues.flatMap(value => getAcceptedAnswersForStep(step, value)))];
}

export function formatPrimaryAnswersDisplay(
  primaryFormPaths: Array<Record<string, string | undefined>>,
  step: FormIdentificationStep
): string {
  return extractStepValuesFromPaths(primaryFormPaths, step).join(' OR ');
}

function generateMasculineFeminineVariants(): string[] {
  const mascForms = ['masculine', 'masc.', 'masc', 'm'];
  const femForms = ['feminine', 'fem.', 'fem', 'f'];
  const separators = [',', ', ', '/', '-', ' '];
  const label = 'm/f';

  const variants: string[] = [
    ...mascForms,
    ...femForms,
    'masculine-feminine',
    'masculine/feminine',
    'm./f.',
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

  return [...new Set(variants.filter(variant => variant !== label)), label];
}

const NUMBER_NAMES: Record<string, string[]> = {
  '1': ['1st', 'first', '1'],
  '2': ['2nd', 'second', '2'],
  '3': ['3rd', 'third', '3'],
  '4': ['4th', 'fourth', '4'],
  '5': ['5th', 'fifth', '5'],
};

const numberNames = (number: string) => NUMBER_NAMES[number] ?? [number];

/** Every name with and without the noun ("3rd declension", "3rd"), ending on the bare names. */
const withNoun = (names: string[], noun: string) => [...names.map(name => `${name} ${noun}`), ...names];

type VariantMap = Record<string, string[]>;

/**
 * Accepted spellings for each value of each question. The last spelling is the label shown in
 * answer keys. Questions are kept apart so that values sharing a name, such as the third
 * declension and the third conjugation, do not share spellings.
 */
const createVariantMap = (): Record<FormIdentificationStep, VariantMap> => {
  const abbreviated = (values: readonly string[], abbreviations: Record<string, string>): VariantMap =>
    Object.fromEntries(
      values.map(value => {
        const abbreviation = abbreviations[value];
        return [value, abbreviation ? [value, `${abbreviation}.`, abbreviation] : [value]];
      })
    );

  const person: VariantMap = {
    '1st': ['1st', 'first', '1', '1st person', 'first person'],
    '2nd': ['2nd', 'second', '2', '2nd person', 'second person'],
    '3rd': ['3rd', 'third', '3', '3rd person', 'third person'],
  } satisfies Record<(typeof PronounPersonSchema.options)[number], string[]>;
  const verbPersons: Record<(typeof PersonSchema.options)[number], string[]> = {
    first: ['first', '1st', '1'],
    second: ['second', '2nd', '2'],
    third: ['third', '3rd', '3'],
  };
  PersonSchema.options.forEach(value => {
    person[value] = verbPersons[value];
    person[`${value} person`] = verbPersons[value].map(name => `${name} person`);
  });

  const declension: VariantMap = {};
  NounDeclensionSchema.options.forEach(value => {
    const names = numberNames(value.replace('-istem', ''));
    declension[value] = withNoun(names, 'declension');
    if (value.endsWith('-istem')) {
      declension[value].push(...names.flatMap(name => [`${name}-istem`, `${name} i-stem`, `${name} istem`]));
    }
  });
  AdjectiveDeclensionSchema.options.forEach(value => {
    const [first, second] = value.split('-');
    if (!second) {
      declension[value] = withNoun(numberNames(first), 'declension');
      return;
    }
    const seconds = numberNames(second);
    const names = numberNames(first).flatMap((name, index) => [
      `${name}/${seconds[index]}`,
      `${name} and ${seconds[index]}`,
      `${name}-${seconds[index]}`,
    ]);
    declension[value] = withNoun(['2-1-2', ...names], 'declension');
  });

  const conjugation: VariantMap = {};
  VerbConjugationSchema.options.forEach(value => {
    if (value === 'irregular') {
      conjugation[value] = ['irregular conjugation', 'irregular', 'irr.', 'irr'];
      return;
    }
    const names = numberNames(value.replace('io', ''));
    conjugation[value] = withNoun(names, 'conjugation');
    if (value.endsWith('io')) {
      conjugation[value].push(...names.flatMap(name => [`${name} io`, `${name}-io`]), value);
    }
  });

  const nonFiniteVerbForms: VariantMap = {
    infinitive: ['infinitive', 'inf.', 'inf'],
    participle: ['participle', 'part.', 'part'],
    gerund: ['gerund', 'ger.', 'ger'],
    supine: ['supine', 'sup.', 'sup'],
  };

  return {
    case: abbreviated(CaseSchema.options, {
      nominative: 'nom',
      genitive: 'gen',
      dative: 'dat',
      accusative: 'acc',
      ablative: 'abl',
      locative: 'loc',
      vocative: 'voc',
    }),
    number: {
      singular: ['singular', 'sg', 'sing', 's'],
      plural: ['plural', 'pl', 'plur', 'p'],
    } satisfies Record<(typeof NumberSchema.options)[number], string[]>,
    gender: {
      masculine: ['masculine', 'masc.', 'masc', 'm'],
      feminine: ['feminine', 'fem.', 'fem', 'f'],
      neuter: ['neuter', 'neut.', 'neut', 'n'],
      'masculine-feminine': generateMasculineFeminineVariants(),
    } satisfies Record<(typeof GenderSchema.options)[number], string[]>,
    voice: {
      active: ['active', 'act.', 'act', 'a'],
      passive: ['passive', 'pass.', 'pass'],
    } satisfies Record<(typeof VoiceSchema.options)[number], string[]>,
    person,
    degree: abbreviated(DegreeSchema.options, {
      positive: 'pos',
      comparative: 'comp',
      superlative: 'superl',
    }),
    tense: {
      present: ['present', 'pres.', 'pres'],
      // "imp" alone also means imperative, so the answer key spells the tense out further.
      imperfect: ['imperfect', 'imperf.', 'imp.', 'imp', 'imperf'],
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
    },
    verb_form: { finite: ['finite', 'fin.', 'fin'], ...nonFiniteVerbForms },
    // Legacy resolved test attempts encoded non-finite form kinds in `mood`.
    mood: {
      indicative: ['indicative', 'ind.', 'ind'],
      subjunctive: ['subjunctive', 'subj.', 'subj'],
      imperative: ['imperative', 'imp.', 'imp'],
      ...nonFiniteVerbForms,
    },
    pronoun_type: abbreviated(PronounTypeSchema.options, {
      personal: 'pers',
      reflexive: 'refl',
      demonstrative: 'dem',
      intensive: 'intens',
      relative: 'rel',
      interrogative: 'interr',
      indefinite: 'indef',
      possessive: 'poss',
    }),
    declension,
    conjugation,
  };
};

const ANSWER_VARIANTS = createVariantMap();

const normalizeGenderKey = (normalized: string): string => {
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

const variantsFor = (step: FormIdentificationStep, value: string): string[] | undefined => {
  const normalized = value.toLowerCase().trim();
  return ANSWER_VARIANTS[step]?.[step === 'gender' ? normalizeGenderKey(normalized) : normalized];
};

export const getAcceptedAnswersForStep = (step: FormIdentificationStep, correctAnswer: string): string[] =>
  variantsFor(step, correctAnswer) ?? [correctAnswer];

export const getDisplayForm = (step: FormIdentificationStep, value: string): string => {
  const variants = variantsFor(step, value);
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
