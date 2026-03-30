import { useReducer, useCallback, useMemo } from 'react';
import type { FeedbackConfig, FeedbackState, FeedbackAction } from '@/src/types/exercises/base';
import { getEffectiveFeedbackConfig } from '@/src/utils/feedbackDefaults';

// Initial state for the feedback state machine
const createInitialState = (): FeedbackState => ({
  phase: 'initial',
  currentAttempt: 0,
  activeLevel: null,
  displayMessage: '',
  shouldShowHint: false,
  shouldShowAnswer: false,
  shouldShowExplanation: false,
});

// Pure reducer function - handles all state transitions
function feedbackReducer(state: FeedbackState, action: FeedbackAction): FeedbackState {
  switch (action.type) {
    case 'ANSWER_INCORRECT': {
      const { escalationLevels } = action;
      const nextAttempt = state.currentAttempt + 1;

      // Get the escalation level for this attempt (clamped to available levels)
      const levelIndex = Math.min(nextAttempt - 1, escalationLevels.length - 1);
      const activeLevel = escalationLevels[levelIndex] || null;

      return {
        phase: 'attempting',
        currentAttempt: nextAttempt,
        activeLevel,
        displayMessage: activeLevel?.message || '',
        shouldShowHint: Boolean(activeLevel?.showHint),
        shouldShowAnswer: Boolean(activeLevel?.showAnswer),
        shouldShowExplanation: false,
      };
    }

    case 'ANSWER_CORRECT': {
      const { successMessage, showExplanation } = action;

      return {
        phase: 'succeeded',
        currentAttempt: 0, // Reset for next item
        activeLevel: null,
        displayMessage: successMessage,
        shouldShowHint: false,
        shouldShowAnswer: false,
        shouldShowExplanation: showExplanation,
      };
    }

    case 'CLEAR_FEEDBACK': {
      return {
        ...createInitialState(),
        currentAttempt: state.currentAttempt,
      };
    }

    case 'RESET': {
      return createInitialState();
    }

    case 'EXERCISE_RESET':
      return createInitialState();

    default:
      return state;
  }
}

export function useExerciseFeedback(config: FeedbackConfig) {
  const machineConfig = useMemo(() => getEffectiveFeedbackConfig(config), [config]);
  const [state, dispatch] = useReducer(feedbackReducer, undefined, createInitialState);

  const buildSuccessMessage = useCallback(
    (isLastItem?: boolean): string => {
      const { successMessage } = machineConfig;

      if (isLastItem && successMessage?.completion) {
        return successMessage.completion;
      }

      return successMessage?.advance || successMessage?.default || 'Correct!';
    },
    [machineConfig]
  );

  const handleCorrect = useCallback(
    (isLastItem?: boolean) => {
      const successMessage = buildSuccessMessage(isLastItem);
      const showExplanation = Boolean(machineConfig.successMessage?.showExplanation);

      dispatch({
        type: 'ANSWER_CORRECT',
        successMessage,
        showExplanation,
        isLastItem,
      });
    },
    [buildSuccessMessage, machineConfig.successMessage?.showExplanation]
  );

  const handleIncorrect = useCallback(() => {
    dispatch({
      type: 'ANSWER_INCORRECT',
      escalationLevels: machineConfig.escalationLevels,
    });
  }, [machineConfig.escalationLevels]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const clearFeedback = useCallback(() => {
    dispatch({ type: 'CLEAR_FEEDBACK' });
  }, []);

  const resetExercise = useCallback(() => {
    dispatch({ type: 'EXERCISE_RESET' });
  }, []);

  // Derived values for backward compatibility
  const isCorrect = state.phase === 'succeeded' ? true : state.phase === 'attempting' ? false : null;

  const level = state.activeLevel;
  const message = state.displayMessage;
  const showExplanation = state.shouldShowExplanation;

  const shouldResetExercise =
    machineConfig.maxLevelFailures != null &&
    machineConfig.maxLevelFailures > 0 &&
    state.currentAttempt >= machineConfig.maxLevelFailures;

  return {
    // New state machine interface
    feedbackState: state,

    // Backward compatible interface
    level,
    isCorrect,
    message,
    showExplanation,
    handleCorrect,
    handleIncorrect,
    clearFeedback,
    reset,

    // Exercise reset on repeated question failures
    shouldResetExercise,
    resetExercise,
  };
}
