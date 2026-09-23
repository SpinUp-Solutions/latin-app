import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GeneratedFormIdentificationExercise from '@/src/components/ui/exercises/generated-form-identification-exercise';
import type { GeneratedFormIdentificationExercise as Exercise } from '@/src/types/exercises/generated-form-identification';

const mockSave = jest.fn();
const mockQuery = jest.fn();
const mockToastError = jest.fn();

jest.mock('@/src/store/api/advancedVocabularyApi', () => ({
  useGetGeneratedExerciseWordsQuery: (...args: unknown[]) => mockQuery(...args),
  useSaveGeneratedFormDraftMutation: () => [mockSave],
  useResetGeneratedFormDraftMutation: () => [jest.fn()],
}));
jest.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => mockToastError(...args) } }));

const items = ['present', 'imperfect'].map((tense, index) => ({
  id: `word-${index + 1}`,
  wordId: `word-${index + 1}`,
  word: `word-${index + 1}`,
  root_word: `word-${index + 1}`,
  dictionary_entry: `word-${index + 1}`,
  selected_form: `word-${index + 1}`,
  hasSelectedForm: true,
  steps: ['tense' as const],
  correctAnswerDisplay: tense,
  primaryFormPaths: [{ tense }],
  optionalFormPaths: [],
}));

const exercise: Exercise = {
  id: 'form-1',
  type: 'generated-form-identification',
  title: 'Conjugate verbs',
  instructions: '',
  feedbackConfig: {
    escalationLevels: [],
    progressionRules: { autoAdvanceOnCorrect: false, pauseForExplanation: true, showProgress: true },
  },
  data: {
    mode: 'single-field',
    generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count: 2 },
    paradigmConfigs: {},
  },
};

const source = { kind: 'lesson' as const, lessonId: 'lesson-1', pageIndex: 11, itemIndex: 0, exerciseId: 'form-1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReturnValue({
    data: { words: [], draftItems: items, draftAnswers: { 'word-1': 'present' } },
    isLoading: false,
    isError: false,
  });
  mockSave.mockReturnValue({
    unwrap: () => Promise.resolve({ draftAnswers: { 'word-1': 'present', 'word-2': 'imperfect' } }),
  });
});

it('resumes the next generated item after a lesson exit and saves before marking completion', async () => {
  const onCompletionAccepted = jest.fn();
  render(
    <GeneratedFormIdentificationExercise
      exercise={exercise}
      generatedExerciseSource={source}
      onCompletionAccepted={onCompletionAccepted}
    />
  );

  expect(screen.getByText('1 of 2 complete (50%)')).toBeInTheDocument();
  expect(screen.getByText('word-2')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'imperfect' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));

  await waitFor(() => expect(onCompletionAccepted).toHaveBeenCalledWith(100));
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'word-2', answer: 'imperfect' }));
});

it('keeps an accepted item editable when saving its draft fails', async () => {
  mockSave.mockReturnValue({ unwrap: () => Promise.reject(new Error('Connection lost')) });
  const onCompletionAccepted = jest.fn();
  render(
    <GeneratedFormIdentificationExercise
      exercise={exercise}
      generatedExerciseSource={source}
      onCompletionAccepted={onCompletionAccepted}
    />
  );

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'imperfect' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));

  await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Connection lost'));
  expect(onCompletionAccepted).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox')).toBeEnabled();
});
