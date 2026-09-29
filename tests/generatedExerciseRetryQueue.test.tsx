import React, { Activity } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import Translation from '@/src/components/ui/exercises/generated-translation-exercise';
import Morphology from '@/src/components/ui/exercises/generated-form-identification-exercise';
import { SectionedTestProvider } from '@/src/components/ui/test/sectioned-test-context';
import type { GeneratedTranslationExercise, GeneratedFormIdentificationExercise } from '@/src/types/exercises';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { createGeneratedFormIdentificationItems } from '@/src/lib/tests/generated-exercises';
import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

let mockWords: ExerciseWordResponse[] = [];
let mockLoading = false;
jest.mock('@/src/hooks/usePracticeGeneratedExerciseWords', () => ({
  usePracticeGeneratedExerciseWords: () => ({ data: { words: mockWords }, isLoading: mockLoading, isError: false }),
}));

const feedbackConfig = {
  escalationLevels: [{ message: 'Try again later' }, { message: 'Look at the answer', showAnswer: true }],
  maxLevelFailures: 1,
  progressionRules: { autoAdvanceOnCorrect: false, showProgress: true },
};
const generatorConfig = { collection: VOCABULARY_WORDS_COLLECTION, wordSource: 'filters' as const, count: 3 };
const translation = (): GeneratedTranslationExercise => ({
  id: 'translation',
  type: 'generated-translation',
  title: 'Translate',
  instructions: '',
  feedbackConfig,
  data: { generatorConfig, posConfigs: {} },
});
const prompts = [
  { text: 'unus', acceptedAnswers: ['one'] },
  { text: 'duo', acceptedAnswers: ['two'] },
  { text: 'tres', acceptedAnswers: ['three'] },
];
const morphology = (variant = 'step'): GeneratedFormIdentificationExercise => ({
  id: 'morphology',
  type: 'generated-form-identification',
  title: 'Morphology',
  instructions: '',
  feedbackConfig,
  data: {
    mode: variant === 'single' ? 'single-field' : 'step-by-step',
    requireAllPrimaryAnswers: variant === 'multi',
    generatorConfig,
    paradigmConfigs: {
      'verb-conjugation': {
        enabled: true,
        filters: {},
        steps: ['person', 'number'],
        formSelection: { tableType: 'conjugation', selectedCellPaths: [] },
      },
    },
  },
});
type VerbWord = Extract<ExerciseWordResponse, { part_of_speech: 'verb' }>;
function word(form: string, person: string, number: string): VerbWord {
  const path = parseFormPathFromString(`indicative.active.present.${number}.${person}`, 'conjugation');
  return {
    id: 'same-vocabulary-document',
    root_word: 'amo',
    dictionary_entry: 'amo, amare',
    selected_form: form,
    part_of_speech: 'verb',
    form_path: path,
    primary_form_paths: [path],
  } as VerbWord;
}
const answer = (value: string) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
};
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
const callbacks = () => ({ onComplete: jest.fn(), onCompletionAccepted: jest.fn() });

beforeEach(() => {
  mockWords = [];
  mockLoading = false;
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

it('rotates mistakes, preserves completed words and escalates feedback across retries without forced resets', () => {
  const done = callbacks();
  render(<Translation exercise={translation()} resolvedItems={prompts} {...done} />);
  answer('wrong');
  expect(screen.getByText('unus')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Start over' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  next();
  expect(screen.getByText('duo')).toBeInTheDocument();
  answer('two');
  next();
  answer('wrong');
  next();
  expect(screen.getByText('unus')).toBeInTheDocument();
  answer('wrong again');
  expect(screen.getByText('Look at the answer')).toBeInTheDocument();
  expect(screen.getByText('one')).toBeInTheDocument();
  expect(screen.getByText('1 of 3 complete (33%)')).toBeInTheDocument();
  next();
  expect(screen.getByText('tres')).toBeInTheDocument();
  answer('three');
  next();
  expect(done.onCompletionAccepted).not.toHaveBeenCalled();
  answer('still wrong');
  next();
  expect(screen.getByText('unus')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByText('2 of 3 complete (67%)')).toBeInTheDocument();
  answer('one');
  expect(done.onCompletionAccepted).toHaveBeenCalledTimes(1);
  expect(done.onCompletionAccepted).toHaveBeenCalledWith(100);
  expect(done.onComplete).not.toHaveBeenCalled();
  next();
  expect(done.onComplete).toHaveBeenCalledTimes(1);
  expect(screen.getByText('3 of 3 complete (100%)')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeDisabled();
});

it.each(['filters', 'pool'] as const)('retries the same generated translation in either direction from %s', source => {
  for (const direction of ['latin-to-english', 'english-to-latin'] as const) {
    mockWords = [
      {
        id: 'word',
        root_word: 'amo',
        selected_form: 'amo',
        translation: 'love',
        part_of_speech: 'verb',
      } as ExerciseWordResponse,
    ];
    const exercise = translation();
    exercise.translationDirection = direction;
    exercise.data.generatorConfig = {
      ...generatorConfig,
      wordSource: source,
      poolId: source === 'pool' ? 'pool' : null,
    };
    render(<Translation exercise={exercise} allowGeneratedExerciseQueries />);
    const prompt = direction === 'latin-to-english' ? 'amo' : 'love';
    answer('wrong');
    next();
    expect(screen.getByText(prompt)).toBeInTheDocument();
    answer(direction === 'latin-to-english' ? 'love' : 'amo');
    expect(screen.getByText('1 of 1 complete (100%)')).toBeInTheDocument();
    cleanup();
  }
});

it.each(['step', 'multi', 'single'])(
  'requeues the whole %s morphology occurrence, keeping repeated forms independent',
  variant => {
    mockWords = [word('amo', 'first', 'singular'), word('amant', 'third', 'plural')];
    const done = callbacks();
    render(<Morphology exercise={morphology(variant)} allowGeneratedExerciseQueries {...done} />);
    if (variant !== 'single') {
      answer('first');
      next();
    }
    answer('wrong');
    next();
    expect(screen.getByText('amant')).toBeInTheDocument();
    if (variant !== 'single') {
      answer('third');
      next();
    }
    answer(variant === 'single' ? 'third,plural' : 'plural');
    next();
    expect(screen.getByText('amo')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 complete (50%)')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    if (variant !== 'single') {
      answer('first');
      next();
    }
    answer(variant === 'single' ? 'first,singular' : 'singular');
    expect(done.onCompletionAccepted).toHaveBeenCalledWith(100);
    next();
    expect(done.onComplete).toHaveBeenCalledTimes(1);
  }
);

it.each([false, true])('clears previous path constraints on a whole-word retry (resolved items: %s)', resolved => {
  const ambiguous = word('ambiguous', 'first', 'singular');
  const alternative = word('alternative', 'third', 'plural');
  ambiguous.primary_form_paths = [...ambiguous.primary_form_paths!, ...alternative.primary_form_paths!];
  mockWords = [ambiguous];
  const exercise = morphology();
  const done = callbacks();
  render(
    <Morphology
      exercise={exercise}
      resolvedItems={resolved ? createGeneratedFormIdentificationItems(exercise, mockWords) : undefined}
      allowGeneratedExerciseQueries
      {...done}
    />
  );
  answer('first');
  next();
  answer('plural'); // Inconsistent with first; restart the entire word.
  expect(done.onCompletionAccepted).not.toHaveBeenCalled();
  next();
  answer('third');
  next();
  answer('plural');
  expect(done.onCompletionAccepted).toHaveBeenCalledWith(100);
});

it.each([false, true])('keeps test answer recording sequential regardless of the queue setting (%s)', enabled => {
  const exercise = translation();
  exercise.data.retryIncorrectAnswers = enabled;
  const onAnswer = jest.fn();
  render(
    <SectionedTestProvider value>
      <Translation exercise={exercise} runtimeMode="test" resolvedItems={prompts} onAnswer={onAnswer} />
    </SectionedTestProvider>
  );
  answer('wrong');
  expect(screen.getByText('duo')).toBeInTheDocument();
  answer('also wrong');
  expect(screen.getByText('tres')).toBeInTheDocument();
  expect(onAnswer).toHaveBeenLastCalledWith({ type: 'generated-translation', answers: ['wrong', 'also wrong'] });
});

it('retains legacy retry-in-place and forced-reset behavior when explicitly disabled', () => {
  const exercise = translation();
  exercise.data.retryIncorrectAnswers = false;
  render(<Translation exercise={exercise} resolvedItems={prompts} />);
  answer('wrong');
  expect(screen.getByText('unus')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByRole('textbox')).toBeEnabled();
});

it.each([undefined, 750])('uses the existing automatic delay after mistakes (%s)', delay => {
  jest.useFakeTimers();
  const exercise = translation();
  exercise.data.retryIncorrectAnswers = true;
  exercise.itemProgressionDelay = delay;
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  render(<Translation exercise={exercise} resolvedItems={prompts} />);
  answer('wrong');
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime((delay ?? 2000) - 1));
  expect(screen.getByText('unus')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByText('duo')).toBeInTheDocument();
});

it('pauses a pending retry while the lesson page is hidden and resumes it on return', () => {
  jest.useFakeTimers();
  const exercise = translation();
  exercise.itemProgressionDelay = 1000;
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  const viewAt = (mode: 'visible' | 'hidden') => (
    <Activity mode={mode}>
      <Translation exercise={exercise} resolvedItems={prompts} />
    </Activity>
  );
  const view = render(viewAt('visible'));
  answer('wrong');
  act(() => jest.advanceTimersByTime(400));
  view.rerender(viewAt('hidden'));
  act(() => jest.advanceTimersByTime(10000));
  view.rerender(viewAt('visible'));
  expect(screen.getByText('unus')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(600));
  expect(screen.getByText('duo')).toBeInTheDocument();
  answer('two');
  act(() => jest.advanceTimersByTime(1000));
  answer('three');
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByText('unus')).toBeInTheDocument();
});

it('initializes after loading and resets same-length replacement exercises without keeping old timers', () => {
  jest.useFakeTimers();
  const exercise = translation();
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  mockLoading = true;
  const view = render(<Translation exercise={exercise} allowGeneratedExerciseQueries />);
  mockLoading = false;
  mockWords = [
    {
      id: 'a',
      root_word: 'unus',
      selected_form: 'unus',
      translation: 'one',
      part_of_speech: 'noun',
    } as ExerciseWordResponse,
  ];
  view.rerender(<Translation exercise={exercise} allowGeneratedExerciseQueries />);
  answer('wrong');
  view.rerender(<Translation exercise={{ ...exercise, id: 'replacement' }} resolvedItems={[prompts[1]]} />);
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('duo')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeEnabled();
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByText('0 of 1 complete (0%)')).toBeInTheDocument();
});

it('clears multi-answer slots so a retry can use a different valid ordering', () => {
  const ambiguous = word('ambiguous', 'first', 'singular');
  ambiguous.primary_form_paths = [
    ...ambiguous.primary_form_paths!,
    ...word('other', 'third', 'plural').primary_form_paths!,
  ];
  mockWords = [ambiguous];
  const done = callbacks();
  render(<Morphology exercise={morphology('multi')} allowGeneratedExerciseQueries {...done} />);
  answer('first;third');
  next();
  answer('plural;singular'); // Both values exist, but they do not match the chosen paths.
  expect(done.onCompletionAccepted).not.toHaveBeenCalled();
  next();
  answer('third;first');
  next();
  answer('plural;singular');
  expect(done.onCompletionAccepted).toHaveBeenCalledWith(100);
});

it.each([undefined, true, false])(
  'leaves morphology test mode sequential and restores recorded answers (setting %s)',
  setting => {
    const exercise = morphology();
    exercise.data.retryIncorrectAnswers = setting;
    const items = createGeneratedFormIdentificationItems(exercise, [word('amo', 'first', 'singular')]);
    const onAnswer = jest.fn();
    render(
      <Morphology
        exercise={exercise}
        runtimeMode="test"
        resolvedItems={items}
        initialAnswer={{ type: 'generated-form-identification', answers: { [items[0].id]: 'wrong first answer' } }}
        onAnswer={onAnswer}
      />
    );
    answer('wrong second answer');
    expect(onAnswer).toHaveBeenCalledWith({
      type: 'generated-form-identification',
      answers: {
        [items[0].id]: 'wrong first answer',
        [items[1].id]: 'wrong second answer',
      },
    });
  }
);

it('leaves assessment preview sequential when queue mode defaults to on', () => {
  render(<Translation exercise={translation()} runtimeMode="preview" resolvedItems={prompts} />);
  answer('wrong');
  next();
  expect(screen.getByText('duo')).toBeInTheDocument();
  answer('two');
  next();
  answer('three');
  next();
  expect(screen.queryByText('unus')).not.toBeInTheDocument();
});

it('uses the automatic delay for a whole-word morphology retry and final completion', () => {
  jest.useFakeTimers();
  mockWords = [word('amo', 'first', 'singular'), word('amant', 'third', 'plural')];
  const exercise = morphology();
  exercise.itemProgressionDelay = 250;
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  const done = callbacks();
  render(<Morphology exercise={exercise} allowGeneratedExerciseQueries {...done} />);
  answer('first');
  act(() => jest.advanceTimersByTime(250));
  answer('wrong');
  act(() => jest.advanceTimersByTime(250));
  expect(screen.getByText('amant')).toBeInTheDocument();
  answer('third');
  act(() => jest.advanceTimersByTime(250));
  answer('plural');
  act(() => jest.advanceTimersByTime(250));
  expect(screen.getByText('amo')).toBeInTheDocument();
  answer('first');
  act(() => jest.advanceTimersByTime(250));
  answer('singular');
  expect(done.onCompletionAccepted).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(5000));
  expect(done.onComplete).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox')).toBeDisabled();
});

it('keeps a pending manual retry when leaving and returning to a lesson page', () => {
  const exercise = translation();
  const viewAt = (mode: 'visible' | 'hidden') => (
    <Activity mode={mode}>
      <Translation exercise={exercise} resolvedItems={prompts} />
    </Activity>
  );
  const view = render(viewAt('visible'));
  answer('wrong');
  view.rerender(viewAt('hidden'));
  view.rerender(viewAt('visible'));
  next();
  expect(screen.getByText('duo')).toBeInTheDocument();
  answer('two');
  next();
  answer('three');
  next();
  expect(screen.getByText('unus')).toBeInTheDocument();
});

it('filters malformed resolved morphology items before narrowing their answer paths', () => {
  const exercise = morphology();
  const items = createGeneratedFormIdentificationItems(exercise, [word('amo', 'first', 'singular')]);
  const malformed = { ...items[0], primaryFormPaths: undefined };
  render(<Morphology exercise={exercise} resolvedItems={[malformed as unknown as (typeof items)[number], ...items]} />);
  answer('first');
  next();
  answer('singular');
  expect(screen.getByText('1 of 1 complete (100%)')).toBeInTheDocument();
});
