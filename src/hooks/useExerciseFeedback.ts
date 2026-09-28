import { useReducer, useCallback, useMemo } from 'react';
import type { FeedbackConfig, FeedbackState, FeedbackAction } from '@/src/types/exercises/base';
import { getEffectiveFeedbackConfig } from '@/src/utils/feedbackDefaults';

const createInitialState = (): FeedbackState => ({
  phase: 'initial',
  currentAttempt: 0,
  activeLevel: null,
  displayMessage: '',
  shouldShowHint: false,
  shouldShowAnswer: false,
  shouldShowExplanation: false,
});

function feedbackReducer(state: FeedbackState, action: FeedbackAction): FeedbackState {
  switch (action.type) {
    case 'ANSWER_INCORRECT': {
      const { escalationLevels } = action;
      const nextAttempt = state.currentAttempt + 1;
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
        currentAttempt: 0,
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

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}

export function useExerciseFeedback(config: FeedbackConfig) {
  const machineConfig = useMemo(() => getEffectiveFeedbackConfig(config), [config]);
  const [state, dispatch] = useReducer(feedbackReducer, undefined, createInitialState);

  const handleCorrect = useCallback(
    (isLastItem?: boolean) => {
      const { successMessage } = machineConfig;
      dispatch({
        type: 'ANSWER_CORRECT',
        successMessage:
          isLastItem && successMessage.completion
            ? successMessage.completion
            : successMessage.advance || successMessage.default || 'Correct!',
        showExplanation: Boolean(successMessage.showExplanation),
      });
    },
    [machineConfig]
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

  const isCorrect = state.phase === 'succeeded' ? true : state.phase === 'attempting' ? false : null;

  const shouldResetExercise =
    machineConfig.maxLevelFailures != null &&
    machineConfig.maxLevelFailures > 0 &&
    state.currentAttempt >= machineConfig.maxLevelFailures;

  const willResetOnNextIncorrect =
    machineConfig.maxLevelFailures != null &&
    machineConfig.maxLevelFailures > 0 &&
    state.currentAttempt + 1 >= machineConfig.maxLevelFailures;

  return {
    feedbackState: state,
    level: state.activeLevel,
    isCorrect,
    message: state.displayMessage,
    showExplanation: state.shouldShowExplanation,
    handleCorrect,
    handleIncorrect,
    clearFeedback,
    reset,
    shouldResetExercise,
    willResetOnNextIncorrect,
    resetExercise: reset,
  };
}
