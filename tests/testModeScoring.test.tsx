import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FillExercise from '@/src/components/ui/exercises/fill-exercise';
import MultipleChoiceExercise from '@/src/components/ui/exercises/multiple-choice-exercise';
import ClickOnMultipleWordsExercise from '@/src/components/ui/exercises/click-on-multiple-words';
import ContentRenderer from '@/src/components/ui/lesson/content-renderer';
import { TestRunner } from '@/src/components/ui/admin/TestRunner';
import type { FillExercise as FillExerciseType } from '@/src/types/exercises/fill';
import type { MultipleChoiceExercise as MultipleChoiceExerciseType } from '@/src/types/exercises/multiple-choice';
import type { MatchingExercise } from '@/src/types/exercises/matching';
import type { ClickOnMultipleWordsExercise as ClickOnMultipleWordsExerciseType } from '@/src/types/exercises/click-on-multiple-words';
import type { TestUnit } from '@/src/types/learning-unit';
import type { TestVersion } from '@/src/types/test';

jest.mock('@/src/services/wordLookupService', () => ({}));
jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));
jest.mock('@/src/hooks/useTranslationGrading', () => ({ useTranslationGrading: () => ({}) }));

const manualProgression = {
  escalationLevels: [],
  maxLevelFailures: 1,
  progressionRules: {
    autoAdvanceOnCorrect: false,
    pauseForExplanation: true,
    showProgress: true,
  },
};

describe('exercise test mode scoring', () => {
  it('keeps the admin runner on local preview scoring until frozen attempts are available', async () => {
    const exercise: MultipleChoiceExerciseType = {
      id: 'runner-question',
      type: 'multiple-choice',
      title: 'Runner question',
      instructions: '',
      maxPoints: 2,
      itemProgressionDelay: 0,
      feedbackConfig: {
        ...manualProgression,
        progressionRules: {
          ...manualProgression.progressionRules,
          autoAdvanceOnCorrect: true,
          pauseForExplanation: false,
        },
      },
      data: {
        question: 'Choose one',
        allowMultipleSelections: false,
        options: [
          { id: 'wrong', text: 'Wrong', isCorrect: false },
          { id: 'right', text: 'Right', isCorrect: true },
        ],
      },
    };
    const test: TestUnit = {
      id: 'test',
      kind: 'test',
      title: 'Admin test',
      description: '',
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
      passingPercentage: null,
      rotationVersions: [{ versionId: 'version' }],
    };
    const version: TestVersion = {
      id: 'version',
      name: 'Version',
      pages: [{ id: 'page', items: [exercise] }],
      totalPages: 1,
      totalItems: 1,
      totalExercises: 1,
      totalPoints: 2,
    };

    render(<TestRunner test={test} version={version} embedded />);
    fireEvent.click(screen.getByRole('button', { name: /Right/ }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(await screen.findByText(/Awarded 2 of 2 points/)).toBeInTheDocument();
  });

  it('rounds click-selection scores passed to preview completion without changing grader precision', async () => {
    const onComplete = jest.fn();
    const exercise: ClickOnMultipleWordsExerciseType = {
      id: 'click-preview',
      type: 'click-on-multiple-words',
      title: 'Click',
      instructions: '',
      itemProgressionDelay: 0,
      feedbackConfig: {
        ...manualProgression,
        progressionRules: {
          ...manualProgression.progressionRules,
          autoAdvanceOnCorrect: true,
          pauseForExplanation: false,
        },
      },
      data: {
        passage: 'amo amas amat',
        correctWordIndices: [0, 1, 2],
        allowOverSelection: false,
      },
    };

    render(<ClickOnMultipleWordsExercise exercise={exercise} runtimeMode="preview" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /Word 1: amo/i }));
    fireEvent.click(screen.getByRole('button', { name: /Word 2: amas/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit selections/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(67));
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

    render(<MultipleChoiceExercise exercise={exercise} onComplete={onComplete} testMode />);

    fireEvent.click(screen.getByRole('button', { name: /wrong/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(onComplete).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('advances after each committed multi-item answer without grading locally', () => {
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

    render(<FillExercise exercise={exercise} onComplete={onComplete} testMode />);

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByText('Second')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    fireEvent.click(screen.getByRole('button', { name: /finish exercise/i }));

    expect(onComplete).toHaveBeenCalledWith(0);
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

  it('scores matching preview answers through the canonical matching grader', () => {
    const onComplete = jest.fn();
    const exercise: MatchingExercise = {
      id: 'matching-preview',
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

    render(<ContentRenderer content={exercise} runtimeMode="preview" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));

    expect(onComplete).toHaveBeenCalledWith(50);
  });
});
