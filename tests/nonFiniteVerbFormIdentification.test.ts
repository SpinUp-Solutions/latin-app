import type { ExerciseWordResponse, VerbFormPath } from '@/src/types/api/exercise-word-responses';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises';
import {
  enrichPathsWithSteps,
  extractStepValue,
  getAnswerableStepsForWord,
  getAcceptedAnswersForStep,
  getDisplayForm,
} from '@/src/utils/exercises/formIdentificationHelpers';
import {
  validateGeneratedFormIdentificationExercise,
  validateSingleFieldFormIdentificationExercise,
} from '@/src/utils/exercises/generatedFormIdentificationExercise';
import { hasSelectedForm } from '@/src/utils/exercises/formSelection';
import {
  getUnsupportedVerbFormStepWarnings,
  normalizeVerbFormStepsForSelectedPaths,
} from '@/src/utils/exercises/verbFormStepCompatibility';
import { createGeneratedFormIdentificationItems } from '@/src/lib/tests/generated-exercises';

const makeVerbWord = (formPath: VerbFormPath): ExerciseWordResponse =>
  ({
    id: 'verb-1',
    root_word: 'fero',
    dictionary_entry: 'fero, ferre, tuli, latum',
    selected_form: 'ferendi',
    part_of_speech: 'verb',
    form_path: formPath,
    primary_form_paths: [formPath],
    conjugation: '4',
  }) as ExerciseWordResponse;

const makeStepExercise = (selectedCellPaths: string[]): GeneratedFormIdentificationExercise => ({
  id: 'morphology',
  type: 'generated-form-identification',
  title: 'Morphology',
  instructions: '',
  feedbackConfig: { escalationLevels: [] },
  data: {
    mode: 'step-by-step',
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
        steps: ['mood'],
      },
    },
  },
});

describe('non-finite verb form identification', () => {
  it('extracts gerund step values', () => {
    const word = makeVerbWord({
      verb_form: 'gerund',
      tense: '',
      voice: '',
      mood: '',
      person: '',
      number: '',
      case: 'genitive',
    });

    expect(extractStepValue(word, 'verb_form')).toBe('gerund');
    expect(extractStepValue(word, 'mood')).toBe('');
    expect(extractStepValue(word, 'case')).toBe('genitive');
    expect(extractStepValue(word, 'conjugation')).toBe('4');
  });

  it('extracts supine step values', () => {
    const word = makeVerbWord({
      verb_form: 'supine',
      tense: '',
      voice: '',
      mood: '',
      person: '',
      number: '',
      case: 'accusative',
    });

    expect(extractStepValue(word, 'verb_form')).toBe('supine');
    expect(extractStepValue(word, 'mood')).toBe('');
    expect(extractStepValue(word, 'case')).toBe('accusative');
  });

  it('extracts participle step values', () => {
    const word = makeVerbWord({
      verb_form: 'participle',
      tense: 'present',
      voice: 'active',
      mood: '',
      person: '',
      number: 'singular',
      case: 'nominative',
      gender: 'masculine',
    });

    expect(extractStepValue(word, 'verb_form')).toBe('participle');
    expect(extractStepValue(word, 'mood')).toBe('');
    expect(extractStepValue(word, 'tense')).toBe('present');
    expect(extractStepValue(word, 'voice')).toBe('active');
    expect(extractStepValue(word, 'case')).toBe('nominative');
    expect(extractStepValue(word, 'gender')).toBe('masculine');
    expect(extractStepValue(word, 'number')).toBe('singular');
  });

  it('populates single-field answer displays for gerunds', () => {
    const word = makeVerbWord({
      verb_form: 'gerund',
      tense: '',
      voice: '',
      mood: '',
      person: '',
      number: '',
      case: 'genitive',
    });
    const steps: FormIdentificationStep[] = ['conjugation', 'verb_form', 'case'];
    const paths = enrichPathsWithSteps(word.primary_form_paths || [], word, steps);

    const display = paths
      .map(path =>
        steps
          .map(step => path[step])
          .filter((value): value is string => !!value)
          .map(getDisplayForm)
          .join(',')
      )
      .join(';');

    expect(display).toBe('4,ger,gen');
    expect(hasSelectedForm(word)).toBe(true);
  });

  it('generates a Verb Form question instead of a Mood question for participles', () => {
    const word = makeVerbWord({
      verb_form: 'participle',
      tense: 'present',
      voice: 'active',
      mood: '',
      person: '',
      number: 'singular',
      case: 'nominative',
      gender: 'masculine',
    });
    const exercise = makeStepExercise([
      'nonFinite.participle.present.active.nominative.masculine.singular',
    ]);

    expect(createGeneratedFormIdentificationItems(exercise, [word])).toEqual([
      expect.objectContaining({
        step: 'verb_form',
        correctAnswer: 'participle',
        acceptedAnswers: expect.arrayContaining(['participle', 'part.', 'part']),
      }),
    ]);
  });

  it('continues generating a true Mood question for finite verbs', () => {
    const word = makeVerbWord({
      verb_form: 'finite',
      tense: 'present',
      voice: 'active',
      mood: 'indicative',
      person: 'first',
      number: 'singular',
    });
    const exercise = makeStepExercise(['indicative.active.present.singular.first']);

    expect(createGeneratedFormIdentificationItems(exercise, [word])).toEqual([
      expect.objectContaining({
        step: 'mood',
        correctAnswer: 'indicative',
        acceptedAnswers: expect.arrayContaining(['indicative', 'ind.', 'ind']),
      }),
    ]);
  });

  it('drops impossible configured steps for infinitive single-field answers', () => {
    const word = makeVerbWord({
      verb_form: 'infinitive',
      tense: 'present',
      voice: 'passive',
      mood: '',
      person: '',
      number: '',
    });
    const configuredSteps: FormIdentificationStep[] = ['person', 'number', 'voice', 'tense', 'mood'];
    const steps = getAnswerableStepsForWord(
      word,
      configuredSteps,
      (word.primary_form_paths || []) as Array<Record<string, string | undefined>>
    );
    const primaryFormPaths = enrichPathsWithSteps(word.primary_form_paths || [], word, steps);
    const correctAnswerDisplay = primaryFormPaths
      .map(path =>
        steps
          .map(step => path[step])
          .filter((value): value is string => !!value)
          .map(getDisplayForm)
          .join(',')
      )
      .join(';');

    expect(steps).toEqual(['voice', 'tense', 'verb_form']);
    expect(correctAnswerDisplay).toBe('pass,pres,inf');
    expect(
      validateSingleFieldFormIdentificationExercise('pass, pres, infinitive', {
        id: word.id,
        wordId: word.id,
        word: word.root_word,
        root_word: word.root_word,
        dictionary_entry: word.dictionary_entry,
        selected_form: word.selected_form,
        hasSelectedForm: true,
        steps,
        correctAnswerDisplay,
        primaryFormPaths,
        optionalFormPaths: [],
      }).isCorrect
    ).toBe(true);
  });

  it('accepts gerund and supine answer variants', () => {
    expect(getAcceptedAnswersForStep('finite')).toEqual(expect.arrayContaining(['finite', 'fin.', 'fin']));
    expect(getAcceptedAnswersForStep('gerund')).toEqual(expect.arrayContaining(['gerund', 'ger.', 'ger']));
    expect(getAcceptedAnswersForStep('supine')).toEqual(expect.arrayContaining(['supine', 'sup.', 'sup']));
  });

  it('normalizes legacy configured mood steps based on selected verb forms', () => {
    const configured: FormIdentificationStep[] = ['conjugation', 'tense', 'voice', 'mood'];
    const finitePath = 'indicative.active.present.singular.first';
    const participlePath = 'nonFinite.participle.present.active.nominative.masculine.singular';

    expect(normalizeVerbFormStepsForSelectedPaths([finitePath], configured)).toEqual(configured);
    expect(normalizeVerbFormStepsForSelectedPaths([participlePath], configured)).toEqual([
      'conjugation',
      'tense',
      'voice',
      'verb_form',
    ]);
    expect(normalizeVerbFormStepsForSelectedPaths([finitePath, participlePath], configured)).toEqual([
      'conjugation',
      'tense',
      'voice',
      'verb_form',
      'mood',
    ]);
    expect(
      normalizeVerbFormStepsForSelectedPaths(
        [finitePath, participlePath],
        ['conjugation', 'tense', 'voice', 'verb_form', 'mood']
      )
    ).toEqual(['conjugation', 'tense', 'voice', 'verb_form', 'mood']);
  });

  it('continues grading frozen legacy mood items for existing test attempts', () => {
    expect(
      validateGeneratedFormIdentificationExercise('participle', {
        id: 'legacy-participle-mood',
        wordId: 'verb-1',
        word: 'ferens',
        root_word: 'fero',
        dictionary_entry: 'fero, ferre, tuli, latum',
        selected_form: 'ferens',
        hasSelectedForm: true,
        step: 'mood',
        correctAnswer: 'participle',
        acceptedAnswers: ['participle', 'part.', 'part'],
        primaryFormPaths: [{ mood: 'participle' }],
        optionalFormPaths: [],
      }).isCorrect
    ).toBe(true);
  });

  it('warns when selected non-finite forms cannot answer selected steps', () => {
    expect(getUnsupportedVerbFormStepWarnings(['gerund.genitive'], ['conjugation', 'verb_form', 'case'])).toEqual([]);
    expect(getUnsupportedVerbFormStepWarnings(['gerund.genitive'], ['mood'])).toEqual([
      'Gerund forms cannot answer: mood.',
    ]);
    expect(
      getUnsupportedVerbFormStepWarnings(['gerund.genitive'], ['tense', 'voice', 'person', 'number', 'gender'])
    ).toEqual(['Gerund forms cannot answer: tense, voice, person, number, gender.']);
    expect(
      getUnsupportedVerbFormStepWarnings(
        ['nonFinite.participle.present.active.nominative.masculine.singular'],
        ['person']
      )
    ).toEqual(['Participle forms cannot answer: person.']);
  });
});
