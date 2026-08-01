import type { ExerciseWordResponse, VerbFormPath } from '@/src/types/api/exercise-word-responses';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises';
import type {
  FormIdentificationStep,
  MultiAnswerFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import { createGeneratedFormIdentificationItems } from '@/src/lib/tests/generated-exercises';
import {
  validateMultiAnswerStep,
  validatePartialMultiAnswerPaths,
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

    expect(stepsForWord(createGeneratedFormIdentificationItems(exercise, [word]), word.id)).toEqual([
      'tense',
      'voice',
      'verb_form',
    ]);
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
      'verb_form',
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

    const items = createGeneratedFormIdentificationItems(exercise, [word], {
      [word.id]: { case: 'accusative' },
    });
    const numberItem = items.find(item => 'step' in item && item.step === 'number');

    expect(numberItem).toMatchObject({ correctAnswer: 'plural' });
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
