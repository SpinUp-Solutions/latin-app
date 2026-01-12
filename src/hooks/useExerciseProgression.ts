import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProgressionRules } from '@/src/types/exercises/base';

interface ExerciseProgressionOptions {
  totalItems: number;
  itemProgressionDelay?: number;
  progressionRules?: ProgressionRules;
}

interface ExerciseProgressionState {
  currentIndex: number;
  isLastItem: boolean;
  isFirstItem: boolean;
}

interface ExerciseProgressionActions {
  autoAdvanceIfEnabled: (afterAdvance: () => void) => void;
  resetIndex: () => void;
  nextItem: () => void;
  previousItem: () => void;
}

export function useExerciseProgression({
  totalItems,
  itemProgressionDelay,
  progressionRules,
}: ExerciseProgressionOptions): ExerciseProgressionState & ExerciseProgressionActions {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearPendingTimer();
    setCurrentIndex(0);
  }, [totalItems, clearPendingTimer]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer]);

  const isLastItem = currentIndex >= totalItems - 1;
  const isFirstItem = currentIndex === 0;

  const nextItem = useCallback(() => {
    clearPendingTimer();
    setCurrentIndex(prev => {
      if (prev < totalItems - 1) {
        return prev + 1;
      }
      return prev;
    });
  }, [totalItems, clearPendingTimer]);

  const previousItem = useCallback(() => {
    clearPendingTimer();
    setCurrentIndex(prev => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev;
    });
  }, [clearPendingTimer]);

  const resetIndex = useCallback(() => {
    clearPendingTimer();
    setCurrentIndex(0);
  }, [clearPendingTimer]);

  const autoAdvanceIfEnabled = useCallback(
    (afterAdvance: () => void) => {
      if (progressionRules?.autoAdvance !== false) {
        const delay = itemProgressionDelay || 2000;
        clearPendingTimer();
        timerRef.current = setTimeout(() => {
          nextItem();
          afterAdvance();
        }, delay);
      } else {
        nextItem();
        afterAdvance();
      }
    },
    [progressionRules?.autoAdvance, itemProgressionDelay, nextItem, clearPendingTimer]
  );

  return {
    currentIndex,
    isLastItem,
    isFirstItem,
    autoAdvanceIfEnabled,
    resetIndex,
    nextItem,
    previousItem,
  };
}
