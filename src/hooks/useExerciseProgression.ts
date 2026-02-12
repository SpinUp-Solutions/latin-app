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
  isAwaitingConfirmation: boolean;
}

interface ExerciseProgressionActions {
  autoAdvanceIfEnabled: (afterAdvance: () => void) => void;
  confirmAdvance: () => void;
  resetIndex: () => void;
  nextItem: () => void;
  previousItem: () => void;
}

export function useExerciseProgression({
  totalItems,
  progressionRules,
}: ExerciseProgressionOptions): ExerciseProgressionState & ExerciseProgressionActions {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    setCurrentIndex(0);
  }, [totalItems]);

  const isLastItem = currentIndex >= totalItems - 1;
  const isFirstItem = currentIndex === 0;

  const nextItem = useCallback(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    setCurrentIndex(prev => {
      if (prev < totalItems - 1) {
        return prev + 1;
      }
      return prev;
    });
  }, [totalItems]);

  const previousItem = useCallback(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    setCurrentIndex(prev => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev;
    });
  }, []);

  const resetIndex = useCallback(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    setCurrentIndex(0);
  }, []);

  const autoAdvanceIfEnabled = useCallback(
    (afterAdvance: () => void) => {
      if (progressionRules?.autoAdvance !== false) {
        pendingAdvanceRef.current = () => {
          nextItem();
          afterAdvance();
        };
        setIsAwaitingConfirmation(true);
      } else {
        nextItem();
        afterAdvance();
      }
    },
    [progressionRules?.autoAdvance, nextItem]
  );

  const confirmAdvance = useCallback(() => {
    const pending = pendingAdvanceRef.current;
    if (pending) {
      pendingAdvanceRef.current = null;
      setIsAwaitingConfirmation(false);
      pending();
    }
  }, []);

  return {
    currentIndex,
    isLastItem,
    isFirstItem,
    isAwaitingConfirmation,
    autoAdvanceIfEnabled,
    confirmAdvance,
    resetIndex,
    nextItem,
    previousItem,
  };
}
