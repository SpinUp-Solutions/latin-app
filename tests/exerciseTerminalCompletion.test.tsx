import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import FillExercise from '@/src/components/ui/exercises/fill-exercise';
import FillEmboldedTextExercise from '@/src/components/ui/exercises/fill-embolded-text-exercise';
import TextSelectionExercise from '@/src/components/ui/exercises/text-selection-exercise';
import GeneratedTranslationExercise from '@/src/components/ui/exercises/generated-translation-exercise';
import GeneratedFormIdentificationExercise from '@/src/components/ui/exercises/generated-form-identification-exercise';
import type { FeedbackConfig } from '@/src/types/exercises/base';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

jest.mock('@/src/store/api/advancedVocabularyApi', () => ({
  useGetGeneratedExerciseWordsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useSaveGeneratedFormDraftMutation: () => [jest.fn()],
  useResetGeneratedFormDraftMutation: () => [jest.fn()],
}));

const base = { id: 'terminal', title: 'Terminal exercise', instructions: '', itemProgressionDelay: 100 };
const generatorConfig = { collection: VOCABULARY_WORDS_COLLECTION, wordSource: 'filters' as const, count: 1 };
const formItem = {
  id: 'form-1',
  wordId: 'word-1',
  word: 'amo',
  root_word: 'amo',
  dictionary_entry: 'amo',
  selected_form: 'amo',
  hasSelectedForm: true,
  step: 'tense' as const,
  correctAnswer: 'present',
  acceptedAnswers: ['present'],
  primaryFormPaths: [{ tense: 'present' }],
  optionalFormPaths: [],
};

type Callbacks = { onComplete: jest.Mock; onCompletionAccepted: jest.Mock };
const inputAnswer = (answer: string) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: answer } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
};

const cases = [
  {
    name: 'fill',
    answer: 'one',
    render: (feedbackConfig: FeedbackConfig, callbacks: Callbacks) => (
      <FillExercise
        exercise={{ ...base, type: 'fill', feedbackConfig, data: { items: [{ text: 'First', answer: 'one' }] } }}
        {...callbacks}
      />
    ),
  },
  {
    name: 'fill embolded text',
    answer: 'one',
    render: (feedbackConfig: FeedbackConfig, callbacks: Callbacks) => (
      <FillEmboldedTextExercise
        exercise={{
          ...base,
          type: 'fill-embolded-text',
          feedbackConfig,
          data: { passage: 'unus', words: [{ wordIndex: 0, correctAnswer: 'one' }] },
        }}
        {...callbacks}
      />
    ),
  },
  {
    name: 'generated translation',
    answer: 'one',
    render: (feedbackConfig: FeedbackConfig, callbacks: Callbacks) => (
      <GeneratedTranslationExercise
        exercise={{ ...base, type: 'generated-translation', feedbackConfig, data: { generatorConfig, posConfigs: {} } }}
        resolvedItems={[{ text: 'unus', acceptedAnswers: ['one'] }]}
        {...callbacks}
      />
    ),
  },
  ...(['step-by-step', 'single-field', 'multi-answer'] as const).map(mode => ({
    name: `generated form ${mode}`,
    answer: 'present',
    render: (feedbackConfig: FeedbackConfig, callbacks: Callbacks) => (
      <GeneratedFormIdentificationExercise
        exercise={{
          ...base,
          type: 'generated-form-identification',
          feedbackConfig,
          data: {
            mode: mode === 'single-field' ? 'single-field' : 'step-by-step',
            requireAllPrimaryAnswers: mode === 'multi-answer',
            generatorConfig,
            paradigmConfigs: {},
          },
        }}
        resolvedItems={[
          mode === 'step-by-step'
            ? formItem
            : {
                ...formItem,
                steps: ['tense'],
                correctAnswerDisplay: 'present',
                stepIndex: 0,
                totalSteps: 1,
                expectedAnswerCount: 1,
              },
        ]}
        {...callbacks}
      />
    ),
  })),
];

describe.each([false, true])('terminal completion with autoAdvanceOnCorrect=%s', autoAdvanceOnCorrect => {
  const feedbackConfig: FeedbackConfig = {
    escalationLevels: [],
    progressionRules: { autoAdvanceOnCorrect, pauseForExplanation: true, showProgress: true },
  };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });
  const advance = () => {
    if (autoAdvanceOnCorrect)
      act(() => {
        jest.advanceTimersByTime(100);
      });
    else fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  };

  it.each(cases)('keeps $name completed and prevents resubmission', ({ render: renderExercise, answer }) => {
    const callbacks = { onComplete: jest.fn(), onCompletionAccepted: jest.fn() };
    render(renderExercise(feedbackConfig, callbacks));
    inputAnswer(answer);
    expect(callbacks.onCompletionAccepted).toHaveBeenCalledWith(100);
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    advance();
    expect(screen.getByText('1 of 1 complete (100%)')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(answer);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    expect(callbacks.onCompletionAccepted).toHaveBeenCalledTimes(1);
  });

  it('keeps a final text selection highlighted and ignores further word clicks', () => {
    const callbacks = { onComplete: jest.fn(), onCompletionAccepted: jest.fn() };
    render(
      <TextSelectionExercise
        exercise={{
          ...base,
          type: 'text-selection',
          feedbackConfig,
          data: { passage: 'unus duo', questions: [{ id: 'select-one', text: 'Select one', correctWordIndex: 0 }] },
        }}
        {...callbacks}
      />
    );
    fireEvent.click(screen.getByText('unus'));
    advance();
    fireEvent.click(screen.getByText('duo'));
    expect(screen.getByText('1 of 1 complete (100%)')).toBeInTheDocument();
    expect(screen.getByText('unus').closest('.text-green-600')).not.toBeNull();
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    expect(callbacks.onCompletionAccepted).toHaveBeenCalledTimes(1);
  });

  it('clears intermediate answers but retains 4/4 after the final answer', () => {
    const callbacks = { onComplete: jest.fn(), onCompletionAccepted: jest.fn() };
    render(
      <FillExercise
        exercise={{
          ...base,
          type: 'fill',
          feedbackConfig,
          data: { items: ['one', 'two', 'three', 'four'].map(answer => ({ text: answer, answer })) },
        }}
        {...callbacks}
      />
    );
    for (const answer of ['one', 'two', 'three']) {
      inputAnswer(answer);
      advance();
      expect(screen.getByRole('textbox')).toHaveValue('');
      expect(screen.getByRole('textbox')).not.toBeDisabled();
      expect(callbacks.onCompletionAccepted).not.toHaveBeenCalled();
    }
    inputAnswer('four');
    advance();
    expect(screen.getByText('4 of 4 complete (100%)')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('four');
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
  });
});
