import { useState, useCallback } from 'react';
import type { FeedbackConfig } from '@/src/types/exercises/base';

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
}

export function useExerciseProgression({
  totalItems,
  feedbackConfig,
  onComplete,
}: ExerciseProgressionOptions): ExerciseProgressionState & ExerciseProgressionActions {
  const [currentIndex, setCurrentIndex] = useState(0);

  const isLastItem = currentIndex >= totalItems - 1;

  const nextItem = useCallback(() => {
    if (currentIndex < totalItems - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (onComplete) {
      // Auto-advance logic based on configuration
      if (feedbackConfig.progressionRules?.autoAdvance !== false) {
        const delay = feedbackConfig.timingConfig?.nextExerciseDelay || 2500;
        setTimeout(onComplete, delay);
      }
    }
  }, [
    currentIndex,
    totalItems,
    onComplete,
    feedbackConfig.progressionRules?.autoAdvance,
    feedbackConfig.timingConfig?.nextExerciseDelay,
  ]);

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
  };
}
