import type { AdjectiveFormPath, ExerciseWordResponse, VerbFormPath } from '@/src/types/api/exercise-word-responses';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises';
import type {
  FormIdentificationItem,
  FormIdentificationStep,
  MultiAnswerFormIdentificationItem,
  SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import {
  createGeneratedFormIdentificationItems,
  narrowFormIdentificationItem,
} from '@/src/lib/tests/generated-exercises';
import {
  scoreSingleFieldFormIdentificationAnswer,
  validateGeneratedFormIdentificationExercise,
  validateMultiAnswerStep,
  validatePartialMultiAnswerPaths,
  validateSingleFieldFormIdentificationExercise,
} from '@/src/utils/exercises/generatedFormIdentificationExercise';

const finitePath: VerbFormPath = {
  verb_form: 'finite',
  tense: 'present',
  voice: 'active',
  mood: 'indicative',
  person: 'first',
  number: 'singular',
};

const participlePath: VerbFormPath = {
  verb_form: 'participle',
  tense: 'present',
  voice: 'active',
  mood: '',
  person: '',
  number: 'singular',
  case: 'nominative',
  gender: 'masculine',
};

const selectedFinitePath = 'indicative.active.present.singular.first';
const selectedParticiplePath = 'nonFinite.participle.present.active.nominative.masculine.singular';

function makeExercise({
  steps,
  selectedCellPaths = [selectedFinitePath],
  mode = 'step-by-step',
  requireAllPrimaryAnswers = false,
}: {
  steps: FormIdentificationStep[];
  selectedCellPaths?: string[];
  mode?: 'step-by-step' | 'single-field';
  requireAllPrimaryAnswers?: boolean;
}): GeneratedFormIdentificationExercise {
  return {
    id: 'morphology',
    type: 'generated-form-identification',
    title: 'Morphology',
    instructions: '',
    feedbackConfig: { escalationLevels: [] },
    data: {
      mode,
      requireAllPrimaryAnswers,
      generatorConfig: {
        collection: 'vocabulary_words_v5',
        wordSource: 'filters',
        count: 1,
      },
      paradigmConfigs: {
        'verb-conjugation': {
          enabled: true,
          filters: {},
          formSelection: { tableType: 'conjugation', selectedCellPaths },
          steps,
        },
      },
    },
  };
}

function makeNounExercise(
  steps: FormIdentificationStep[],
  mode: 'step-by-step' | 'single-field' = 'step-by-step'
): GeneratedFormIdentificationExercise {
  return {
    ...makeExercise({ steps, mode }),
    data: {
      ...makeExercise({ steps, mode }).data,
      paradigmConfigs: {
        'noun-declension': {
          enabled: true,
          filters: {},
          formSelection: { tableType: 'declension', selectedCellPaths: ['nominative.singular'] },
          steps,
        },
      },
    },
  };
}

function makeVerbWord({
  id,
  formPath,
  selectedForm = 'form',
  primaryFormPaths = formPath ? [formPath] : undefined,
  optionalFormPaths = [],
}: {
  id: string;
  formPath: VerbFormPath | null;
  selectedForm?: string;
  primaryFormPaths?: VerbFormPath[];
  optionalFormPaths?: VerbFormPath[];
}): ExerciseWordResponse {
  return {
    id,
    root_word: 'fero',
    dictionary_entry: 'fero, ferre, tuli, latum',
    selected_form: selectedForm,
    part_of_speech: 'verb',
    form_path: formPath,
    primary_form_paths: primaryFormPaths,
    optional_form_paths: optionalFormPaths,
    conjugation: '3',
  };
}

const stepsForWord = (
  items: ReturnType<typeof createGeneratedFormIdentificationItems>,
  wordId: string
): FormIdentificationStep[] =>
  items
    .filter(item => item.wordId === wordId && 'step' in item)
    .map(item => (item as { step: FormIdentificationStep }).step);

describe('generated form-identification failure boundaries', () => {
  it('keeps the supported case, gender, and number questions for participles', () => {
    const exercise = makeExercise({
      steps: ['case', 'gender', 'number'],
      selectedCellPaths: [selectedParticiplePath],
    });
    const word = makeVerbWord({ id: 'participle', formPath: participlePath });

    expect(stepsForWord(createGeneratedFormIdentificationItems(exercise, [word]), word.id)).toEqual([
      'case',
      'gender',
      'number',
    ]);
  });

  it.each([
    ['gerund', 'genitive'],
    ['supine', 'ablative'],
  ] as const)('keeps case questions for %s forms', (verbForm, caseValue) => {
    const path: VerbFormPath = {
      verb_form: verbForm,
      tense: '',
      voice: '',
      mood: '',
      person: '',
      number: '',
      case: caseValue,
    };
    const exercise = makeExercise({ steps: ['case'], selectedCellPaths: [`${verbForm}.${caseValue}`] });
    const word = makeVerbWord({ id: verbForm, formPath: path });

    expect(stepsForWord(createGeneratedFormIdentificationItems(exercise, [word]), word.id)).toEqual(['case']);
  });

  it('removes case and gender questions from infinitives', () => {
    const infinitivePath: VerbFormPath = {
      verb_form: 'infinitive',
      tense: 'present',
      voice: 'passive',
      mood: '',
      person: '',
      number: '',
    };
    const exercise = makeExercise({
      steps: ['case', 'gender', 'tense', 'voice', 'mood'],
      selectedCellPaths: ['nonFinite.infinitive.present.passive'],
    });
    const word = makeVerbWord({ id: 'infinitive', formPath: infinitivePath });

    expect(stepsForWord(createGeneratedFormIdentificationItems(exercise, [word]), word.id)).toEqual(['tense', 'voice']);
  });

  it('adapts mixed selections per generated form instead of taking a global intersection', () => {
    const exercise = makeExercise({
      steps: ['conjugation', 'verb_form', 'tense', 'voice', 'mood', 'person', 'number', 'case', 'gender'],
      selectedCellPaths: [selectedFinitePath, selectedParticiplePath],
    });
    const finite = makeVerbWord({ id: 'finite', formPath: finitePath });
    const participle = makeVerbWord({ id: 'participle', formPath: participlePath });
    const items = createGeneratedFormIdentificationItems(exercise, [finite, participle]);

    expect(stepsForWord(items, finite.id)).toEqual([
      'conjugation',
      'verb_form',
      'tense',
      'voice',
      'mood',
      'person',
      'number',
    ]);
    expect(stepsForWord(items, participle.id)).toEqual([
      'conjugation',
      'verb_form',
      'tense',
      'voice',
      'number',
      'case',
      'gender',
    ]);
  });

  it('excludes incompatible selected gerunds while retaining answerable finite forms', () => {
    const exercise = makeExercise({
      steps: ['mood'],
      selectedCellPaths: [selectedFinitePath, 'gerund.genitive'],
    });
    const finite = makeVerbWord({ id: 'finite', formPath: finitePath });
    const gerund = makeVerbWord({
      id: 'gerund',
      formPath: { verb_form: 'gerund', tense: '', voice: '', mood: '', person: '', number: '', case: 'genitive' },
    });

    const items = createGeneratedFormIdentificationItems(exercise, [finite, gerund]);

    expect(items.map(item => item.wordId)).toEqual(['finite']);
    expect(stepsForWord(items, 'finite')).toEqual(['mood']);
  });

  it('uses the selected gerund interpretation when a syncretic finite path is also present', () => {
    const exercise = makeExercise({
      steps: ['mood', 'case'],
      selectedCellPaths: [selectedFinitePath, 'gerund.genitive'],
    });
    const gerund = makeVerbWord({
      id: 'gerund-syncretic',
      formPath: { verb_form: 'gerund', tense: '', voice: '', mood: '', person: '', number: '', case: 'genitive' },
      primaryFormPaths: [
        { verb_form: 'gerund', tense: '', voice: '', mood: '', person: '', number: '', case: 'genitive' },
        finitePath,
      ],
    });

    const items = createGeneratedFormIdentificationItems(exercise, [gerund]);

    expect(stepsForWord(items, gerund.id)).toEqual(['case']);
    expect(items[0]?.primaryFormPaths).toEqual([expect.objectContaining({ case: 'genitive' })]);
  });

  it('uses the shared steps when one spelling has finite and participle primary paths', () => {
    const exercise = makeExercise({
      steps: ['conjugation', 'tense', 'voice', 'mood', 'person', 'number', 'case', 'gender'],
      selectedCellPaths: [selectedFinitePath, selectedParticiplePath],
    });
    const word = makeVerbWord({
      id: 'syncretic',
      formPath: finitePath,
      primaryFormPaths: [finitePath, participlePath],
    });

    expect(stepsForWord(createGeneratedFormIdentificationItems(exercise, [word]), word.id)).toEqual([
      'conjugation',
      'tense',
      'voice',
      'number',
    ]);
  });

  it.each(['step-by-step', 'single-field'] as const)(
    'does not create %s items when a verb has no resolved form path',
    mode => {
      const exercise = makeExercise({ steps: ['case', 'gender'], mode });
      const word = makeVerbWord({ id: 'missing-path', formPath: null, primaryFormPaths: undefined });

      expect(createGeneratedFormIdentificationItems(exercise, [word])).toEqual([]);
    }
  );

  it('does not create items for an unrecognized verb form path', () => {
    const exercise = makeExercise({ steps: ['case', 'gender'] });
    const unknownPath = {
      verb_form: 'unknown',
      tense: '',
      voice: '',
      mood: '',
      person: '',
      number: '',
      case: 'nominative',
      gender: 'masculine',
    } as unknown as VerbFormPath;
    const word = makeVerbWord({ id: 'unknown-path', formPath: unknownPath });

    expect(createGeneratedFormIdentificationItems(exercise, [word])).toEqual([]);
  });

  it('does not create a question with a blank selected form', () => {
    const exercise = makeExercise({ steps: ['tense'] });
    const word = makeVerbWord({ id: 'blank-form', formPath: finitePath, selectedForm: ' ' });

    expect(createGeneratedFormIdentificationItems(exercise, [word])).toEqual([]);
  });

  it('does not create a blank question from an incompatible persisted non-verb step', () => {
    const exercise = makeNounExercise(['tense']);
    const word: ExerciseWordResponse = {
      id: 'noun-with-verb-step',
      root_word: 'rosa',
      dictionary_entry: 'rosa, rosae',
      selected_form: 'rosa',
      part_of_speech: 'noun',
      form_path: { case: 'nominative', number: 'singular' },
      primary_form_paths: [{ case: 'nominative', number: 'singular' }],
      declension: '1',
      gender: 'feminine',
    };

    expect(createGeneratedFormIdentificationItems(exercise, [word])).toEqual([]);
  });

  it('does not create an empty single-field item when no steps are configured', () => {
    const exercise = makeNounExercise([], 'single-field');
    const word: ExerciseWordResponse = {
      id: 'noun-without-steps',
      root_word: 'rosa',
      dictionary_entry: 'rosa, rosae',
      selected_form: 'rosa',
      part_of_speech: 'noun',
      form_path: { case: 'nominative', number: 'singular' },
      primary_form_paths: [{ case: 'nominative', number: 'singular' }],
      declension: '1',
      gender: 'feminine',
    };

    expect(createGeneratedFormIdentificationItems(exercise, [word])).toEqual([]);
  });

  it('rejects an optional infinitive path that cannot answer all finite questions', () => {
    const infinitivePath: VerbFormPath = {
      verb_form: 'infinitive',
      tense: 'present',
      voice: 'active',
      mood: '',
      person: '',
      number: '',
    };
    const exercise = makeExercise({ steps: ['verb_form', 'mood', 'person', 'number'] });
    const word = makeVerbWord({
      id: 'finite-with-optional-infinitive',
      formPath: finitePath,
      optionalFormPaths: [infinitivePath],
    });
    const items = createGeneratedFormIdentificationItems(exercise, [word]);
    const verbFormItem = items.find(item => 'step' in item && item.step === 'verb_form');

    expect(verbFormItem?.optionalFormPaths).toEqual([]);
    expect(verbFormItem).toMatchObject({ acceptedAnswers: expect.not.arrayContaining(['infinitive', 'inf.', 'inf']) });
  });

  it('uses the remaining optional interpretation after a previous optional answer', () => {
    const exercise = makeNounExercise(['case', 'number']);
    const word: ExerciseWordResponse = {
      id: 'ambiguous-noun',
      root_word: 'rosa',
      dictionary_entry: 'rosa, rosae',
      selected_form: 'form',
      part_of_speech: 'noun',
      form_path: { case: 'nominative', number: 'singular' },
      primary_form_paths: [{ case: 'nominative', number: 'singular' }],
      optional_form_paths: [{ case: 'accusative', number: 'plural' }],
      declension: '1',
      gender: 'feminine',
    };

    const numberItem = createGeneratedFormIdentificationItems(exercise, [word]).find(
      item => 'step' in item && item.step === 'number'
    ) as FormIdentificationItem;

    expect(narrowFormIdentificationItem(numberItem, { case: 'accusative' })).toMatchObject({
      correctAnswer: 'plural',
      acceptedAnswers: expect.not.arrayContaining(['singular']),
    });
  });

  it('allows repeated step values when distinct primary paths require them', () => {
    const pluralFinitePath: VerbFormPath = { ...finitePath, number: 'plural' };
    const exercise = makeExercise({
      steps: ['person', 'number'],
      requireAllPrimaryAnswers: true,
    });
    const word = makeVerbWord({
      id: 'shared-person',
      formPath: finitePath,
      primaryFormPaths: [finitePath, pluralFinitePath],
    });
    const items = createGeneratedFormIdentificationItems(exercise, [word]) as MultiAnswerFormIdentificationItem[];
    const personItem = items.find(item => item.step === 'person')!;
    const numberItem = items.find(item => item.step === 'number')!;

    expect(personItem.correctAnswerDisplay).toBe('first;first');
    expect(validateMultiAnswerStep('first;first', personItem)).toMatchObject({ isCorrect: true });

    const numberValidation = validateMultiAnswerStep('singular;plural', numberItem);
    expect(numberValidation).toMatchObject({ isCorrect: true });
    expect(
      validatePartialMultiAnswerPaths(
        [validateMultiAnswerStep('first;first', personItem).answerSlots, numberValidation.answerSlots],
        ['person', 'number'],
        numberItem.primaryFormPaths
      )
    ).toMatchObject({ isCorrect: true });
  });

  it('matches overlapping answer aliases to distinct compatible paths', () => {
    expect(
      validatePartialMultiAnswerPaths(
        [['masculine', 'm/f']],
        ['gender'],
        [{ gender: 'masculine-feminine' }, { gender: 'masculine' }]
      )
    ).toMatchObject({ isCorrect: true, failedSlots: [] });
  });
});

function makeAdjectiveExercise({
  steps,
  mode = 'step-by-step',
  requireAllPrimaryAnswers = false,
  selectedCellPaths = [
    'positive.nominative.masculine.singular',
    'comparative.nominative.masculine.singular',
    'superlative.nominative.masculine.singular',
  ],
}: {
  steps: FormIdentificationStep[];
  mode?: 'step-by-step' | 'single-field';
  requireAllPrimaryAnswers?: boolean;
  selectedCellPaths?: string[];
}): GeneratedFormIdentificationExercise {
  return {
    ...makeExercise({ steps, mode, requireAllPrimaryAnswers }),
    data: {
      ...makeExercise({ steps, mode, requireAllPrimaryAnswers }).data,
      paradigmConfigs: {
        'adjective-declension': {
          enabled: true,
          filters: {},
          formSelection: { tableType: 'adjective-declension', selectedCellPaths },
          steps,
        },
      },
    },
  };
}

const makeAdjectiveWord = ({
  id,
  rootWord,
  selectedForm,
  declension,
  formPath,
  primaryFormPaths = [formPath],
  optionalFormPaths = [],
}: {
  id: string;
  rootWord: string;
  selectedForm: string;
  declension: '1-2' | '3' | 'indeclinable';
  formPath: AdjectiveFormPath;
  primaryFormPaths?: AdjectiveFormPath[];
  optionalFormPaths?: AdjectiveFormPath[];
}): ExerciseWordResponse => ({
  id,
  root_word: rootWord,
  dictionary_entry: rootWord,
  selected_form: selectedForm,
  part_of_speech: 'adjective',
  declension,
  form_path: formPath,
  primary_form_paths: primaryFormPaths,
  optional_form_paths: optionalFormPaths,
});

describe('indeclinable nouns and adjectives in morphology exercises', () => {
  const nounPath = (grammaticalCase: string) => ({ case: grammaticalCase, number: 'singular' });
  // fās is spelled the same in the nominative and accusative, so it has two readings.
  const fas: ExerciseWordResponse = {
    id: 'fas',
    root_word: 'fās',
    dictionary_entry: 'fās',
    selected_form: 'fās',
    part_of_speech: 'noun',
    declension: 'indeclinable',
    gender: 'neuter',
    form_path: nounPath('nominative'),
    primary_form_paths: [nounPath('nominative'), nounPath('accusative')],
  };

  const puella: ExerciseWordResponse = {
    id: 'puella',
    root_word: 'puella',
    dictionary_entry: 'puella, -ae',
    selected_form: 'puella',
    part_of_speech: 'noun',
    declension: '1',
    gender: 'feminine',
    form_path: nounPath('nominative'),
    primary_form_paths: [nounPath('nominative')],
  };

  // Singular mīlle: one spelling for every case and gender.
  const millePaths: AdjectiveFormPath[] = ['nominative', 'genitive', 'dative', 'accusative', 'ablative'].flatMap(
    grammaticalCase =>
      ['masculine', 'feminine', 'neuter'].map(gender => ({
        degree: 'positive',
        case: grammaticalCase,
        gender,
        number: 'singular',
      }))
  );
  const mille = makeAdjectiveWord({
    id: 'mille',
    rootWord: 'mīlle',
    selectedForm: 'mīlle',
    declension: 'indeclinable',
    formPath: millePaths[0],
    primaryFormPaths: millePaths,
  });

  const caseNumberGender: FormIdentificationStep[] = ['case', 'number', 'gender'];
  const adjectiveSteps: FormIdentificationStep[] = ['declension', 'degree', 'gender', 'number', 'case'];

  it('asks only "indeclinable" for fās, even when the exercise asks case, number and gender', () => {
    for (const steps of [caseNumberGender, ['declension', ...caseNumberGender] as FormIdentificationStep[]]) {
      const items = createGeneratedFormIdentificationItems(makeNounExercise(steps), [fas]) as FormIdentificationItem[];

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ step: 'declension', correctAnswer: 'indeclinable' });
      for (const answer of ['indeclinable', 'Indeclinable', 'indecl', 'indecl.', 'indcl', 'indcl.', 'indec']) {
        expect(validateGeneratedFormIdentificationExercise(answer, items[0])).toEqual({ isCorrect: true });
      }
      for (const answer of ['3rd', 'nominative', 'neuter', 'ind']) {
        expect(validateGeneratedFormIdentificationExercise(answer, items[0])).toEqual({ isCorrect: false });
      }
    }
  });

  it('wants one "indeclinable" for mīlle when every answer is required, not one per case and gender', () => {
    const items = createGeneratedFormIdentificationItems(
      makeAdjectiveExercise({ steps: adjectiveSteps, requireAllPrimaryAnswers: true }),
      [mille]
    ) as MultiAnswerFormIdentificationItem[];

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      step: 'declension',
      expectedAnswerCount: 1,
      correctAnswerDisplay: 'indeclinable',
    });
    expect(validateMultiAnswerStep('indecl.', items[0])).toMatchObject({ isCorrect: true });
    expect(validateMultiAnswerStep('indeclinable;indeclinable', items[0])).toMatchObject({ isCorrect: false });
  });

  it('gives full marks for "indeclinable" alone in single-field mode, and none for a case', () => {
    const items = [
      ...createGeneratedFormIdentificationItems(makeNounExercise(caseNumberGender, 'single-field'), [fas]),
      ...createGeneratedFormIdentificationItems(
        makeAdjectiveExercise({ steps: adjectiveSteps, mode: 'single-field' }),
        [mille]
      ),
    ] as SingleFieldFormIdentificationItem[];

    for (const item of items) {
      expect(item).toMatchObject({ steps: ['declension'], correctAnswerDisplay: 'indeclinable' });
      expect(scoreSingleFieldFormIdentificationAnswer('indecl.', item)).toEqual({ earnedUnits: 1, availableUnits: 1 });
      expect(validateSingleFieldFormIdentificationExercise('indeclinable', item)).toEqual({ isCorrect: true });
      expect(scoreSingleFieldFormIdentificationAnswer('nominative, singular, neuter', item).earnedUnits).toBe(0);
    }
  });

  it('treats a reading of an indeclinable adjective with no degree as the positive', () => {
    const noDegree = makeAdjectiveWord({
      id: 'no-degree',
      rootWord: 'nēquam',
      selectedForm: 'nēquam',
      declension: 'indeclinable',
      formPath: { degree: '', case: 'nominative', gender: 'masculine', number: 'singular' },
    });
    const items = createGeneratedFormIdentificationItems(makeAdjectiveExercise({ steps: ['case'] }), [
      noDegree,
    ]) as FormIdentificationItem[];

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ step: 'declension', correctAnswer: 'indeclinable' });
  });

  it("asks nothing when the exercise does not drill the word's part of speech", () => {
    expect(createGeneratedFormIdentificationItems(makeAdjectiveExercise({ steps: [] }), [mille])).toEqual([]);
  });

  it('never accepts indeclinable spellings for a declined noun', () => {
    const items = createGeneratedFormIdentificationItems(makeNounExercise(['declension', ...caseNumberGender]), [
      puella,
    ]) as FormIdentificationItem[];

    expect(items.map(item => item.step)).toEqual(['declension', ...caseNumberGender]);
    for (const item of items) {
      expect(validateGeneratedFormIdentificationExercise('indecl', item)).toEqual({ isCorrect: false });
      expect(validateGeneratedFormIdentificationExercise('indeclinable', item)).toEqual({ isCorrect: false });
    }
  });

  it('identifies comparative nēquior in full, as 3rd declension, in all three modes', () => {
    const nequior = makeAdjectiveWord({
      id: 'nequior',
      rootWord: 'nēquam',
      selectedForm: 'nēquior',
      declension: 'indeclinable',
      formPath: { degree: 'comparative', case: 'nominative', gender: 'masculine', number: 'singular' },
    });
    const steps: FormIdentificationStep[] = ['declension', 'degree', 'case', 'number', 'gender'];

    const normalItems = createGeneratedFormIdentificationItems(makeAdjectiveExercise({ steps }), [
      nequior,
    ]) as FormIdentificationItem[];
    expect(normalItems.map(item => item.step)).toEqual(steps);
    const declItem = normalItems.find(item => item.step === 'declension')!;
    expect(validateGeneratedFormIdentificationExercise('3rd', declItem)).toEqual({ isCorrect: true });
    expect(validateGeneratedFormIdentificationExercise('indeclinable', declItem)).toEqual({ isCorrect: false });

    const singleItem = createGeneratedFormIdentificationItems(makeAdjectiveExercise({ steps, mode: 'single-field' }), [
      nequior,
    ])[0] as SingleFieldFormIdentificationItem;
    expect(singleItem.steps).toEqual(steps);
    expect(
      validateSingleFieldFormIdentificationExercise('3rd, comparative, nominative, singular, masculine', singleItem)
    ).toEqual({ isCorrect: true });

    const multiItems = createGeneratedFormIdentificationItems(
      makeAdjectiveExercise({ steps, requireAllPrimaryAnswers: true }),
      [nequior]
    ) as MultiAnswerFormIdentificationItem[];
    expect(multiItems.map(item => item.step)).toEqual(steps);
    expect(validateMultiAnswerStep('3rd', multiItems[0])).toMatchObject({ isCorrect: true });
  });

  it('expects 1st/2nd declension for superlative nēquissimus', () => {
    const nequissimus = makeAdjectiveWord({
      id: 'nequissimus',
      rootWord: 'nēquam',
      selectedForm: 'nēquissimus',
      declension: 'indeclinable',
      formPath: { degree: 'superlative', case: 'nominative', gender: 'masculine', number: 'singular' },
    });
    const items = createGeneratedFormIdentificationItems(makeAdjectiveExercise({ steps: ['declension', 'case'] }), [
      nequissimus,
    ]) as FormIdentificationItem[];

    expect(items.map(item => item.step)).toEqual(['declension', 'case']);
    expect(validateGeneratedFormIdentificationExercise('1st/2nd', items[0])).toEqual({ isCorrect: true });
    expect(validateGeneratedFormIdentificationExercise('indeclinable', items[0])).toEqual({ isCorrect: false });
  });

  it("accepts each reading's declension on a spelling shared by two degrees", () => {
    const posPath: AdjectiveFormPath = {
      degree: 'positive',
      case: 'nominative',
      gender: 'neuter',
      number: 'singular',
    };
    const compPath: AdjectiveFormPath = {
      degree: 'comparative',
      case: 'nominative',
      gender: 'neuter',
      number: 'singular',
    };
    const shared = makeAdjectiveWord({
      id: 'shared-degree',
      rootWord: 'nēquam',
      selectedForm: 'shared',
      declension: 'indeclinable',
      formPath: posPath,
      primaryFormPaths: [posPath, compPath],
    });
    const steps: FormIdentificationStep[] = ['declension', 'degree', 'case'];

    const normalItems = createGeneratedFormIdentificationItems(makeAdjectiveExercise({ steps }), [
      shared,
    ]) as FormIdentificationItem[];
    expect(normalItems.map(item => item.step)).toEqual(steps);
    const [declItem, degreeItem] = normalItems;
    expect(validateGeneratedFormIdentificationExercise('indeclinable', declItem)).toEqual({ isCorrect: true });
    expect(validateGeneratedFormIdentificationExercise('3rd', declItem)).toEqual({ isCorrect: true });
    expect(validateGeneratedFormIdentificationExercise('1st/2nd', declItem)).toEqual({ isCorrect: false });
    // Answering the declension settles which reading the student means.
    expect(narrowFormIdentificationItem(degreeItem, { declension: '3rd' })).toMatchObject({
      correctAnswer: 'comparative',
      acceptedAnswers: expect.not.arrayContaining(['positive']),
    });

    const multiItems = createGeneratedFormIdentificationItems(
      makeAdjectiveExercise({ steps, requireAllPrimaryAnswers: true }),
      [shared]
    ) as MultiAnswerFormIdentificationItem[];
    expect(multiItems.map(item => item.step)).toEqual(steps);
    expect(validateMultiAnswerStep('indeclinable;3rd', multiItems[0])).toMatchObject({ isCorrect: true });
  });

  it.each([
    ['melior', 'bonus', '1-2', 'comparative'],
    ['fortis', 'fortis', '3', 'positive'],
  ] as const)('never accepts "indeclinable" for %s (%s)', (selectedForm, rootWord, declension, degree) => {
    const word = makeAdjectiveWord({
      id: selectedForm,
      rootWord,
      selectedForm,
      declension,
      formPath: { degree, case: 'nominative', gender: 'masculine', number: 'singular' },
    });
    const items = createGeneratedFormIdentificationItems(
      makeAdjectiveExercise({ steps: ['declension', 'degree', 'case'] }),
      [word]
    ) as FormIdentificationItem[];

    expect(items.map(item => item.step)).toEqual(['declension', 'degree', 'case']);
    for (const item of items) {
      expect(validateGeneratedFormIdentificationExercise('indeclinable', item)).toEqual({ isCorrect: false });
    }
  });
});
