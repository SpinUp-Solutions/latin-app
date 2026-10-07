import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import MatchingTable from '@/src/components/ui/exercises/matching-table';
import FillExercise from '@/src/components/ui/exercises/fill-exercise';
import { SentenceDiagramStudent } from '@/src/features/sentence-diagramming/SentenceDiagramStudent';
import {
  createEmptySentenceDiagramDocument,
  createSentenceDiagramFeedbackContent,
} from '@/src/features/sentence-diagramming/model';
import type { FeedbackConfig } from '@/src/types/exercises/base';
import type { FillExercise as FillExerciseType } from '@/src/types/exercises/fill';
import type { MatchingExercise } from '@/src/types/exercises/matching';
import type { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';

const timed = { autoAdvanceOnCorrect: true, pauseForExplanation: true, showProgress: true };
const manual = { autoAdvanceOnCorrect: false, pauseForExplanation: true, showProgress: true };
const answerOnMiss: FeedbackConfig = {
  escalationLevels: [{ message: 'Not quite', showAnswer: true }],
  progressionRules: timed,
};
const answerOnSecondMiss: FeedbackConfig = {
  escalationLevels: [{ message: 'Try again' }, { message: 'Here it is', showAnswer: true }],
  progressionRules: manual,
};

const matching = (feedbackConfig: FeedbackConfig, data: Partial<MatchingExercise['data']> = {}): MatchingExercise => ({
  id: 'matching',
  type: 'matching',
  title: 'Match',
  instructions: '',
  itemProgressionDelay: 400,
  feedbackConfig,
  data: {
    leftColumn: [
      { id: 'left-a', value: 'Alpha' },
      { id: 'left-b', value: 'Beta' },
    ],
    rightColumn: [
      { id: 'right-a', value: 'One' },
      { id: 'right-b', value: 'Two' },
    ],
    answers: { 'left-a': 'right-a', 'left-b': 'right-b' },
    ...data,
  },
});
const replacement = {
  leftColumn: [
    { id: 'left-c', value: 'Gamma' },
    { id: 'left-d', value: 'Delta' },
  ],
  rightColumn: [
    { id: 'right-c', value: 'Three' },
    { id: 'right-d', value: 'Four' },
  ],
  answers: { 'left-c': 'right-c', 'left-d': 'right-d' },
};

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const gotIt = () => screen.queryByRole('button', { name: 'Got it' });
const pair = (left: string, right: string) => {
  fireEvent.click(button(left));
  fireEvent.click(button(right));
};
const shownAnswer = () => within(screen.getByText('Correct answer').parentElement!);
const wait = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('matching: a miss that shows a hint or the answer waits for Got it', () => {
  it('keeps the shown answer and the wrong pair until Got it, with the board locked', () => {
    render(<MatchingTable exercise={matching(answerOnMiss)} />);

    pair('Alpha', 'Two');
    wait(5000);

    expect(screen.getByText('Not quite')).toBeInTheDocument();
    expect(shownAnswer().getByText('One')).toBeInTheDocument();
    expect(button('Got it')).not.toHaveFocus();
    for (const name of ['Alpha', 'Beta', 'One', 'Two', /shuffle/i, /clear selection/i]) {
      expect(button(name)).toBeDisabled();
    }

    pair('Beta', 'Two');
    expect(screen.getByText('0 of 2 matches completed')).toBeInTheDocument();
    expect(shownAnswer().getByText('One')).toBeInTheDocument();

    fireEvent.click(button('Got it'));

    expect(screen.queryByText('Not quite')).not.toBeInTheDocument();
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
    expect(gotIt()).not.toBeInTheDocument();
    // The wrong pair is gone: a right-column click on its own no longer completes a pair.
    fireEvent.click(button('One'));
    expect(screen.getByText('0 of 2 matches completed')).toBeInTheDocument();
    pair('Alpha', 'One');
    expect(screen.getByText('1 of 2 matches completed')).toBeInTheDocument();
  });

  it('keeps the miss count through Got it, so later misses stay on the answer level', () => {
    render(<MatchingTable exercise={matching(answerOnSecondMiss)} />);

    pair('Alpha', 'Two');
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(gotIt()).not.toBeInTheDocument();
    expect(button('Beta')).toBeEnabled();
    wait(1000);
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();

    pair('Alpha', 'Two');
    expect(screen.getByText('Here it is')).toBeInTheDocument();
    fireEvent.click(button('Got it'));

    pair('Beta', 'One');
    expect(screen.getByText('Here it is')).toBeInTheDocument();
    expect(shownAnswer().getByText('Two')).toBeInTheDocument();
    expect(gotIt()).toBeInTheDocument();
  });

  it('holds an answer shown by a miss made during the flash of an earlier miss', () => {
    render(<MatchingTable exercise={matching(answerOnSecondMiss)} />);

    pair('Alpha', 'Two');
    pair('Beta', 'One');
    wait(1500);

    expect(screen.getByText('Here it is')).toBeInTheDocument();
    expect(shownAnswer().getByText('Two')).toBeInTheDocument();
    fireEvent.click(button('Got it'));
    expect(button('Alpha')).toBeEnabled();
  });

  it('holds a shown hint', () => {
    const feedbackConfig = { ...answerOnMiss, escalationLevels: [{ message: 'Not quite', showHint: true }] };
    render(<MatchingTable exercise={matching(feedbackConfig, { hint: 'Count the letters' })} />);

    pair('Alpha', 'Two');
    wait(5000);

    expect(screen.getByText('Count the letters')).toBeInTheDocument();
    expect(gotIt()).toBeInTheDocument();
  });

  it.each([
    ['a hint with no text', { showHint: true }, { hint: '<p></p>' }],
    [
      'an answer with no text',
      { showAnswer: true },
      {
        rightColumn: [
          { id: 'right-a', value: '<p></p>' },
          { id: 'right-b', value: 'Two' },
        ],
      },
    ],
  ])('clears a miss after a second when its level shows %s', (_name, level, data) => {
    const feedbackConfig = { ...answerOnMiss, escalationLevels: [{ message: 'Not quite', ...level }] };
    render(<MatchingTable exercise={matching(feedbackConfig, data)} />);

    pair('Alpha', 'Two');

    expect(screen.getByText('Not quite')).toBeInTheDocument();
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
    expect(gotIt()).not.toBeInTheDocument();
    wait(1000);
    expect(screen.queryByText('Not quite')).not.toBeInTheDocument();
    expect(button('Alpha')).toBeEnabled();
  });

  it('starts each round on the first level and completes once after held misses', () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    render(
      <MatchingTable
        exercise={matching(answerOnSecondMiss, { requiredRepetitions: 2 })}
        onComplete={onComplete}
        onCompletionAccepted={onCompletionAccepted}
      />
    );

    pair('Alpha', 'Two');
    wait(1000);
    pair('Alpha', 'Two');
    fireEvent.click(button('Got it'));
    pair('Alpha', 'One');
    pair('Beta', 'Two');
    expect(screen.getByText('Round 2 of 2')).toBeInTheDocument();

    pair('Beta', 'One');
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(gotIt()).not.toBeInTheDocument();
    wait(1000);
    pair('Alpha', 'One');
    pair('Beta', 'Two');

    expect(onCompletionAccepted).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(button('Continue'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps Continue after the last match when a right-column item is clicked', () => {
    const onComplete = jest.fn();
    render(<MatchingTable exercise={matching(answerOnSecondMiss)} onComplete={onComplete} />);

    pair('Alpha', 'One');
    pair('Beta', 'Two');
    fireEvent.click(button('One'));

    expect(button('One')).toBeDisabled();
    fireEvent.click(button('Continue'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('releases a held miss when the exercise content is replaced', () => {
    const view = render(<MatchingTable exercise={matching(answerOnMiss)} />);
    pair('Alpha', 'Two');

    view.rerender(<MatchingTable exercise={matching(answerOnMiss, replacement)} />);

    expect(gotIt()).not.toBeInTheDocument();
    pair('Gamma', 'Three');
    expect(screen.getByText('1 of 2 matches completed')).toBeInTheDocument();
  });

  it.each([
    ['waiting for Continue', manual],
    ['on the completion timer', timed],
  ])('does not complete replaced content from a completion still %s', (_name, progressionRules) => {
    const onComplete = jest.fn();
    const feedbackConfig = { ...answerOnMiss, progressionRules };
    const view = render(<MatchingTable exercise={matching(feedbackConfig)} onComplete={onComplete} />);
    pair('Alpha', 'One');
    pair('Beta', 'Two');

    view.rerender(<MatchingTable exercise={matching(feedbackConfig, replacement)} onComplete={onComplete} />);
    wait(5000);

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(button('Gamma')).toBeEnabled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('shows no feedback and no Got it in test mode', () => {
    const onAnswer = jest.fn();
    render(<MatchingTable exercise={matching(answerOnMiss)} runtimeMode="test" onAnswer={onAnswer} />);

    pair('Alpha', 'Two');

    expect(screen.queryByText('Not quite')).not.toBeInTheDocument();
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
    expect(gotIt()).not.toBeInTheDocument();
    expect(onAnswer).toHaveBeenLastCalledWith({ type: 'matching', rounds: [{ 'left-a': 'right-b' }] });
    expect(button('Beta')).toBeEnabled();
  });
});

describe('the button after a correct answer', () => {
  const fill = (progressionRules: FeedbackConfig['progressionRules']): FillExerciseType => ({
    id: 'fill',
    type: 'fill',
    title: 'Fill',
    instructions: '',
    itemProgressionDelay: 400,
    feedbackConfig: { escalationLevels: [], progressionRules },
    data: {
      items: [
        { text: 'First', answer: 'one', explanation: 'One comes first.' },
        { text: 'Second', answer: 'two' },
      ],
    },
  });
  const answer = (value: string) => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value } });
    fireEvent.click(button('Check'));
  };

  it('says Got it under an explanation and Continue when there is nothing to read', () => {
    render(<FillExercise exercise={fill(manual)} />);

    answer('one');
    expect(screen.getByText('One comes first.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    fireEvent.click(button('Got it'));

    answer('two');
    expect(gotIt()).not.toBeInTheDocument();
    expect(button('Continue')).toBeInTheDocument();
  });

  it('holds an explanation for Got it when auto-advance pauses for explanations', () => {
    render(<FillExercise exercise={fill(timed)} />);

    answer('one');
    wait(5000);

    expect(screen.getByText('One comes first.')).toBeInTheDocument();
    fireEvent.click(button('Got it'));
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('moves on by the timer when the teacher turned the explanation pause off', () => {
    render(<FillExercise exercise={fill({ ...timed, pauseForExplanation: false })} />);

    answer('one');

    expect(screen.getByText('One comes first.')).toBeInTheDocument();
    expect(gotIt()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    wait(400);
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it.each([
    ['Got it', 'The verb comes first.'],
    ['Continue', ''],
  ])('says %s in sentence diagramming for explanation "%s"', (label, explanation) => {
    const annotation = {
      id: 'verb',
      kind: 'verb' as const,
      span: { startTokenIndex: 0, endTokenIndex: 0, startCharOffset: 0, endCharOffset: 3 },
    };
    const exercise: SentenceDiagrammingExercise = {
      id: 'diagram',
      type: 'sentence-diagramming',
      title: 'Diagram',
      instructions: '',
      feedbackConfig: { escalationLevels: [], progressionRules: manual },
      data: {
        ...createEmptySentenceDiagramDocument('amo te', 'I love you', {
          explanation: createSentenceDiagramFeedbackContent(explanation),
        }),
        solutionAnnotations: [annotation],
      },
    };
    const onComplete = jest.fn();
    render(
      <SentenceDiagramStudent
        exercise={exercise}
        onComplete={onComplete}
        initialAnswer={{ type: 'sentence-diagramming', annotations: [annotation] }}
      />
    );

    fireEvent.click(button(/check/i));
    fireEvent.click(button(label));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
