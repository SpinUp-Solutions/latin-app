import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProgressionRules } from '@/src/types/exercises/base';
import { DEFAULT_ITEM_PROGRESSION_DELAY } from '@/src/utils/feedbackDefaults';

interface ExerciseProgressionOptions {
  totalItems: number;
  initialIndex?: number;
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
  cancelPendingAdvance: () => void;
}

export function useExerciseProgression({
  totalItems,
  initialIndex = 0,
  itemProgressionDelay,
  progressionRules,
}: ExerciseProgressionOptions): ExerciseProgressionState & ExerciseProgressionActions {
  const [currentIndex, setCurrentIndex] = useState(() =>
    totalItems <= 0 ? 0 : Math.max(0, Math.min(initialIndex, totalItems - 1))
  );
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingTimerCallbackRef = useRef<(() => void) | null>(null);

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    pendingTimerCallbackRef.current = null;
  }, []);

  useEffect(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    clearAutoAdvanceTimer();
    setCurrentIndex(prev => {
      if (totalItems === 0) return 0;
      return prev >= totalItems ? totalItems - 1 : prev;
    });
  }, [totalItems, clearAutoAdvanceTimer]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
      pendingTimerCallbackRef.current = null;
      pendingAdvanceRef.current = null;
    };
  }, []);

  const isLastItem = totalItems > 0 && currentIndex >= totalItems - 1;
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

  const cancelPendingAdvance = useCallback(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    clearAutoAdvanceTimer();
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
        const callback = () => {
          nextItem();
          afterAdvance();
        };
        pendingTimerCallbackRef.current = callback;
        autoAdvanceTimerRef.current = setTimeout(() => {
          autoAdvanceTimerRef.current = null;
          pendingTimerCallbackRef.current = null;
          callback();
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
    cancelPendingAdvance,
  };
}
