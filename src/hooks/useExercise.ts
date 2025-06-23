import { useState, useCallback, useRef } from 'react';
import type { FeedbackConfig, FeedbackLevel } from '@/src/types/exercises/base';

interface ExerciseOptions {
  feedbackConfig: FeedbackConfig;
  onComplete?: () => void;
}

interface ExerciseState {
  // Feedback state
  isCorrect: boolean | null;
  message: string;
  level: FeedbackLevel | null;
  attempt: number;
  isProcessing: boolean;
}

interface ExerciseActions {
  // Core feedback actions
  submit: (checkAnswer: () => boolean, hint?: string, correctAnswer?: string) => void;
  handleCorrect: (message?: string) => void;
  handleIncorrect: (message?: string, hint?: string, correctAnswer?: string) => void;
  complete: (message?: string) => void;
  reset: () => void;
}

export function useExercise({ feedbackConfig, onComplete }: ExerciseOptions): ExerciseState & ExerciseActions {
  // Feedback state
  const [attempt, setAttempt] = useState(0);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Computed values
  const levels: FeedbackLevel[] = feedbackConfig.escalationLevels ?? [];
  const level = levels[Math.min(attempt, levels.length - 1)] ?? null;

  // Message builders
  const buildIncorrectMessage = useCallback(
    (customMessage?: string, hint?: string, correctAnswer?: string): string => {
      if (customMessage) return customMessage;
      if (!level) return '';

      let message = level.message || '';

      if (level.showHint && hint) {
        message = message ? `${message} Hint: ${hint}` : `Hint: ${hint}`;
      }

      if (level.showAnswer && correctAnswer) {
        message = `Incorrect. The correct answer is "${correctAnswer}"`;
      }

      return message;
    },
    [level]
  );

  const buildSuccessMessage = useCallback(
    (customMessage?: string): string => {
      if (customMessage) return customMessage;
      return feedbackConfig.successMessage?.default || 'Correct!';
    },
    [feedbackConfig.successMessage]
  );

  const buildCompletionMessage = useCallback(
    (customMessage?: string): string => {
      if (customMessage) return customMessage;
      return feedbackConfig.successMessage?.completion || 'Exercise completed!';
    },
    [feedbackConfig.successMessage]
  );

  // Core actions
  const handleCorrect = useCallback(
    (customMessage?: string) => {
      setIsCorrect(true);
      setMessage(buildSuccessMessage(customMessage));

      if (feedbackConfig.progressionRules?.resetOnCorrect !== false) {
        setAttempt(0);
      }
    },
    [buildSuccessMessage, feedbackConfig.progressionRules?.resetOnCorrect]
  );

  const handleIncorrect = useCallback(
    (customMessage?: string, hint?: string, correctAnswer?: string) => {
      setIsCorrect(false);
      setMessage(buildIncorrectMessage(customMessage, hint, correctAnswer));
      setAttempt(prev => prev + 1);
    },
    [buildIncorrectMessage]
  );

  const complete = useCallback(
    (customMessage?: string) => {
      setIsCorrect(true);
      setMessage(buildCompletionMessage(customMessage));

      if (feedbackConfig.progressionRules?.autoAdvance !== false && onComplete) {
        const delay = feedbackConfig.timingConfig?.nextExerciseDelay || 2500;
        setTimeout(() => {
          onComplete();
        }, delay);
      }
    },
    [buildCompletionMessage, feedbackConfig, onComplete]
  );

  const submit = useCallback(
    (checkAnswer: () => boolean, hint?: string, correctAnswer?: string) => {
      if (isProcessing) return;

      setIsProcessing(true);

      // Clear any existing timeout
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }

      // Small delay to prevent rapid submissions
      submitTimeoutRef.current = setTimeout(() => {
        const correct = checkAnswer();

        if (correct) {
          handleCorrect();

          // Reset processing after progression delay
          const delay = feedbackConfig.timingConfig?.progressionDelay || 800;
          submitTimeoutRef.current = setTimeout(() => {
            setIsProcessing(false);
          }, delay);
        } else {
          handleIncorrect(undefined, hint, correctAnswer);
          setIsProcessing(false);
        }
      }, 50);
    },
    [isProcessing, handleCorrect, handleIncorrect, feedbackConfig.timingConfig]
  );

  const reset = useCallback(() => {
    setAttempt(0);
    setIsCorrect(null);
    setMessage('');
    setIsProcessing(false);

    // Clear any pending timeouts
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }
  }, []);

  return {
    // State
    isCorrect,
    message,
    level,
    attempt,
    isProcessing,

    // Actions
    submit,
    handleCorrect,
    handleIncorrect,
    complete,
    reset,
  };
}
