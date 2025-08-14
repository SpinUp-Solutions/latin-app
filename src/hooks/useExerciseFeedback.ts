import { useState, useCallback, useMemo } from 'react';
import type { FeedbackConfig, FeedbackLevel } from '@/src/types/exercises/base';
import { normalizeEscalationLevel } from '@/src/utils/feedbackDefaults';

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
  const levels: FeedbackLevel[] = useMemo(
    () => (config.escalationLevels ?? []).map(normalizeEscalationLevel),
    [config.escalationLevels]
  );

  const [attempt, setAttempt] = useState(0);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>('');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0);

  /** Returns the current escalation level. */
  const level: FeedbackLevel | null = useMemo(() => {
    if (levels.length === 0) return null;
    const boundedIndex = Math.min(Math.max(activeLevelIndex, 0), levels.length - 1);
    return levels[boundedIndex] ?? null;
  }, [levels, activeLevelIndex]);

  const buildIncorrectMessage = useCallback(
    (hint?: string, correctAnswer?: string): string => {
      const currentLevel = level;
      if (!currentLevel) return '';

      let builtMessage = currentLevel.message || '';
      if (currentLevel.showAnswer && correctAnswer) {
        builtMessage = `Incorrect. The correct answer is "${correctAnswer}"`;
      }
      return builtMessage;
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
        setActiveLevelIndex(0);
      }
    },
    [buildSuccessMessage, config.progressionRules?.resetOnCorrect]
  );

  /** Call when the user submits a WRONG answer. */
  const handleIncorrect = useCallback(
    (hint?: string, correctAnswer?: string) => {
      setIsCorrect(false);
      setAttempt(previousAttempt => {
        const indexForThisAttempt = Math.min(previousAttempt, Math.max(levels.length - 1, 0));
        const currentLevel = levels[indexForThisAttempt] ?? null;

        if (currentLevel) {
          let builtMessage = currentLevel.message || '';
          if (currentLevel.showAnswer && correctAnswer) {
            builtMessage = `Incorrect. The correct answer is "${correctAnswer}"`;
          }
          setMessage(builtMessage);
        } else {
          setMessage('');
        }

        setActiveLevelIndex(indexForThisAttempt);
        return previousAttempt + 1;
      });
    },
    [levels]
  );

  const reset = useCallback(() => {
    setAttempt(0);
    setIsCorrect(null);
    setMessage('');
    setActiveLevelIndex(0);
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
