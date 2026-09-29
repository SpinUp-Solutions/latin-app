import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FillExercise from '@/src/components/ui/exercises/fill-exercise';
import MultipleChoiceExercise from '@/src/components/ui/exercises/multiple-choice-exercise';
import ContentRenderer from '@/src/components/ui/lesson/content-renderer';
import type { FillExercise as FillExerciseType } from '@/src/types/exercises/fill';
import type { MultipleChoiceExercise as MultipleChoiceExerciseType } from '@/src/types/exercises/multiple-choice';
import type { MatchingExercise } from '@/src/types/exercises/matching';
import type { GeneratedTranslationExercise } from '@/src/types/exercises/generated-translation';

jest.mock('@/src/services/wordLookupService', () => ({}));
jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));
jest.mock('@/src/hooks/useTranslationGrading', () => ({ useTranslationGrading: () => ({}) }));
const mockUseGetMultiPosWordsQuery = jest.fn();
jest.mock('@/src/store/api/advancedVocabularyApi', () => ({
  useGetGeneratedExerciseWordsQuery: (...args: unknown[]) => mockUseGetMultiPosWordsQuery(...args),
  useGetMultiPosWordsQuery: (...args: unknown[]) => mockUseGetMultiPosWordsQuery(...args),
  useGetMultiParadigmWordsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));

const manualProgression = {
  escalationLevels: [],
  maxLevelFailures: 1,
  progressionRules: {
    autoAdvanceOnCorrect: false,
    pauseForExplanation: true,
    showProgress: true,
  },
};

describe('exercise runtime-mode scoring', () => {
  beforeEach(() => {
    mockUseGetMultiPosWordsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('does not emit accepted completion in test runtime mode', () => {
    const exercise: MultipleChoiceExerciseType = {
      id: 'mode-gated-completion',
      type: 'multiple-choice',
      title: 'Question',
      instructions: '',
      feedbackConfig: manualProgression,
      data: {
        question: 'Choose one',
        allowMultipleSelections: false,
        options: [{ id: 'right', text: 'Right', isCorrect: true }],
      },
    };

    const testAccepted = jest.fn();
    render(<MultipleChoiceExercise exercise={exercise} runtimeMode="test" onCompletionAccepted={testAccepted} />);
    fireEvent.click(screen.getByRole('button', { name: /right/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    expect(testAccepted).not.toHaveBeenCalled();
  });

  it('scores a multiple-choice exercise on its first submission', () => {
    const onComplete = jest.fn();
    const exercise: MultipleChoiceExerciseType = {
      id: 'multiple-choice-test',
      type: 'multiple-choice',
      title: 'Question',
      instructions: '',
      feedbackConfig: manualProgression,
      data: {
        question: 'Choose one',
        allowMultipleSelections: false,
        options: [
          { id: 'wrong', text: 'Wrong', isCorrect: false },
          { id: 'right', text: 'Right', isCorrect: true },
        ],
      },
    };

    render(<MultipleChoiceExercise exercise={exercise} onComplete={onComplete} runtimeMode="test" />);

    fireEvent.click(screen.getByRole('button', { name: /wrong/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(onComplete).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('advances directly after each recorded multi-item answer without grading locally', () => {
    const onComplete = jest.fn();
    const exercise: FillExerciseType = {
      id: 'fill-test',
      type: 'fill',
      title: 'Fill',
      instructions: '',
      feedbackConfig: manualProgression,
      data: {
        items: [
          { text: 'First', answer: 'one' },
          { text: 'Second', answer: 'two' },
        ],
      },
    };

    render(<FillExercise exercise={exercise} onComplete={onComplete} runtimeMode="test" />);

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));

    expect(onComplete).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('button', { name: /finish exercise/i })).not.toBeInTheDocument();
  });

  it('does not forward an accepted-completion callback from ContentRenderer outside practice', () => {
    const onCompletionAccepted = jest.fn();
    const exercise: FillExerciseType = {
      id: 'fill-gated',
      type: 'fill',
      title: 'Fill',
      instructions: '',
      feedbackConfig: manualProgression,
      data: { items: [{ text: 'First', answer: 'one' }] },
    };

    render(
      <ContentRenderer
        content={exercise}
        runtimeMode="test"
        onCompletionAccepted={onCompletionAccepted}
        onComplete={jest.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'one' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(onCompletionAccepted).not.toHaveBeenCalled();
  });

  it('emits a raw runtime-mode answer under the persisted exercise ID', () => {
    const onAnswer = jest.fn();
    const exercise: MultipleChoiceExerciseType = {
      id: 'persisted-question-id',
      type: 'multiple-choice',
      title: 'Question',
      instructions: '',
      feedbackConfig: manualProgression,
      data: {
        question: 'Choose one',
        allowMultipleSelections: false,
        options: [
          { id: 'a', text: 'Alpha', isCorrect: false },
          { id: 'b', text: 'Beta', isCorrect: true },
        ],
      },
    };

    render(<ContentRenderer content={exercise} runtimeMode="test" pageIndex={2} itemIndex={3} onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(onAnswer).toHaveBeenCalledWith({
      exerciseId: 'persisted-question-id',
      pageIndex: 2,
      itemIndex: 3,
      answer: { type: 'multiple-choice', selectedOptionIds: ['a'] },
    });
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
  });

  it('records one immutable matching selection per pair and round', () => {
    const onAnswer = jest.fn();
    const exercise: MatchingExercise = {
      id: 'matching-test',
      type: 'matching',
      title: 'Match',
      instructions: '',
      feedbackConfig: manualProgression,
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

    render(<ContentRenderer content={exercise} runtimeMode="test" onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'One' }));

    expect(onAnswer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        answer: {
          type: 'matching',
          rounds: [{ 'left-a': 'right-b', 'left-b': 'right-a' }],
        },
      })
    );
  });

  it('resumes on the next matching round after a completed persisted round', () => {
    const onAnswer = jest.fn();
    const exercise: MatchingExercise = {
      id: 'matching-resume',
      type: 'matching',
      title: 'Match twice',
      instructions: '',
      feedbackConfig: manualProgression,
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
        requiredRepetitions: 2,
      },
    };

    render(
      <ContentRenderer
        content={exercise}
        runtimeMode="test"
        initialAnswer={{
          type: 'matching',
          rounds: [{ 'left-a': 'right-a', 'left-b': 'right-b' }],
        }}
        onAnswer={onAnswer}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'One' }));

    expect(onAnswer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        answer: {
          type: 'matching',
          rounds: [{ 'left-a': 'right-a', 'left-b': 'right-b' }, { 'left-a': 'right-a' }],
        },
      })
    );
  });

  it('allows the authoring preview to opt into generated vocabulary queries in test mode', () => {
    mockUseGetMultiPosWordsQuery.mockReturnValue({
      data: { words: [] },
      isLoading: false,
      isError: false,
    });
    const exercise: GeneratedTranslationExercise = {
      id: 'generated-admin-preview',
      type: 'generated-translation',
      title: 'Generated translation',
      instructions: '',
      feedbackConfig: manualProgression,
      data: {
        generatorConfig: {
          collection: 'words',
          wordSource: 'filters',
          count: 1,
        },
        posConfigs: {},
      },
    };

    render(<ContentRenderer content={exercise} runtimeMode="test" allowGeneratedExerciseQueries />);

    expect(mockUseGetMultiPosWordsQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise: expect.objectContaining({ type: 'generated-translation' }),
        source: { kind: 'admin-preview' },
      }),
      expect.objectContaining({ skip: false })
    );
    expect(screen.getByText('No vocabulary found')).toBeInTheDocument();
  });

  it('scopes generated lesson queries to the rendered lesson item', () => {
    mockUseGetMultiPosWordsQuery.mockReturnValue({ data: { words: [] }, isLoading: false, isError: false });
    const exercise: GeneratedTranslationExercise = {
      id: 'generated-lesson-exercise',
      type: 'generated-translation',
      title: 'Generated translation',
      instructions: '',
      feedbackConfig: manualProgression,
      data: {
        generatorConfig: { collection: 'words', wordSource: 'filters', count: 1 },
        posConfigs: {},
      },
    };

    render(
      <ContentRenderer
        content={exercise}
        pageIndex={2}
        itemIndex={3}
        generatedExerciseContext={{ kind: 'lesson', lessonId: 'lesson-1' }}
      />
    );

    expect(mockUseGetMultiPosWordsQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          kind: 'lesson',
          lessonId: 'lesson-1',
          pageIndex: 2,
          itemIndex: 3,
          exerciseId: 'generated-lesson-exercise',
        },
      }),
      expect.objectContaining({ skip: false })
    );
  });
});
