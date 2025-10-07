import { useState, useCallback } from 'react';
import type { ProgressionRules } from '@/src/types/exercises/base';

interface ExerciseProgressionOptions {
  totalItems: number;
  itemProgressionDelay?: number;
  progressionRules?: ProgressionRules;
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
  itemProgressionDelay,
  progressionRules,
}: ExerciseProgressionOptions): ExerciseProgressionState & ExerciseProgressionActions {
  const [currentIndex, setCurrentIndex] = useState(0);

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
        const delay = itemProgressionDelay || 2000;
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
