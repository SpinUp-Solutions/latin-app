import { useState, useCallback, useMemo } from 'react';
import type { FeedbackConfig } from '@/src/types/exercises/base';
import { getEffectiveFeedbackConfig } from '@/src/utils/feedbackDefaults';

interface ExerciseProgressionOptions {
  totalItems: number;
  feedbackConfig: FeedbackConfig;
}

interface ExerciseProgressionState {
  currentIndex: number;
  isLastItem: boolean;
}

interface ExerciseProgressionActions {
  autoAdvanceIfEnabled: (afterAdvance: () => void) => void;
}

export function useExerciseProgression({
  totalItems,
  feedbackConfig,
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
    }
  }, [currentIndex, totalItems]);

  return {
    currentIndex,
    isLastItem,
    autoAdvanceIfEnabled: (afterAdvance: () => void) => {
      if (progressionRules?.autoAdvance !== false) {
        const delay = timingConfig?.progressionDelay || 1500;
        setTimeout(() => {
          nextItem();
          afterAdvance();
        }, delay);
      } else {
        nextItem();
        afterAdvance();
      }
    },
  };
}
