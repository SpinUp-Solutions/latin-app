import { act, renderHook } from '@testing-library/react';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import type { FeedbackConfig } from '@/src/types/exercises/base';

const createConfig = (overrides: Partial<FeedbackConfig> = {}): FeedbackConfig => ({
  escalationLevels: [],
  successMessage: {
    default: 'Correct!',
    completion: 'Done!',
    advance: 'Next!',
    showExplanation: true,
  },
  progressionRules: {
    autoAdvanceOnCorrect: true,
    pauseForExplanation: true,
    showProgress: true,
  },
  ...overrides,
});

describe('useExerciseFeedback', () => {
  it('repeats the last escalation level until the question-based reset threshold is reached', () => {
    const { result } = renderHook(() =>
      useExerciseFeedback(
        createConfig({
          escalationLevels: [{ message: 'Level 1' }, { message: 'Level 2' }],
          maxLevelFailures: 3,
        })
      )
    );

    act(() => {
      result.current.handleIncorrect();
    });

    expect(result.current.feedbackState.currentAttempt).toBe(1);
    expect(result.current.level?.message).toBe('Level 1');
    expect(result.current.shouldResetExercise).toBe(false);

    act(() => {
      result.current.handleIncorrect();
    });

    expect(result.current.feedbackState.currentAttempt).toBe(2);
    expect(result.current.level?.message).toBe('Level 2');
    expect(result.current.shouldResetExercise).toBe(false);

    act(() => {
      result.current.handleIncorrect();
    });

    expect(result.current.feedbackState.currentAttempt).toBe(3);
    expect(result.current.level?.message).toBe('Level 2');
    expect(result.current.shouldResetExercise).toBe(true);
  });

  it('clears the banner without clearing the current question attempt count', () => {
    const { result } = renderHook(() =>
      useExerciseFeedback(
        createConfig({
          escalationLevels: [{ message: 'Level 1' }, { message: 'Level 2' }],
          maxLevelFailures: 3,
        })
      )
    );

    act(() => {
      result.current.handleIncorrect();
    });

    act(() => {
      result.current.clearFeedback();
    });

    expect(result.current.isCorrect).toBeNull();
    expect(result.current.message).toBe('');
    expect(result.current.feedbackState.currentAttempt).toBe(1);

    act(() => {
      result.current.handleIncorrect();
    });

    expect(result.current.feedbackState.currentAttempt).toBe(2);
    expect(result.current.level?.message).toBe('Level 2');
  });

  it('resets the attempt count when moving to a new question', () => {
    const { result } = renderHook(() =>
      useExerciseFeedback(
        createConfig({
          escalationLevels: [{ message: 'Level 1' }, { message: 'Level 2' }],
          maxLevelFailures: 3,
        })
      )
    );

    act(() => {
      result.current.handleIncorrect();
      result.current.handleIncorrect();
    });

    expect(result.current.feedbackState.currentAttempt).toBe(2);

    act(() => {
      result.current.reset();
    });

    expect(result.current.feedbackState.currentAttempt).toBe(0);
    expect(result.current.message).toBe('');

    act(() => {
      result.current.handleIncorrect();
    });

    expect(result.current.feedbackState.currentAttempt).toBe(1);
    expect(result.current.level?.message).toBe('Level 1');
  });

  it('can reset questions even when no escalation levels are configured', () => {
    const { result } = renderHook(() =>
      useExerciseFeedback(
        createConfig({
          escalationLevels: [],
          maxLevelFailures: 2,
        })
      )
    );

    act(() => {
      result.current.handleIncorrect();
    });

    expect(result.current.feedbackState.currentAttempt).toBe(1);
    expect(result.current.level).toBeNull();
    expect(result.current.shouldResetExercise).toBe(false);

    act(() => {
      result.current.handleIncorrect();
    });

    expect(result.current.feedbackState.currentAttempt).toBe(2);
    expect(result.current.level).toBeNull();
    expect(result.current.shouldResetExercise).toBe(true);
  });
});
