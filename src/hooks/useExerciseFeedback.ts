import { useState, useCallback, useMemo } from 'react';
import type { FeedbackConfig, FeedbackLevel } from '@/src/types/exercises/base';
import { getEffectiveFeedbackConfig } from '@/src/utils/feedbackDefaults';

interface FeedbackState {
  isCorrect: boolean | null;
  message: string;
  level: FeedbackLevel | null;
  showExplanation: boolean;
  hint?: string;
  correctAnswer?: string;
}

interface FeedbackActions {
  handleCorrect: (isLastItem?: boolean) => void;
  handleIncorrect: (hint?: string, correctAnswer?: string) => void;
  reset: () => void;
}

export function useExerciseFeedback(config: FeedbackConfig): FeedbackState & FeedbackActions {
  const {
    escalationLevels: levels,
    successMessage,
    progressionRules,
  } = useMemo(() => getEffectiveFeedbackConfig(config), [config]);

  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>('');
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0);
  const [activeHint, setActiveHint] = useState<string | undefined>(undefined);
  const [activeCorrectAnswer, setActiveCorrectAnswer] = useState<string | undefined>(undefined);

  /** Returns the current escalation level. */
  const level: FeedbackLevel | null = useMemo(() => {
    if (levels.length === 0) return null;
    const boundedIndex = Math.min(Math.max(activeLevelIndex, 0), levels.length - 1);
    return levels[boundedIndex] ?? null;
  }, [levels, activeLevelIndex]);

  // Derived flag to control explanation rendering for correct answers
  const showExplanation = isCorrect === true && Boolean(successMessage?.showExplanation);

  const buildSuccessMessage = useCallback(
    (isLastItem?: boolean): string => {
      if (isLastItem && successMessage?.completion) {
        return successMessage.completion;
      }

      return successMessage?.advance || successMessage?.default || '';
    },
    [successMessage]
  );

  /** Call when the user submits a CORRECT answer. */
  const handleCorrect = useCallback(
    (isLastItem?: boolean) => {
      setIsCorrect(true);
      setMessage(buildSuccessMessage(isLastItem));

      if (progressionRules?.resetOnCorrect !== false) {
        setActiveLevelIndex(0);
      }
    },
    [buildSuccessMessage, progressionRules?.resetOnCorrect]
  );

  /** Call when the user submits a WRONG answer. */
  const handleIncorrect = useCallback(
    (hint?: string, correctAnswer?: string) => {
      setIsCorrect(false);
      setActiveLevelIndex(previousIndex => {
        const nextIndex = Math.min(previousIndex + 1, Math.max(levels.length - 1, 0));
        const currentLevel = levels[nextIndex] ?? null;

        if (currentLevel) {
          const builtMessage = currentLevel.message || 'Incorrect.';
          setMessage(builtMessage);
        } else {
          setMessage('');
        }

        return nextIndex;
      });
      setActiveHint(hint);
      setActiveCorrectAnswer(correctAnswer);
    },
    [levels]
  );

  const reset = useCallback(() => {
    setIsCorrect(null);
    setMessage('');
    setActiveLevelIndex(0);
    setActiveHint(undefined);
    setActiveCorrectAnswer(undefined);
  }, []);

  return {
    level,
    isCorrect,
    message,
    showExplanation,
    hint: activeHint,
    correctAnswer: activeCorrectAnswer,
    handleCorrect,
    handleIncorrect,
    reset,
  };
}
