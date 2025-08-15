import { useState, useCallback, useMemo } from 'react';
import type { FeedbackConfig, FeedbackLevel } from '@/src/types/exercises/base';
import { getEffectiveFeedbackConfig } from '@/src/utils/feedbackDefaults';

export function useExerciseFeedback(config: FeedbackConfig) {
  const { escalationLevels, successMessage, progressionRules } = useMemo(
    () => getEffectiveFeedbackConfig(config),
    [config]
  );

  const [attempt, setAttempt] = useState(0);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>('');

  // Current level is simply the attempt clamped to available levels
  const level = useMemo(() => {
    if (escalationLevels.length === 0) return null;
    const levelIndex = Math.min(attempt, escalationLevels.length - 1);
    return escalationLevels[levelIndex] ?? null;
  }, [escalationLevels, attempt]);

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

  const handleCorrect = useCallback(
    (isLastItem?: boolean) => {
      setIsCorrect(true);
      setMessage(buildSuccessMessage(isLastItem));
      if (progressionRules?.resetOnCorrect !== false) {
        setAttempt(0);
      }
    },
    [buildSuccessMessage, progressionRules?.resetOnCorrect]
  );

  const handleIncorrect = useCallback(() => {
    setIsCorrect(false);
    const currentLevel = escalationLevels[attempt] ?? escalationLevels[escalationLevels.length - 1] ?? null;
    setMessage(currentLevel?.message || 'Incorrect.');
    setAttempt(prev => Math.min(prev + 1, escalationLevels.length - 1));
  }, [escalationLevels, attempt]);

  const reset = useCallback(() => {
    setAttempt(0);
    setIsCorrect(null);
    setMessage('');
  }, []);

  return {
    level,
    isCorrect,
    message,
    showExplanation,
    handleCorrect,
    handleIncorrect,
    reset,
  };
}
