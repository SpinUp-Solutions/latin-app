import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProgressionRules } from '@/src/types/exercises/base';
import { DEFAULT_ITEM_PROGRESSION_DELAY } from '@/src/utils/feedbackDefaults';

interface ExerciseProgressionOptions {
  totalItems: number;
  initialIndex?: number;
  itemProgressionDelay?: number;
  progressionRules?: ProgressionRules;
}

export function useExerciseProgression({
  totalItems,
  initialIndex = 0,
  itemProgressionDelay,
  progressionRules,
}: ExerciseProgressionOptions) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    totalItems <= 0 ? 0 : Math.max(0, Math.min(initialIndex, totalItems - 1))
  );
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previousTotalRef = useRef(totalItems);
  const remainingDelayRef = useRef(0);
  const timerDeadlineRef = useRef(0);
  const pendingTimerCallbackRef = useRef<(() => void) | null>(null);

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    pendingTimerCallbackRef.current = null;
  }, []);

  const cancelPendingAdvance = useCallback(() => {
    pendingAdvanceRef.current = null;
    setIsAwaitingConfirmation(false);
    clearAutoAdvanceTimer();
  }, [clearAutoAdvanceTimer]);

  useEffect(() => {
    if (previousTotalRef.current === totalItems) return;
    previousTotalRef.current = totalItems;
    cancelPendingAdvance();
    setCurrentIndex(prev => {
      if (totalItems === 0) return 0;
      return prev >= totalItems ? totalItems - 1 : prev;
    });
  }, [totalItems, cancelPendingAdvance]);

  // Activity suspends effects on page leave. Pause timed question advancement and
  // retain manual Continue callbacks so a returning student can resume either flow.
  useEffect(() => {
    if (pendingTimerCallbackRef.current) {
      timerDeadlineRef.current = Date.now() + remainingDelayRef.current;
      autoAdvanceTimerRef.current = setTimeout(() => {
        const callback = pendingTimerCallbackRef.current;
        autoAdvanceTimerRef.current = null;
        pendingTimerCallbackRef.current = null;
        callback?.();
      }, remainingDelayRef.current);
    }
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        remainingDelayRef.current = Math.max(0, timerDeadlineRef.current - Date.now());
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, []);

  const isLastItem = totalItems > 0 && currentIndex >= totalItems - 1;
  const isFirstItem = currentIndex === 0;

  const nextItem = useCallback(() => {
    cancelPendingAdvance();
    setCurrentIndex(prev => (prev < totalItems - 1 ? prev + 1 : prev));
  }, [totalItems, cancelPendingAdvance]);

  const previousItem = useCallback(() => {
    cancelPendingAdvance();
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : prev));
  }, [cancelPendingAdvance]);

  const resetIndex = useCallback(() => {
    cancelPendingAdvance();
    setCurrentIndex(0);
  }, [cancelPendingAdvance]);

  const goToItem = useCallback(
    (index: number) => {
      cancelPendingAdvance();
      setCurrentIndex(totalItems <= 0 ? 0 : Math.max(0, Math.min(index, totalItems - 1)));
    },
    [cancelPendingAdvance, totalItems]
  );

  const autoAdvanceIfEnabled = useCallback(
    (afterAdvance: () => void, hasVisibleExplanation: boolean) => {
      clearAutoAdvanceTimer();

      const autoAdvance = progressionRules?.autoAdvanceOnCorrect ?? false;
      const pauseForExplanation = progressionRules?.pauseForExplanation ?? true;

      const shouldShowContinue = !autoAdvance || (pauseForExplanation && hasVisibleExplanation);
      const advance = () => {
        nextItem();
        afterAdvance();
      };

      if (shouldShowContinue) {
        pendingAdvanceRef.current = advance;
        setIsAwaitingConfirmation(true);
      } else {
        const delay = itemProgressionDelay ?? DEFAULT_ITEM_PROGRESSION_DELAY;
        pendingTimerCallbackRef.current = advance;
        remainingDelayRef.current = delay;
        timerDeadlineRef.current = Date.now() + delay;
        autoAdvanceTimerRef.current = setTimeout(() => {
          autoAdvanceTimerRef.current = null;
          pendingTimerCallbackRef.current = null;
          advance();
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
    goToItem,
    cancelPendingAdvance,
  };
}
