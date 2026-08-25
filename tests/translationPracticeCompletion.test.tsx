import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TranslationGradingExercise from '@/src/components/ui/exercises/translation-grading-exercise';
import type { TranslationGradingExercise as TranslationGradingExerciseType } from '@/src/types/exercises';
import type { TranslationGradingOutput } from '@/shared/openai/translation-grading';

jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));

const passingResult: TranslationGradingOutput = {
  isPassing: true,
  feedbackLevel: 'Excellent',
  notes: 'Nice work.',
  suggestedText: 'Good translation',
  breakdown: [],
  grammaticalBreakdown: [],
};

jest.mock('@/src/hooks/useTranslationGrading', () => ({
  useTranslationGrading: () => {
    const [data, setData] = React.useState<TranslationGradingOutput | null>(null);
    const grade = async () => {
      setData(passingResult);
      return passingResult;
    };
    const reset = () => setData(null);
    return { grade, reset, isLoading: false, data, error: null };
  },
}));

const exercise: TranslationGradingExerciseType = {
  id: 'translation-all-pass',
  type: 'translation-grading',
  title: 'Translate',
  instructions: '',
  feedbackConfig: {
    escalationLevels: [],
    maxLevelFailures: 3,
    progressionRules: {
      autoAdvanceOnCorrect: false,
      pauseForExplanation: true,
      showProgress: true,
    },
  },
  data: {
    items: [
      { latinText: 'first', instructions: '' },
      { latinText: 'middle', instructions: '' },
      { latinText: 'last', instructions: '' },
    ],
  },
};

describe('translation practice completion', () => {
  it('does not accept completion at the final index while earlier sentences remain', async () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    render(
      <TranslationGradingExercise
        exercise={exercise}
        onComplete={onComplete}
        onCompletionAccepted={onCompletionAccepted}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    fireEvent.change(screen.getByPlaceholderText(/type your english translation/i), {
      target: { value: 'last sentence' },
    });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByText(/2 remaining sentences/i)).toBeInTheDocument());
    expect(onCompletionAccepted).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /finish exercise/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sentence 1' })).toBeInTheDocument();
  });

  it('accepts completion only after every sentence has passed, even if the last index was first', async () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    render(
      <TranslationGradingExercise
        exercise={exercise}
        onComplete={onComplete}
        onCompletionAccepted={onCompletionAccepted}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    fireEvent.change(screen.getByPlaceholderText(/type your english translation/i), {
      target: { value: 'last sentence' },
    });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByRole('button', { name: /review next unpassed/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Sentence 1' }));

    fireEvent.change(screen.getByPlaceholderText(/type your english translation/i), {
      target: { value: 'first sentence' },
    });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByRole('button', { name: /next sentence/i })).toBeInTheDocument());
    expect(onCompletionAccepted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /next sentence/i }));

    fireEvent.change(screen.getByPlaceholderText(/type your english translation/i), {
      target: { value: 'middle sentence' },
    });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByRole('button', { name: /finish exercise/i })).toBeInTheDocument());
    expect(onCompletionAccepted).toHaveBeenCalledWith(100);
    fireEvent.click(screen.getByRole('button', { name: /finish exercise/i }));
    expect(onComplete).toHaveBeenCalledWith(100);
  });

  it('keeps Finish Exercise after browsing among already-passed sentences', async () => {
    const onComplete = jest.fn();
    const onCompletionAccepted = jest.fn();
    render(
      <TranslationGradingExercise
        exercise={exercise}
        onComplete={onComplete}
        onCompletionAccepted={onCompletionAccepted}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/type your english translation/i), {
      target: { value: 'first sentence' },
    });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByRole('button', { name: /next sentence/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /next sentence/i }));

    fireEvent.change(screen.getByPlaceholderText(/type your english translation/i), {
      target: { value: 'middle sentence' },
    });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByRole('button', { name: /next sentence/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /next sentence/i }));

    fireEvent.change(screen.getByPlaceholderText(/type your english translation/i), {
      target: { value: 'last sentence' },
    });
    fireEvent.click(screen.getByTitle('Check Translation'));
    await waitFor(() => expect(screen.getByRole('button', { name: /finish exercise/i })).toBeInTheDocument());
    expect(onCompletionAccepted).toHaveBeenCalledWith(100);

    fireEvent.click(screen.getByRole('button', { name: /^previous$/i }));
    expect(screen.getByRole('button', { name: /finish exercise/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^previous$/i }));
    expect(screen.getByRole('button', { name: /finish exercise/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /finish exercise/i }));
    expect(onComplete).toHaveBeenCalledWith(100);
  });
});
