import { useState } from 'react';
import type {
  ClickOnMultipleWordsExercise,
  MultipleChoiceExercise,
  OddOneOutExercise,
  TableFillExercise,
} from '@/src/types/exercise';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';
import { hasVisibleFeedbackContent } from '@/src/utils/feedbackVisibility';
import { useExerciseFeedback } from './useExerciseFeedback';
import { useExerciseProgression } from './useExerciseProgression';

interface SingleAnswerExerciseOptions {
  exercise: MultipleChoiceExercise | OddOneOutExercise | ClickOnMultipleWordsExercise | TableFillExercise;
  runtimeMode?: RuntimeMode;
  initiallySubmitted: boolean;
  onAnswer?: ExerciseAnswerHandler;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
}

/** Submit, feedback and reset flow for exercises the student answers once as a whole. */
export function useSingleAnswerExercise({
  exercise,
  runtimeMode,
  initiallySubmitted,
  onAnswer,
  onComplete,
  onCompletionAccepted,
}: SingleAnswerExerciseOptions) {
  const mode = runtimeMode ?? 'practice';
  const assessmentMode = mode !== 'practice';
  const testAnswerMode = mode === 'test';
  const [hasSubmitted, setHasSubmitted] = useState(initiallySubmitted);
  const [isProcessing, setIsProcessing] = useState(false);
  const { isAwaitingConfirmation, autoAdvanceIfEnabled, confirmAdvance, cancelPendingAdvance } = useExerciseProgression(
    {
      totalItems: 1,
      itemProgressionDelay: exercise.itemProgressionDelay,
      progressionRules: exercise.feedbackConfig.progressionRules,
    }
  );
  const {
    isCorrect,
    message,
    level,
    showExplanation,
    handleCorrect,
    handleIncorrect,
    clearFeedback,
    shouldResetExercise,
    resetExercise,
  } = useExerciseFeedback(exercise.feedbackConfig);

  /** `isAnswerCorrect` runs only outside test mode, where the answer is graded on the spot. */
  const submit = (answer: ExerciseAnswer, isAnswerCorrect: () => boolean) => {
    setIsProcessing(true);
    setHasSubmitted(true);
    if (testAnswerMode) {
      onAnswer?.(answer);
      setIsProcessing(false);
      onComplete?.(0);
      return;
    }

    const score = Math.round(gradeExercisePercentage({ exercise }, answer));

    if (isAnswerCorrect()) {
      handleCorrect(true);
      const hasVisibleExplanation =
        (exercise.feedbackConfig.successMessage?.showExplanation ?? true) &&
        hasVisibleFeedbackContent(exercise.data.explanation);

      autoAdvanceIfEnabled(() => {
        setIsProcessing(false);
        onComplete?.(score);
      }, hasVisibleExplanation);
      if (!assessmentMode) onCompletionAccepted?.(score);
    } else {
      handleIncorrect();
      setIsProcessing(false);
      if (assessmentMode) onComplete?.(score);
    }
  };

  const tryAgain = () => {
    setHasSubmitted(false);
    clearFeedback();
  };

  const startOver = () => {
    cancelPendingAdvance();
    setHasSubmitted(false);
    setIsProcessing(false);
    resetExercise();
  };

  return {
    assessmentMode,
    testAnswerMode,
    hasSubmitted,
    isProcessing,
    resetRequired: mode === 'practice' && shouldResetExercise,
    isCorrect,
    message,
    level,
    showExplanation,
    clearFeedback,
    isAwaitingConfirmation,
    confirmAdvance,
    submit,
    tryAgain,
    startOver,
  };
}
