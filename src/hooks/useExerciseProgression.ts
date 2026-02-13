import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProgressionRules } from '@/src/types/exercises/base';
import { DEFAULT_ITEM_PROGRESSION_DELAY } from '@/src/utils/feedbackDefaults';

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
  autoAdvanceIfEnabled: (afterAdvance: () => void, hasVisibleExplanation: boolean) => void;
  confirmAdvance: () => void;
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
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    setCurrentIndex(0);
    clearAutoAdvanceTimer();
  }, [totalItems, clearAutoAdvanceTimer]);

  useEffect(() => {
    return () => clearAutoAdvanceTimer();
  }, [clearAutoAdvanceTimer]);

  const isLastItem = currentIndex >= totalItems - 1;
  const isFirstItem = currentIndex === 0;

  const nextItem = useCallback(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    clearAutoAdvanceTimer();
    setCurrentIndex(prev => {
      if (prev < totalItems - 1) {
        return prev + 1;
      }
      return prev;
    });
  }, [totalItems, clearAutoAdvanceTimer]);

  const previousItem = useCallback(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    clearAutoAdvanceTimer();
    setCurrentIndex(prev => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev;
    });
  }, [clearAutoAdvanceTimer]);

  const resetIndex = useCallback(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    clearAutoAdvanceTimer();
    setCurrentIndex(0);
  }, [clearAutoAdvanceTimer]);

  const autoAdvanceIfEnabled = useCallback(
    (afterAdvance: () => void, hasVisibleExplanation: boolean) => {
      clearAutoAdvanceTimer();

      const autoAdvance = progressionRules?.autoAdvanceOnCorrect ?? false;
      const pauseForExplanation = progressionRules?.pauseForExplanation ?? true;

      const shouldShowContinue = !autoAdvance || (pauseForExplanation && hasVisibleExplanation);

      if (shouldShowContinue) {
        pendingAdvanceRef.current = () => {
          nextItem();
          afterAdvance();
        };
        setIsAwaitingConfirmation(true);
      } else {
        const delay = itemProgressionDelay ?? DEFAULT_ITEM_PROGRESSION_DELAY;
        autoAdvanceTimerRef.current = setTimeout(() => {
          autoAdvanceTimerRef.current = null;
          nextItem();
          afterAdvance();
        }, delay);
      }
    },
    [
      progressionRules?.autoAdvanceOnCorrect,
      progressionRules?.pauseForExplanation,
      itemProgressionDelay,
      nextItem,
      clearAutoAdvanceTimer,
    ]
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
