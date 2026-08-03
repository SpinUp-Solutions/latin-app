'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { useSaveTestAttemptAnswersMutation } from '@/src/store/api/testApi';
import type { ExerciseAnswer, ExerciseAnswerEvent } from '@/src/types/runtime-mode';

const ANSWER_SAVE_DEBOUNCE_MS = 800;

export type AnswerSaveStatus = 'recorded' | 'saving' | 'saved' | 'error';

interface ActiveAttempt {
  attemptId: string;
  scope: string;
  uid: string;
}

interface PendingAnswers {
  answers: Record<string, ExerciseAnswer | null>;
  scope: string;
}

export function useBufferedAttemptAnswers() {
  const [saveAnswers] = useSaveTestAttemptAnswersMutation();
  const [answers, setAnswers] = useState<Record<string, ExerciseAnswer>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AnswerSaveStatus>('saved');
  const activeAttemptRef = useRef<ActiveAttempt | null>(null);
  const pendingAnswersRef = useRef<PendingAnswers | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveInFlightRef = useRef<string | null>(null);

  const clearSaveTimer = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearSaveTimer();
    activeAttemptRef.current = null;
    pendingAnswersRef.current = null;
    flushChainRef.current = Promise.resolve();
    saveInFlightRef.current = null;
    setAnswers({});
    setSaveError(null);
    setSaveStatus('saved');
  }, [clearSaveTimer]);

  const activateAttempt = useCallback(
    ({
      answers: initialAnswers,
      attemptId,
      originKey,
      uid,
    }: {
      answers: Record<string, ExerciseAnswer>;
      attemptId: string;
      originKey: string;
      uid: string;
    }) => {
      clearSaveTimer();
      const scope = `${originKey}:${attemptId}`;
      activeAttemptRef.current = { attemptId, scope, uid };
      pendingAnswersRef.current = null;
      setAnswers(initialAnswers);
      setSaveError(null);
      setSaveStatus('saved');
    },
    [clearSaveTimer]
  );

  const hasUnsavedAnswers = useCallback(() => Boolean(saveInFlightRef.current || pendingAnswersRef.current), []);

  const flushPendingAnswers = useCallback(async () => {
    clearSaveTimer();
    const activeAttempt = activeAttemptRef.current;
    if (!activeAttempt) return;

    const { attemptId, scope, uid } = activeAttempt;
    const operation = flushChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (pendingAnswersRef.current?.scope !== scope) return;
        saveInFlightRef.current = scope;
        if (activeAttemptRef.current?.scope === scope) setSaveStatus('saving');
        try {
          while (pendingAnswersRef.current?.scope === scope) {
            const batch = pendingAnswersRef.current.answers;
            pendingAnswersRef.current = null;
            try {
              await saveAnswers({ uid, attemptId, answers: batch }).unwrap();
              if (activeAttemptRef.current?.scope === scope) {
                setSaveError(null);
                setSaveStatus('saved');
              }
            } catch (error) {
              // A newer attempt can use the same origin. Do not let the old
              // request requeue data or paint an error into the new attempt.
              if (activeAttemptRef.current?.scope !== scope) return;
              const queued = pendingAnswersRef.current as PendingAnswers | null;
              pendingAnswersRef.current =
                queued?.scope === scope
                  ? { scope, answers: { ...batch, ...queued.answers } }
                  : { scope, answers: batch };
              setSaveError(getApiErrorMessage(error, 'Your answers could not be saved'));
              setSaveStatus('error');
              throw error;
            }
          }
        } finally {
          if (saveInFlightRef.current === scope) saveInFlightRef.current = null;
        }
      });

    flushChainRef.current = operation;
    await operation;
  }, [clearSaveTimer, saveAnswers]);

  const recordAnswer = useCallback(
    (event: ExerciseAnswerEvent) => {
      const activeAttempt = activeAttemptRef.current;
      if (!activeAttempt) return;

      setAnswers(current => ({ ...current, [event.exerciseId]: event.answer }));
      const queued = pendingAnswersRef.current;
      pendingAnswersRef.current =
        queued?.scope === activeAttempt.scope
          ? {
              scope: activeAttempt.scope,
              answers: { ...queued.answers, [event.exerciseId]: event.answer },
            }
          : {
              scope: activeAttempt.scope,
              answers: { [event.exerciseId]: event.answer },
            };
      setSaveError(null);
      setSaveStatus('recorded');

      clearSaveTimer();
      saveTimerRef.current = setTimeout(() => {
        void flushPendingAnswers().catch(() => {
          toast.error('An answer is still waiting to be saved. Try again before leaving.');
        });
      }, ANSWER_SAVE_DEBOUNCE_MS);
    },
    [clearSaveTimer, flushPendingAnswers]
  );

  const adoptPersistedAnswer = useCallback((event: ExerciseAnswerEvent) => {
    const activeAttempt = activeAttemptRef.current;
    if (!activeAttempt) return;

    setAnswers(current => ({ ...current, [event.exerciseId]: event.answer }));
    const queued = pendingAnswersRef.current;
    if (queued?.scope === activeAttempt.scope && event.exerciseId in queued.answers) {
      const remaining = { ...queued.answers };
      delete remaining[event.exerciseId];
      pendingAnswersRef.current =
        Object.keys(remaining).length > 0 ? { scope: activeAttempt.scope, answers: remaining } : null;
    }
    if (!pendingAnswersRef.current && !saveInFlightRef.current) {
      setSaveError(null);
      setSaveStatus('saved');
    }
  }, []);

  useEffect(() => {
    const protectUnsavedAnswers = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedAnswers()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnsavedAnswers);
    return () => window.removeEventListener('beforeunload', protectUnsavedAnswers);
  }, [hasUnsavedAnswers]);

  useEffect(
    () => () => {
      clearSaveTimer();
      activeAttemptRef.current = null;
      pendingAnswersRef.current = null;
    },
    [clearSaveTimer]
  );

  return {
    activateAttempt,
    adoptPersistedAnswer,
    answers,
    flushPendingAnswers,
    hasUnsavedAnswers,
    recordAnswer,
    reset,
    saveError,
    saveStatus,
  };
}
