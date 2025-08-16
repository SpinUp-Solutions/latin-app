import { useState, useCallback, useMemo } from 'react';
import type { FeedbackConfig } from '@/src/types/exercises/base';
import { getEffectiveFeedbackConfig } from '@/src/utils/feedbackDefaults';

interface ExerciseProgressionOptions {
  totalItems: number;
  feedbackConfig: FeedbackConfig;
  onComplete?: () => void;
}

interface ExerciseProgressionState {
  currentIndex: number;
  isLastItem: boolean;
}

interface ExerciseProgressionActions {
  nextItem: () => void;
  reset: () => void;
  goToItem: (index: number) => void;
  autoAdvanceIfEnabled: (afterAdvance: () => void) => void;
}

export function useExerciseProgression({
  totalItems,
  feedbackConfig,
  onComplete,
}: ExerciseProgressionOptions): ExerciseProgressionState & ExerciseProgressionActions {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { progressionRules, timingConfig } = useMemo(
    () => getEffectiveFeedbackConfig(feedbackConfig),
    [feedbackConfig]
  );

  const isLastItem = currentIndex >= totalItems - 1;

  const nextItem = useCallback(() => {
    if (currentIndex < totalItems - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (onComplete) {
      // Auto-advance logic based on configuration
      if (progressionRules?.autoAdvance !== false) {
        const delay = timingConfig?.nextExerciseDelay || 2500;
        setTimeout(onComplete, delay);
      }
    }
  }, [currentIndex, totalItems, onComplete, progressionRules?.autoAdvance, timingConfig?.nextExerciseDelay]);

  const reset = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  const goToItem = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalItems) {
        setCurrentIndex(index);
      }
    },
    [totalItems]
  );

  return {
    currentIndex,
    isLastItem,
    nextItem,
    reset,
    goToItem,
    autoAdvanceIfEnabled: (afterAdvance: () => void) => {
      if (progressionRules?.autoAdvance !== false) {
        const delay = timingConfig?.progressionDelay || 1500;
        setTimeout(() => {
          nextItem();
          afterAdvance();
        }, delay);
      }
    },
  };
}
