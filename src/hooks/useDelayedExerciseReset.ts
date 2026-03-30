import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { DEFAULT_ITEM_PROGRESSION_DELAY } from '@/src/utils/feedbackDefaults';

interface UseDelayedExerciseResetOptions {
  shouldReset: boolean;
  onReset: () => void;
  delayMs?: number;
  toastMessage?: string;
}

export function useDelayedExerciseReset({
  shouldReset,
  onReset,
  delayMs = DEFAULT_ITEM_PROGRESSION_DELAY,
  toastMessage = 'Too many mistakes. Starting over...',
}: UseDelayedExerciseResetOptions) {
  const onResetRef = useRef(onReset);

  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  useEffect(() => {
    if (!shouldReset) {
      return;
    }

    const normalizedDelayMs = delayMs > 0 ? delayMs : DEFAULT_ITEM_PROGRESSION_DELAY;

    toast.info(toastMessage);

    const timeoutId = window.setTimeout(() => {
      onResetRef.current();
    }, normalizedDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, shouldReset, toastMessage]);
}
