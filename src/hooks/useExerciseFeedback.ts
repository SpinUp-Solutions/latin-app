import { useState, useCallback } from 'react';
import type { FeedbackConfig, FeedbackLevel } from '@/src/types/exercises/base';

interface FeedbackState {
  isCorrect: boolean | null;
  message: string;
  level: FeedbackLevel | null;
  attempt: number;
}

interface FeedbackActions {
  handleCorrect: (isLastItem?: boolean) => void;
  handleIncorrect: (hint?: string, correctAnswer?: string) => void;
  reset: () => void;
  buildIncorrectMessage: (hint?: string, correctAnswer?: string) => string;
  buildSuccessMessage: (isLastItem?: boolean) => string;
}

export function useExerciseFeedback(config: FeedbackConfig): FeedbackState & FeedbackActions {
  const levels: FeedbackLevel[] = config.escalationLevels ?? [];
  const [attempt, setAttempt] = useState(0);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>('');

  /** Returns the current escalation level. */
  const level = levels[Math.min(attempt, levels.length - 1)] ?? null;

  const buildIncorrectMessage = useCallback(
    (hint?: string, correctAnswer?: string): string => {
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
    (isLastItem?: boolean): string => {
      if (isLastItem && config.successMessage?.completion) {
        return config.successMessage.completion;
      }

      return config.successMessage?.advance || config.successMessage?.default || '';
    },
    [config.successMessage]
  );

  /** Call when the user submits a CORRECT answer. */
  const handleCorrect = useCallback(
    (isLastItem?: boolean) => {
      setIsCorrect(true);
      setMessage(buildSuccessMessage(isLastItem));

      if (config.progressionRules?.resetOnCorrect !== false) {
        setAttempt(0);
      }
    },
    [buildSuccessMessage, config.progressionRules?.resetOnCorrect]
  );

  /** Call when the user submits a WRONG answer. */
  const handleIncorrect = useCallback(
    (hint?: string, correctAnswer?: string) => {
      setIsCorrect(false);
      setMessage(buildIncorrectMessage(hint, correctAnswer));
      setAttempt(a => a + 1);
    },
    [buildIncorrectMessage]
  );

  const reset = useCallback(() => {
    setAttempt(0);
    setIsCorrect(null);
    setMessage('');
  }, []);

  return {
    level,
    attempt,
    isCorrect,
    message,
    handleCorrect,
    handleIncorrect,
    reset,
    buildIncorrectMessage,
    buildSuccessMessage,
  };
}
