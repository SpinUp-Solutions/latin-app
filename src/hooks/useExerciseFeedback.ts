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

  const [attempt, setAttempt] = useState(0);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>('');
  const [currentFeedbackLevel, setCurrentFeedbackLevel] = useState<FeedbackLevel | null>(null);
  const [activeHint, setActiveHint] = useState<string | undefined>(undefined);
  const [activeCorrectAnswer, setActiveCorrectAnswer] = useState<string | undefined>(undefined);

  /** Returns the current escalation level for feedback display. */
  const level: FeedbackLevel | null = currentFeedbackLevel;

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
        setAttempt(0);
        setCurrentFeedbackLevel(null);
      }
    },
    [buildSuccessMessage, progressionRules?.resetOnCorrect]
  );

  /** Call when the user submits a WRONG answer. */
  const handleIncorrect = useCallback(
    (hint?: string, correctAnswer?: string) => {
      setIsCorrect(false);
      setAttempt(currentAttempt => {
        const levelIndex = Math.min(currentAttempt, Math.max(levels.length - 1, 0));
        const currentLevel = levels[levelIndex] ?? null;

        // Set the level that corresponds to THIS attempt
        setCurrentFeedbackLevel(currentLevel);

        if (currentLevel) {
          const builtMessage = currentLevel.message || 'Incorrect.';
          setMessage(builtMessage);
        } else {
          setMessage('');
        }

        setActiveHint(hint);
        setActiveCorrectAnswer(correctAnswer);

        // Increment attempt counter for next incorrect attempt
        return currentAttempt + 1;
      });
    },
    [levels]
  );

  const reset = useCallback(() => {
    setAttempt(0);
    setIsCorrect(null);
    setMessage('');
    setCurrentFeedbackLevel(null);
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
