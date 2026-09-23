import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MultipleChoiceExercise from '@/src/components/ui/exercises/multiple-choice-exercise';
import MatchingTable from '@/src/components/ui/exercises/matching-table';
import TranslationGradingExercise from '@/src/components/ui/exercises/translation-grading-exercise';
import GeneratedFormIdentificationExercise from '@/src/components/ui/exercises/generated-form-identification-exercise';
import { SentenceDiagramStudent } from '@/src/features/sentence-diagramming/SentenceDiagramStudent';
import { createEmptySentenceDiagramDocument } from '@/src/features/sentence-diagramming/model';
import type { MultipleChoiceExercise as MultipleChoiceExerciseType } from '@/src/types/exercises/multiple-choice';
import type { MatchingExercise } from '@/src/types/exercises/matching';
import type { TranslationGradingExercise as TranslationGradingExerciseType } from '@/src/types/exercises';
import type { GeneratedFormIdentificationExercise as GeneratedFormIdentificationExerciseType } from '@/src/types/exercises/generated-form-identification';
import type { FormIdentificationItem } from '@/src/types/exercises/schemas/form-identification';
import type { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';
import type { TranslationGradingOutput } from '@/shared/openai/translation-grading';

jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));

jest.mock('@/src/store/api/advancedVocabularyApi', () => ({
  useGetGeneratedExerciseWordsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));

jest.mock('@/src/hooks/useTranslationGrading', () => ({
  useTranslationGrading: () => {
    const [data, setData] = React.useState<TranslationGradingOutput | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);

    const grade = async () => {
      setIsLoading(true);
      const result: TranslationGradingOutput = {
        isPassing: false,
        feedbackLevel: 'Not quite right',
        notes: 'Not quite.',
        suggestedText: 'Better translation',
        breakdown: [],
        grammaticalBreakdown: [],
      };
      setData(result);
      setIsLoading(false);
      return result;
    };

    const reset = () => setData(null);

    return {
      grade,
      reset,
      isLoading,
      data,
      error: null,
    };
  },
}));

const resetFeedbackConfig = {
  escalationLevels: [{ message: 'Try again', showAnswer: true }],
  maxLevelFailures: 2,
  progressionRules: {
    autoAdvanceOnCorrect: false,
    pauseForExplanation: true,
    showProgress: true,
  },
};

describe('exercise start over flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('locks multiple choice at threshold and restarts on Start over', () => {
    const onComplete = jest.fn();
    const exercise: MultipleChoiceExerciseType = {
      id: 'mc-reset',
      type: 'multiple-choice',
      title: 'MC',
      instructions: '',
      feedbackConfig: resetFeedbackConfig,
      data: {
        question: 'Pick one',
        allowMultipleSelections: false,
        options: [
          { id: 'a', text: 'Wrong', isCorrect: false },
          { id: 'b', text: 'Right', isCorrect: true },
        ],
      },
    };

    render(<MultipleChoiceExercise exercise={exercise} onComplete={onComplete} />);

    const submitWrong = () => {
      fireEvent.click(screen.getByRole('button', { name: /wrong/i }));
      fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    };

    submitWrong();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    submitWrong();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();
    expect(screen.getByText(/correct answer/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText(/correct answer/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start over/i }));

    expect(screen.getByRole('button', { name: /submit answer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start over/i })).not.toBeInTheDocument();
  });

  it('does not lock preview mode at the reset threshold', () => {
    const onComplete = jest.fn();
    const exercise: MultipleChoiceExerciseType = {
      id: 'mc-preview',
      type: 'multiple-choice',
      title: 'MC',
      instructions: '',
      feedbackConfig: { ...resetFeedbackConfig, maxLevelFailures: 1 },
      data: {
        question: 'Pick one',
        allowMultipleSelections: false,
        options: [
          { id: 'a', text: 'Wrong', isCorrect: false },
          { id: 'b', text: 'Right', isCorrect: true },
        ],
      },
    };

    render(<MultipleChoiceExercise exercise={exercise} runtimeMode="preview" onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /wrong/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(screen.queryByRole('button', { name: /start over/i })).not.toBeInTheDocument();
    expect(onComplete).toHaveBeenCalled();
  });

  it('keeps matching feedback visible at threshold and cancels the earlier clear timeout', () => {
    const exercise: MatchingExercise = {
      id: 'matching-reset',
      type: 'matching',
      title: 'Match',
      instructions: '',
      feedbackConfig: resetFeedbackConfig,
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
      },
    };

    render(<MatchingTable exercise={exercise} />);

    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'One' }));

    expect(screen.getByText(/try again/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeDisabled();
    expect(screen.getByText('Correct answer')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByText(/try again/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /shuffle/i })).toBeDisabled();
  });

  it('does not let a stale matching timeout erase newer correct feedback', () => {
    const exercise: MatchingExercise = {
      id: 'matching-correct-after-wrong',
      type: 'matching',
      title: 'Match',
      instructions: '',
      feedbackConfig: resetFeedbackConfig,
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
      },
    };

    render(<MatchingTable exercise={exercise} />);

    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    fireEvent.click(screen.getByRole('button', { name: 'One' }));

    expect(screen.getByText('Correct!')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByText('Correct!')).toBeInTheDocument();
  });

  it('completes a legacy matching exercise with an orphaned answer key', () => {
    const onCompletionAccepted = jest.fn();
    const exercise: MatchingExercise = {
      id: 'matching-orphaned-answer',
      type: 'matching',
      title: 'Match',
      instructions: '',
      feedbackConfig: resetFeedbackConfig,
      data: {
        leftColumn: [
          { id: 'left-a', value: 'Alpha' },
          { id: 'left-b', value: 'Beta' },
        ],
        rightColumn: [
          { id: 'right-a', value: 'One' },
          { id: 'right-b', value: 'Two' },
        ],
        answers: {
          'left-orphaned': 'right-a',
          'left-a': 'right-a',
          'left-b': 'right-b',
        },
      },
    };

    render(<MatchingTable exercise={exercise} onCompletionAccepted={onCompletionAccepted} />);

    expect(screen.getByText('0 of 2 matches completed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));

    expect(screen.getByText('2 of 2 matches completed')).toBeInTheDocument();
    expect(onCompletionAccepted).toHaveBeenCalledWith(100);
  });

  it('locks translation grading navigation and shows Start over at threshold', async () => {
    jest.useRealTimers();

    const exercise: TranslationGradingExerciseType = {
      id: 'translation-reset',
      type: 'translation-grading',
      title: 'Translate',
      instructions: '',
      feedbackConfig: resetFeedbackConfig,
      data: {
        items: [
          {
            latinText: 'first',
            instructions: '',
          },
          {
            latinText: 'middle',
            instructions: '',
          },
          {
            latinText: 'last',
            instructions: '',
          },
        ],
      },
    };

    render(
      <TranslationGradingExercise
        exercise={exercise}
        initialAnswer={{ type: 'translation-grading', translations: ['completed first', '', ''] }}
      />
    );

    const textarea = screen.getByPlaceholderText(/type your english translation/i);
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled();

    fireEvent.change(textarea, { target: { value: 'wrong one' } });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByText(/not quite right/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled();

    fireEvent.change(textarea, { target: { value: 'wrong two' } });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();

    jest.useFakeTimers();
  });

  it('keeps translation preview interactive without Start over or a delayed reset', async () => {
    jest.useRealTimers();

    const exercise: TranslationGradingExerciseType = {
      id: 'translation-preview-reset',
      type: 'translation-grading',
      title: 'Translate',
      instructions: '',
      itemProgressionDelay: 1,
      feedbackConfig: { ...resetFeedbackConfig, maxLevelFailures: 1 },
      data: {
        items: [{ latinText: 'amo', instructions: '' }],
      },
    };

    render(<TranslationGradingExercise exercise={exercise} runtimeMode="preview" />);

    const textarea = screen.getByPlaceholderText(/type your english translation/i);
    fireEvent.change(textarea, { target: { value: 'preview answer' } });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByText(/not quite right/i)).toBeInTheDocument());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(screen.getByText(/not quite right/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start over/i })).not.toBeInTheDocument();
    expect(textarea).toBeEnabled();
    expect(textarea).toHaveValue('preview answer');

    jest.useFakeTimers();
  });

  it('locks sentence diagram editing and offers Start over at threshold', () => {
    const exercise: SentenceDiagrammingExercise = {
      id: 'diagram-reset',
      type: 'sentence-diagramming',
      title: 'Diagram',
      instructions: '',
      feedbackConfig: resetFeedbackConfig,
      data: createEmptySentenceDiagramDocument('amo te', 'I love you'),
    };

    const { container } = render(
      <SentenceDiagramStudent
        exercise={exercise}
        initialAnswer={{
          type: 'sentence-diagramming',
          annotations: [
            {
              id: 'student-ann-1',
              kind: 'verb',
              span: {
                startTokenIndex: 0,
                endTokenIndex: 0,
                startCharOffset: 0,
                endCharOffset: 3,
              },
            },
          ],
        }}
      />
    );

    const firstToken = container.querySelector('[data-diagram-token-index="0"]');
    const secondToken = container.querySelector('[data-diagram-token-index="1"]');
    expect(firstToken).not.toBeNull();
    expect(secondToken).not.toBeNull();

    fireEvent.mouseUp(firstToken!);
    expect(screen.getByTestId('diagram-selection-summary')).toHaveTextContent('amo');

    const ablativeTool = screen.getByRole('button', { name: /^ablative$/i });
    fireEvent.click(ablativeTool);

    expect(screen.getByRole('button', { name: /undo/i })).toBeEnabled();
    expect(screen.getByTitle('Reset colors')).toBeEnabled();
    expect(screen.getByTitle('Clear all')).toBeEnabled();
    expect(ablativeTool).toBeEnabled();

    const check = () => fireEvent.click(screen.getByRole('button', { name: /check/i }));

    check();
    check();

    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^reset$/i })).toBeDisabled();
    expect(screen.getByTitle('Reset colors')).toBeDisabled();
    expect(screen.getByTitle('Clear all')).toBeDisabled();
    expect(ablativeTool).toBeDisabled();

    fireEvent.mouseUp(secondToken!);
    expect(screen.getByTestId('diagram-selection-summary')).toHaveTextContent('amo');

    fireEvent.click(screen.getByRole('button', { name: /start over/i }));

    expect(screen.queryByRole('button', { name: /start over/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('diagram-selection-summary')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reset$/i })).toBeEnabled();
    expect(screen.getByTitle('Reset colors')).toBeEnabled();
    expect(screen.getByTitle('Clear all')).toBeEnabled();
    expect(ablativeTool).toBeEnabled();
  });

  it('clears accumulated generated form answers on Start over', () => {
    const resolvedItems: FormIdentificationItem[] = [
      {
        id: 'form-1',
        wordId: 'word-1',
        word: 'amo',
        root_word: 'amo',
        dictionary_entry: 'amo',
        selected_form: 'amo',
        hasSelectedForm: true,
        step: 'tense',
        correctAnswer: 'present',
        acceptedAnswers: ['present'],
        primaryFormPaths: [{ tense: 'present' }],
        optionalFormPaths: [],
      },
      {
        id: 'form-2',
        wordId: 'word-2',
        word: 'amas',
        root_word: 'amo',
        dictionary_entry: 'amo',
        selected_form: 'amas',
        hasSelectedForm: true,
        step: 'person',
        correctAnswer: 'second',
        acceptedAnswers: ['second'],
        primaryFormPaths: [{ person: 'second' }],
        optionalFormPaths: [],
      },
    ];

    const exercise: GeneratedFormIdentificationExerciseType = {
      id: 'form-reset',
      type: 'generated-form-identification',
      title: 'Morphology',
      instructions: '',
      feedbackConfig: resetFeedbackConfig,
      data: {
        mode: 'step-by-step',
        showDictionaryEntry: false,
        generatorConfig: {
          collection: 'vocabulary_words_v5',
          wordSource: 'filters',
          count: 2,
        },
        paradigmConfigs: {},
      },
    };

    const onAnswer = jest.fn();
    const { rerender } = render(
      <GeneratedFormIdentificationExercise
        exercise={exercise}
        resolvedItems={resolvedItems}
        allowGeneratedExerciseQueries
      />
    );

    let input = screen.getByPlaceholderText(/type your answer/i);
    fireEvent.change(input, { target: { value: 'present' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    input = screen.getByPlaceholderText(/type your answer/i);
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    fireEvent.change(input, { target: { value: 'wrong again' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start over/i }));

    expect(screen.getByPlaceholderText(/type your answer/i)).toHaveValue('');
    expect(screen.queryByRole('button', { name: /start over/i })).not.toBeInTheDocument();

    rerender(
      <GeneratedFormIdentificationExercise
        exercise={exercise}
        runtimeMode="test"
        onAnswer={onAnswer}
        resolvedItems={resolvedItems}
        allowGeneratedExerciseQueries
      />
    );

    input = screen.getByPlaceholderText(/type your answer/i);
    fireEvent.change(input, { target: { value: 'present' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(onAnswer).toHaveBeenCalledWith({
      type: 'generated-form-identification',
      answers: { 'form-1': 'present' },
    });
  });

  it('uses Continue for matching practice completion when auto-advance is disabled', () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    const exercise: MatchingExercise = {
      id: 'matching-continue',
      type: 'matching',
      title: 'Match',
      instructions: '',
      feedbackConfig: {
        ...resetFeedbackConfig,
        progressionRules: {
          autoAdvanceOnCorrect: false,
          pauseForExplanation: true,
          showProgress: true,
        },
      },
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
      },
    };

    render(
      <MatchingTable exercise={exercise} onComplete={onComplete} onCompletionAccepted={onCompletionAccepted} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));

    expect(onCompletionAccepted).toHaveBeenCalledWith(100);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onComplete).toHaveBeenCalledWith(100);
  });

  it('auto-advances matching practice completion from authored delay', () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    const exercise: MatchingExercise = {
      id: 'matching-auto-advance',
      type: 'matching',
      title: 'Match',
      instructions: '',
      itemProgressionDelay: 400,
      feedbackConfig: {
        ...resetFeedbackConfig,
        progressionRules: {
          autoAdvanceOnCorrect: true,
          pauseForExplanation: false,
          showProgress: true,
        },
      },
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
      },
    };

    render(
      <MatchingTable exercise={exercise} onComplete={onComplete} onCompletionAccepted={onCompletionAccepted} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));

    expect(onCompletionAccepted).toHaveBeenCalledWith(100);
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(onComplete).toHaveBeenCalledWith(100);
  });
});
