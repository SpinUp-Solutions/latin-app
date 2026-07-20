import type { ExerciseWordResponse, VerbFormPath } from '@/src/types/api/exercise-word-responses';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import {
  enrichPathsWithSteps,
  extractStepValue,
  getAnswerableStepsForWord,
  getAcceptedAnswersForStep,
  getDisplayForm,
} from '@/src/utils/exercises/formIdentificationHelpers';
import { validateSingleFieldFormIdentificationExercise } from '@/src/utils/exercises/generatedFormIdentificationExercise';
import { hasSelectedForm } from '@/src/utils/exercises/formSelection';
import { getUnsupportedVerbFormStepWarnings } from '@/src/utils/exercises/verbFormStepCompatibility';

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

describe('non-finite verb form identification', () => {
  it('extracts gerund step values', () => {
    const word = makeVerbWord({
      tense: '',
      voice: '',
      mood: 'gerund',
      person: '',
      number: '',
      case: 'genitive',
    });

    expect(extractStepValue(word, 'mood')).toBe('gerund');
    expect(extractStepValue(word, 'case')).toBe('genitive');
    expect(extractStepValue(word, 'conjugation')).toBe('4');
  });

  it('extracts supine step values', () => {
    const word = makeVerbWord({
      tense: '',
      voice: '',
      mood: 'supine',
      person: '',
      number: '',
      case: 'accusative',
    });

    expect(extractStepValue(word, 'mood')).toBe('supine');
    expect(extractStepValue(word, 'case')).toBe('accusative');
  });

  it('extracts participle step values', () => {
    const word = makeVerbWord({
      tense: 'present',
      voice: 'active',
      mood: 'participle',
      person: '',
      number: 'singular',
      case: 'nominative',
      gender: 'masculine',
    });

    expect(extractStepValue(word, 'mood')).toBe('participle');
    expect(extractStepValue(word, 'tense')).toBe('present');
    expect(extractStepValue(word, 'voice')).toBe('active');
    expect(extractStepValue(word, 'case')).toBe('nominative');
    expect(extractStepValue(word, 'gender')).toBe('masculine');
    expect(extractStepValue(word, 'number')).toBe('singular');
  });

  it('populates single-field answer displays for gerunds', () => {
    const word = makeVerbWord({
      tense: '',
      voice: '',
      mood: 'gerund',
      person: '',
      number: '',
      case: 'genitive',
    });
    const steps: FormIdentificationStep[] = ['conjugation', 'mood', 'case'];
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

  it('drops impossible configured steps for infinitive single-field answers', () => {
    const word = makeVerbWord({
      tense: 'present',
      voice: 'passive',
      mood: 'infinitive',
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

    expect(steps).toEqual(['voice', 'tense', 'mood']);
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
    expect(getAcceptedAnswersForStep('gerund')).toEqual(expect.arrayContaining(['gerund', 'ger.', 'ger']));
    expect(getAcceptedAnswersForStep('supine')).toEqual(expect.arrayContaining(['supine', 'sup.', 'sup']));
  });

  it('warns when selected non-finite forms cannot answer selected steps', () => {
    expect(
      getUnsupportedVerbFormStepWarnings(['gerund.genitive'], ['conjugation', 'mood', 'case'])
    ).toEqual([]);
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
