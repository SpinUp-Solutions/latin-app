import { useState, useCallback, useMemo } from 'react';
import type { FeedbackConfig } from '@/src/types/exercises/base';
import { getEffectiveFeedbackConfig } from '@/src/utils/feedbackDefaults';

interface ExerciseProgressionOptions {
  totalItems: number;
  feedbackConfig: FeedbackConfig;
  onComplete?: (score: number) => void;
}

interface ExerciseProgressionState {
  currentIndex: number;
  isLastItem: boolean;
}

interface ExerciseProgressionActions {
  nextItem: (score?: number) => void;
  reset: () => void;
  goToItem: (index: number) => void;
  autoAdvanceIfEnabled: (afterAdvance: () => void, score?: number) => void;
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

  const nextItem = useCallback(
    (score?: number) => {
      if (currentIndex < totalItems - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (onComplete) {
        // Auto-advance logic based on configuration
        if (progressionRules?.autoAdvance !== false) {
          const delay = timingConfig?.nextExerciseDelay || 2500;
          setTimeout(() => onComplete(score || 100), delay);
        } else {
          onComplete(score || 100);
        }
      }
    },
    [currentIndex, totalItems, onComplete, progressionRules?.autoAdvance, timingConfig?.nextExerciseDelay]
  );

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
    autoAdvanceIfEnabled: (afterAdvance: () => void, score?: number) => {
      if (progressionRules?.autoAdvance !== false) {
        const delay = timingConfig?.progressionDelay || 1500;
        setTimeout(() => {
          nextItem(score);
          afterAdvance();
        }, delay);
      }
    },
  };
}
