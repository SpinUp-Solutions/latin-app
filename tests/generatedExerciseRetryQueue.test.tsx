import React, { Activity } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import Translation from '@/src/components/ui/exercises/generated-translation-exercise';
import Morphology from '@/src/components/ui/exercises/generated-form-identification-exercise';
import type { GeneratedTranslationExercise, GeneratedFormIdentificationExercise } from '@/src/types/exercises';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import {
  createGeneratedFormIdentificationItems,
  createGeneratedTranslationItems,
} from '@/src/lib/tests/generated-exercises';
import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

const feedbackConfig = {
  escalationLevels: [{ message: 'Try again later' }, { message: 'Missed again' }],
  maxLevelFailures: 1,
  progressionRules: { autoAdvanceOnCorrect: false, showProgress: true },
};
// How most lessons are set up: a hint on the first level and the answer on the second.
const hintThenAnswer = [
  { message: 'try again', showHint: true, showAnswer: false },
  { message: '', showHint: false, showAnswer: true },
];
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
const gotIt = () => fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
const callbacks = () => ({ onComplete: jest.fn(), onCompletionAccepted: jest.fn() });

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
  expect(screen.getByText('Missed again')).toBeInTheDocument();
  expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
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

it.each(['latin-to-english', 'english-to-latin'] as const)('retries a generated %s translation', direction => {
  const exercise = { ...translation(), translationDirection: direction };
  const words = [{ id: 'word', root_word: 'amo', selected_form: 'amo', translation: 'love', part_of_speech: 'verb' }];
  render(
    <Translation
      exercise={exercise}
      resolvedItems={createGeneratedTranslationItems(exercise, words as ExerciseWordResponse[])}
    />
  );
  answer('wrong');
  next();
  expect(screen.getByText(direction === 'latin-to-english' ? 'amo' : 'love')).toBeInTheDocument();
  answer(direction === 'latin-to-english' ? 'love' : 'amo');
  expect(screen.getByText('1 of 1 complete (100%)')).toBeInTheDocument();
});

it.each(['step', 'multi', 'single'])(
  'requeues the whole %s morphology occurrence, keeping repeated forms independent',
  variant => {
    const exercise = morphology(variant);
    const words = [word('amo', 'first', 'singular'), word('amant', 'third', 'plural')];
    const done = callbacks();
    render(
      <Morphology
        exercise={exercise}
        resolvedItems={createGeneratedFormIdentificationItems(exercise, words)}
        {...done}
      />
    );
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

it('clears previous path constraints on a whole-word retry', () => {
  const ambiguous = word('ambiguous', 'first', 'singular');
  const alternative = word('alternative', 'third', 'plural');
  ambiguous.primary_form_paths = [...ambiguous.primary_form_paths!, ...alternative.primary_form_paths!];
  const exercise = morphology();
  const done = callbacks();
  render(
    <Morphology
      exercise={exercise}
      resolvedItems={createGeneratedFormIdentificationItems(exercise, [ambiguous])}
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
  render(<Translation exercise={exercise} runtimeMode="test" resolvedItems={prompts} onAnswer={onAnswer} />);
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

it.each([
  [undefined, undefined, 5000],
  [750, undefined, 5000],
  [8000, undefined, 5000],
  [5000, 1500, 1500],
  [750, 9000, 9000],
])('holds a mistake for its own delay, five seconds by default (item %s, incorrect %s)', (delay, incorrect, wait) => {
  jest.useFakeTimers();
  const exercise = translation();
  exercise.data.retryIncorrectAnswers = true;
  exercise.itemProgressionDelay = delay;
  exercise.incorrectItemProgressionDelay = incorrect;
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  render(<Translation exercise={exercise} resolvedItems={prompts} />);
  answer('wrong');
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(wait - 1));
  expect(screen.getByText('unus')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByText('duo')).toBeInTheDocument();
});

it('requeues a mistake at once when the incorrect answer delay is zero', () => {
  jest.useFakeTimers();
  const exercise = translation();
  exercise.incorrectItemProgressionDelay = 0;
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  render(<Translation exercise={exercise} resolvedItems={prompts} />);
  answer('wrong');
  act(() => jest.advanceTimersByTime(0));
  expect(screen.getByText('duo')).toBeInTheDocument();
});

it.each([undefined, 750])('still moves on from a correct answer after the exercise delay (%s)', delay => {
  jest.useFakeTimers();
  const exercise = translation();
  exercise.itemProgressionDelay = delay;
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  render(<Translation exercise={exercise} resolvedItems={prompts} />);
  answer('one');
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
  act(() => jest.advanceTimersByTime(4599));
  expect(screen.getByText('unus')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByText('duo')).toBeInTheDocument();
  answer('two');
  act(() => jest.advanceTimersByTime(1000));
  answer('three');
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByText('unus')).toBeInTheDocument();
});

it('resets same-length replacement exercises without keeping old timers', () => {
  jest.useFakeTimers();
  const exercise = translation();
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  const view = render(<Translation exercise={exercise} resolvedItems={[prompts[0]]} />);
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
  const exercise = morphology('multi');
  const done = callbacks();
  render(
    <Morphology
      exercise={exercise}
      resolvedItems={createGeneratedFormIdentificationItems(exercise, [ambiguous])}
      {...done}
    />
  );
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

it.each([true, false])('counts morphology practice progress by word, not step (retry %s)', enabled => {
  const exercise = morphology();
  exercise.data.retryIncorrectAnswers = enabled;
  const words = [word('amo', 'first', 'singular'), word('amant', 'third', 'plural')];
  render(<Morphology exercise={exercise} resolvedItems={createGeneratedFormIdentificationItems(exercise, words)} />);
  // Two words of two steps each: the authored count is 2, not the 4 step items.
  expect(screen.getByText('Word 1 of 2')).toBeInTheDocument();
  answer('first');
  next();
  expect(screen.getByText('Word 1 of 2')).toBeInTheDocument();
  answer('singular');
  expect(screen.getByText('1 of 2 complete (50%)')).toBeInTheDocument();
  next();
  expect(screen.getByText('Word 2 of 2')).toBeInTheDocument();
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

it('uses the automatic delay for a whole-word morphology retry and final completion', () => {
  jest.useFakeTimers();
  const exercise = morphology();
  exercise.itemProgressionDelay = 250;
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  const words = [word('amo', 'first', 'singular'), word('amant', 'third', 'plural')];
  const done = callbacks();
  render(
    <Morphology exercise={exercise} resolvedItems={createGeneratedFormIdentificationItems(exercise, words)} {...done} />
  );
  answer('first');
  act(() => jest.advanceTimersByTime(250));
  answer('wrong');
  act(() => jest.advanceTimersByTime(4999));
  expect(screen.getByText('amo')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
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

it('holds a missed morphology word for the configured incorrect answer delay', () => {
  jest.useFakeTimers();
  const exercise = morphology('single');
  exercise.itemProgressionDelay = 250;
  exercise.incorrectItemProgressionDelay = 1200;
  exercise.feedbackConfig = { ...feedbackConfig, progressionRules: { autoAdvanceOnCorrect: true } };
  const words = [word('amo', 'first', 'singular'), word('amas', 'second', 'singular')];
  render(<Morphology exercise={exercise} resolvedItems={createGeneratedFormIdentificationItems(exercise, words)} />);
  answer('wrong');
  act(() => jest.advanceTimersByTime(1199));
  expect(screen.getByText('amo')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByText('amas')).toBeInTheDocument();
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

it.each([
  ['translation', true],
  ['translation', false],
  ['morphology', true],
  ['morphology', false],
] as const)(
  'keeps a configured correction on screen until the student presses Got it (%s, configured %s)',
  (kind, configured) => {
    jest.useFakeTimers();
    const exercise = kind === 'translation' ? translation() : morphology('single');
    exercise.feedbackConfig = {
      escalationLevels: configured ? [{ message: 'Look at the answer', showAnswer: true }] : [],
      // Neither the explanation pause nor a zero delay decides whether a shown answer waits.
      progressionRules: { autoAdvanceOnCorrect: true, pauseForExplanation: false },
    };
    exercise.itemProgressionDelay = 750;
    exercise.incorrectItemProgressionDelay = configured ? 0 : undefined;
    if (exercise.type === 'generated-translation') {
      render(<Translation exercise={exercise} resolvedItems={prompts} />);
    } else {
      render(
        <Morphology
          exercise={exercise}
          resolvedItems={createGeneratedFormIdentificationItems(exercise, [
            word('amo', 'first', 'singular'),
            word('amas', 'second', 'singular'),
          ])}
        />
      );
    }
    const [missed, following] = kind === 'translation' ? ['unus', 'duo'] : ['amo', 'amas'];
    answer('wrong');
    if (!configured) {
      expect(screen.getByText(/try this word again/)).toBeInTheDocument();
      expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
      act(() => jest.advanceTimersByTime(5000));
      expect(screen.getByText(following)).toBeInTheDocument();
      return;
    }
    act(() => jest.advanceTimersByTime(60000));
    expect(screen.getByText(/Correct answer/)).toBeInTheDocument();
    expect(screen.getByText(missed)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    gotIt();
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
    expect(screen.getByText(following)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeEnabled();
    expect(screen.getByRole('textbox')).toHaveValue('');
  }
);

it('waits for Got it on a shown hint, and keeps the timer when the word has no hint to show', () => {
  jest.useFakeTimers();
  const exercise = translation();
  exercise.feedbackConfig = {
    escalationLevels: [{ message: 'Here is a hint', showHint: true }],
    progressionRules: { autoAdvanceOnCorrect: true },
  };
  render(
    <Translation
      exercise={exercise}
      resolvedItems={[
        { ...prompts[0], hint: 'a number below two' },
        { ...prompts[1], hint: '<p>&nbsp;</p>' },
        prompts[2],
      ]}
    />
  );
  answer('wrong');
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.getByText('a number below two')).toBeInTheDocument();
  expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
  gotIt();
  expect(screen.getByText('duo')).toBeInTheDocument();
  answer('wrong');
  expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('tres')).toBeInTheDocument();
  answer('wrong');
  expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('unus')).toBeInTheDocument();
});

it.each(['translation', 'morphology'] as const)(
  'shows the answer on the first miss when a later level has Show Answer (%s)',
  kind => {
    jest.useFakeTimers();
    const exercise = kind === 'translation' ? translation() : morphology('single');
    exercise.feedbackConfig = { escalationLevels: hintThenAnswer, progressionRules: { autoAdvanceOnCorrect: true } };
    if (exercise.type === 'generated-translation') {
      render(<Translation exercise={exercise} resolvedItems={prompts.map(item => ({ ...item, hint: 'a number' }))} />);
    } else {
      render(
        <Morphology
          exercise={exercise}
          resolvedItems={createGeneratedFormIdentificationItems(exercise, [
            { ...word('amo', 'first', 'singular'), definitions: ['to love'] },
            { ...word('amas', 'second', 'singular'), definitions: ['to love'] },
          ])}
        />
      );
    }
    const [missed, following] = kind === 'translation' ? ['unus', 'duo'] : ['amo', 'amas'];
    answer('wrong');
    act(() => jest.advanceTimersByTime(60000));
    expect(screen.getByText(missed)).toBeInTheDocument();
    expect(screen.getByText(/Correct answer/)).toBeInTheDocument();
    // The answer level replaces the earlier one, so its message and hint are not shown as well.
    expect(screen.queryByText('try again')).not.toBeInTheDocument();
    expect(screen.queryByText(kind === 'translation' ? 'a number' : 'to love')).not.toBeInTheDocument();
    gotIt();
    expect(screen.getByText(following)).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
  }
);

it.each([true, false])('never shows a word definition as a morphology hint (retry queue %s)', queue => {
  jest.useFakeTimers();
  const exercise = morphology('single');
  exercise.data.retryIncorrectAnswers = queue;
  exercise.feedbackConfig = {
    escalationLevels: [{ message: 'try again', showHint: true }],
    progressionRules: { autoAdvanceOnCorrect: true },
  };
  render(
    <Morphology
      exercise={exercise}
      resolvedItems={createGeneratedFormIdentificationItems(exercise, [
        { ...word('amo', 'first', 'singular'), definitions: ['to love'] },
        { ...word('amas', 'second', 'singular'), definitions: ['to love'] },
      ])}
    />
  );
  answer('wrong');
  expect(screen.getByText('try again')).toBeInTheDocument();
  expect(screen.queryByText('to love')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(5000));
  // With nothing to acknowledge the queue moves on by itself; without the queue the word stays for another try.
  expect(screen.getByText(queue ? 'amas' : 'amo')).toBeInTheDocument();
});

it.each(['step', 'multi'])(
  'holds a revealed miss on a later %s morphology step, then restarts the whole word',
  variant => {
    jest.useFakeTimers();
    const exercise = morphology(variant);
    exercise.itemProgressionDelay = 250;
    exercise.feedbackConfig = {
      escalationLevels: [{ showAnswer: true }],
      progressionRules: { autoAdvanceOnCorrect: true },
    };
    const words = [word('amo', 'first', 'singular'), word('amant', 'third', 'plural')];
    const done = callbacks();
    render(
      <Morphology
        exercise={exercise}
        resolvedItems={createGeneratedFormIdentificationItems(exercise, words)}
        {...done}
      />
    );
    const correct = (value: string) => {
      answer(value);
      act(() => jest.advanceTimersByTime(250));
    };
    correct('first');
    answer('wrong');
    act(() => jest.advanceTimersByTime(60000));
    expect(screen.getByText('amo')).toBeInTheDocument();
    expect(screen.getByText(/Correct answer/)).toBeInTheDocument();
    gotIt();
    expect(screen.getByText('amant')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    correct('third');
    correct('plural');
    // The missed word comes back at its first step, so its earlier answer is asked again.
    expect(screen.getByText('amo')).toBeInTheDocument();
    correct('first');
    answer('singular');
    expect(done.onCompletionAccepted).toHaveBeenCalledWith(100);
  }
);

it('keeps a pending Got it when leaving and returning to a lesson page, and drops it for a new exercise', () => {
  jest.useFakeTimers();
  const exercise = translation();
  exercise.feedbackConfig = {
    escalationLevels: [{ showAnswer: true }],
    progressionRules: { autoAdvanceOnCorrect: true },
  };
  const viewAt = (mode: 'visible' | 'hidden', shown = exercise, items = prompts) => (
    <Activity mode={mode}>
      <Translation exercise={shown} resolvedItems={items} />
    </Activity>
  );
  const view = render(viewAt('visible'));
  answer('wrong');
  view.rerender(viewAt('hidden'));
  act(() => jest.advanceTimersByTime(60000));
  view.rerender(viewAt('visible'));
  expect(screen.getByText('unus')).toBeInTheDocument();
  gotIt();
  expect(screen.getByText('duo')).toBeInTheDocument();
  answer('wrong');
  view.rerender(viewAt('visible', { ...exercise, id: 'replacement' }, [prompts[2]]));
  expect(screen.getByText('tres')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeEnabled();
});

it.each([
  ['translation', hintThenAnswer],
  ['translation', [{ showAnswer: true, showHint: true }]],
  ['morphology', hintThenAnswer],
  ['morphology', [{ showAnswer: true, showHint: true }]],
] as const)('shows no feedback and no Got it in a %s test, whatever the levels say (%#)', (kind, levels) => {
  const exercise = kind === 'translation' ? translation() : morphology('single');
  exercise.data.retryIncorrectAnswers = true;
  exercise.feedbackConfig = { escalationLevels: [...levels], progressionRules: { autoAdvanceOnCorrect: true } };
  if (exercise.type === 'generated-translation') {
    render(<Translation exercise={exercise} runtimeMode="test" resolvedItems={prompts} onAnswer={jest.fn()} />);
  } else {
    render(
      <Morphology
        exercise={exercise}
        runtimeMode="test"
        resolvedItems={createGeneratedFormIdentificationItems(exercise, [
          word('amo', 'first', 'singular'),
          word('amas', 'second', 'singular'),
        ])}
        onAnswer={jest.fn()}
      />
    );
  }
  answer('wrong');
  expect(screen.getByText(kind === 'translation' ? 'duo' : 'amas')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
  expect(screen.queryByText(/try again|Incorrect/)).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeEnabled();
});

it.each(['single', 'step'])('accepts 1st in morphology practice (%s)', variant => {
  const exercise = morphology(variant);
  exercise.data.paradigmConfigs = {
    'noun-declension': {
      enabled: true,
      filters: {},
      steps: ['declension'],
      formSelection: { tableType: 'declension', selectedCellPaths: ['nominative.singular'] },
    },
  };
  const formPath = parseFormPathFromString('nominative.singular', 'declension');
  const noun = {
    id: 'villa',
    root_word: 'villa',
    dictionary_entry: null,
    selected_form: 'villa',
    part_of_speech: 'noun',
    declension: '1',
    form_path: formPath,
    primary_form_paths: [formPath],
  } as ExerciseWordResponse;
  const done = callbacks();
  render(
    <Morphology
      exercise={exercise}
      resolvedItems={createGeneratedFormIdentificationItems(exercise, [noun])}
      {...done}
    />
  );
  answer('1st');
  next();
  expect(done.onCompletionAccepted).toHaveBeenCalled();
  expect(done.onComplete).toHaveBeenCalledWith(100);
});
