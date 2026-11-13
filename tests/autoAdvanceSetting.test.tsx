import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import lessonEditorReducer, { setTestVersion, startEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { ExerciseFeedbackSection } from '@/src/components/ui/admin/content-editor/ExerciseFeedbackSection';
import { TranslationGradingEditor } from '@/src/components/ui/admin/content-editor/TranslationGradingEditor';
import MultipleChoiceExercise from '@/src/components/ui/exercises/multiple-choice-exercise';
import { createNewContent } from '@/src/utils/contentFactory';
import { DEFAULT_ITEM_PROGRESSION_DELAY } from '@/src/utils/feedbackDefaults';
import type { FeedbackConfig } from '@/src/types/exercises/base';
import type { MultipleChoiceExercise as MultipleChoiceExerciseType } from '@/src/types/exercises/multiple-choice';
import type { TranslationGradingExercise } from '@/src/types/exercises';

jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));
jest.mock('@/src/components/ui/admin/content-editor/AudioUploadSection', () => ({ AudioUploadSection: () => null }));

// Saved before `autoAdvanceOnCorrect` replaced `autoAdvance`, and never touched since: the field is unset.
const legacyFeedback: FeedbackConfig = { escalationLevels: [], progressionRules: { showProgress: true } };
const unsetConfigs: [string, FeedbackConfig][] = [
  ['rules without the field', legacyFeedback],
  ['no rules at all', { escalationLevels: [] }],
];

const openProgressionRules = () => fireEvent.click(screen.getByText('Progression Rules'));
const autoAdvanceBox = () => screen.getByRole('checkbox', { name: 'Auto-advance on correct answer' });

describe('auto-advance setting in the editor', () => {
  it.each(unsetConfigs)('shows %s as not auto-advancing, as students experience it', (_, feedbackConfig) => {
    render(<ExerciseFeedbackSection feedbackConfig={feedbackConfig} onChange={jest.fn()} />);
    openProgressionRules();

    expect(autoAdvanceBox()).not.toBeChecked();
  });

  it.each(unsetConfigs)('keeps auto-advance off for %s when another setting changes', (_, feedbackConfig) => {
    const onChange = jest.fn();
    render(<ExerciseFeedbackSection feedbackConfig={feedbackConfig} onChange={onChange} />);
    openProgressionRules();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show progress indicator' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        progressionRules: expect.objectContaining({ showProgress: false, autoAdvanceOnCorrect: false }),
      })
    );
  });

  it('turns auto-advance on only when its box is ticked', () => {
    const onChange = jest.fn();
    render(<ExerciseFeedbackSection feedbackConfig={legacyFeedback} onChange={onChange} />);
    openProgressionRules();

    fireEvent.click(autoAdvanceBox());

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressionRules: expect.objectContaining({ autoAdvanceOnCorrect: true }) })
    );
  });

  it('leaves the auto-advance settings out for translation grading, which always moves on manually', () => {
    const exercise: TranslationGradingExercise = {
      id: 'translation',
      type: 'translation-grading',
      title: 'Translate',
      instructions: '',
      feedbackConfig: legacyFeedback,
      data: { items: [{ latinText: 'amo' }] },
    };
    const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
    store.dispatch(
      setTestVersion({
        id: 'version',
        name: 'Version',
        pages: [{ id: 'page', items: [exercise] }],
        totalPages: 1,
        totalItems: 1,
        totalExercises: 1,
        totalPoints: 1,
      })
    );
    store.dispatch(startEditingContent({ pageIndex: 0, itemIndex: 0 }));
    render(
      <Provider store={store}>
        <TranslationGradingEditor />
      </Provider>
    );
    openProgressionRules();

    expect(screen.getByRole('checkbox', { name: 'Show progress indicator' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Auto-advance on correct answer' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Auto-advance applies when/)).not.toBeInTheDocument();
    expect(screen.queryByText('Timing Configuration')).not.toBeInTheDocument();
  });
});

describe('auto-advance at runtime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const newMultipleChoice = (): MultipleChoiceExerciseType => {
    const created = createNewContent('multiple-choice') as MultipleChoiceExerciseType;
    // Without an explanation, nothing on screen holds the item for "Got it".
    return { ...created, data: { ...created.data, explanation: '' } };
  };

  const answerCorrectly = () => {
    fireEvent.click(screen.getByRole('button', { name: /option a/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
  };

  it('auto-advances a newly created exercise', () => {
    const exercise = newMultipleChoice();
    expect(exercise.feedbackConfig.progressionRules?.autoAdvanceOnCorrect).toBe(true);
    const onComplete = jest.fn();
    render(<MultipleChoiceExercise exercise={exercise} onComplete={onComplete} />);

    answerCorrectly();
    act(() => {
      jest.advanceTimersByTime(DEFAULT_ITEM_PROGRESSION_DELAY);
    });

    expect(onComplete).toHaveBeenCalledWith(100);
  });

  it.each(unsetConfigs)('waits for Continue on an exercise saved with %s', (_, feedbackConfig) => {
    const exercise = { ...newMultipleChoice(), feedbackConfig };
    const onComplete = jest.fn();
    render(<MultipleChoiceExercise exercise={exercise} onComplete={onComplete} />);

    answerCorrectly();
    act(() => {
      jest.advanceTimersByTime(DEFAULT_ITEM_PROGRESSION_DELAY * 5);
    });

    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onComplete).toHaveBeenCalledWith(100);
  });
});
