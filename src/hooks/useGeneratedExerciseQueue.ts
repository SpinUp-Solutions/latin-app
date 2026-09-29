import { useState } from 'react';

/** Each group contains the original item indices for one word occurrence. */
export function useGeneratedExerciseQueue(groups: number[][]) {
  const [remaining, setRemaining] = useState(groups);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const [failures, setFailures] = useState<Record<number, number>>({});
  const group = remaining[0] ?? [];
  const currentIndex = group[step] ?? 0;
  const isLastStep = step === group.length - 1;
  const isLastItem = remaining.length === 1 && isLastStep;

  function recordResult(correct: boolean) {
    setResult(correct);
    if (!correct) setFailures(previous => ({ ...previous, [currentIndex]: (previous[currentIndex] ?? 0) + 1 }));
  }

  function advance(correct: boolean) {
    setResult(null);
    if (correct && !isLastStep) {
      setStep(previous => previous + 1);
      return;
    }
    setStep(0);
    setRemaining(previous => (correct ? previous.slice(1) : [...previous.slice(1), previous[0]]));
  }

  return {
    currentIndex,
    isLastItem,
    total: groups.length,
    completed: groups.length - remaining.length + (result === true && isLastStep ? 1 : 0),
    failureCount: failures[currentIndex] ?? 0,
    recordResult,
    advance,
  };
}
