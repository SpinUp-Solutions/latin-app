'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getApiErrorCode, getApiErrorMessage } from '@/src/store/api/baseQuery';
import { useSaveTestAttemptAnswersMutation } from '@/src/store/api/testApi';
import type { ExerciseAnswer, ExerciseAnswerEvent } from '@/src/types/runtime-mode';

const ANSWER_SAVE_DEBOUNCE_MS = 800;

export type AnswerSaveStatus = 'recorded' | 'saving' | 'saved' | 'error';

interface ActiveAttempt {
  attemptId: string;
  scope: string;
  uid: string;
  section?: { pageId: string; revision: number };
}

interface PendingAnswers {
  answers: Record<string, ExerciseAnswer | null>;
  scope: string;
}

export function useBufferedAttemptAnswers() {
  const [saveAnswers] = useSaveTestAttemptAnswersMutation();
  const [answers, setAnswers] = useState<Record<string, ExerciseAnswer>>({});
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef<unknown>(null);
  const generationRef = useRef(0);
  const retryRef = useRef<{
    scope: string;
    answers: Record<string, ExerciseAnswer | null>;
    section: { pageId: string; expectedRevision: number; mutationId: string };
  } | null>(null);
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
    retryRef.current = null;
    conflictRef.current = null;
    setConflict(false);
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
      section,
    }: {
      answers: Record<string, ExerciseAnswer>;
      attemptId: string;
      originKey: string;
      uid: string;
      section?: { pageId: string; revision: number };
    }) => {
      clearSaveTimer();
      const scope = `${originKey}:${attemptId}:${section?.pageId ?? 'legacy'}:${++generationRef.current}`;
      activeAttemptRef.current = { attemptId, scope, uid, section: section ? { ...section } : undefined };
      retryRef.current = null;
      conflictRef.current = null;
      setConflict(false);
      pendingAnswersRef.current = null;
      setAnswers(initialAnswers);
      setSaveError(null);
      setSaveStatus('saved');
    },
    [clearSaveTimer]
  );

  const hasUnsavedAnswers = useCallback(
    () => Boolean(saveInFlightRef.current || pendingAnswersRef.current || retryRef.current),
    []
  );

  const flushPendingAnswers = useCallback(async () => {
    clearSaveTimer();
    if (conflictRef.current) throw conflictRef.current;
    const activeAttempt = activeAttemptRef.current;
    if (!activeAttempt) return;

    const { attemptId, scope, uid } = activeAttempt;
    const operation = flushChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (
          activeAttemptRef.current?.scope !== scope ||
          (pendingAnswersRef.current?.scope !== scope && retryRef.current?.scope !== scope)
        )
          return;
        saveInFlightRef.current = scope;
        if (activeAttemptRef.current?.scope === scope) setSaveStatus('saving');
        try {
          while (
            activeAttemptRef.current?.scope === scope &&
            (pendingAnswersRef.current?.scope === scope || retryRef.current?.scope === scope)
          ) {
            const retry = retryRef.current?.scope === scope ? retryRef.current : null;
            const batch = retry?.answers ?? pendingAnswersRef.current!.answers;
            if (!retry) pendingAnswersRef.current = null;
            const section =
              retry?.section ??
              (activeAttempt.section
                ? {
                    pageId: activeAttempt.section.pageId,
                    expectedRevision: activeAttempt.section.revision,
                    mutationId: crypto.randomUUID(),
                  }
                : undefined);
            if (section) retryRef.current = { scope, answers: batch, section };
            try {
              const saved = await saveAnswers({
                uid,
                attemptId,
                answers: batch,
                ...(section ? { section } : {}),
              }).unwrap();
              if (activeAttemptRef.current?.scope !== scope) return;
              // A retry can succeed after another tab has saved a later
              // revision. Do not silently confirm those unseen answers.
              if (section && saved?.flowVersion === 1 && saved.section.revision !== section.expectedRevision + 1) {
                throw {
                  status: 409,
                  data: {
                    code: 'ATTEMPT_REVISION_CONFLICT',
                    error: 'This section changed in another tab. Reload the saved answers before continuing.',
                  },
                };
              }
              retryRef.current = null;
              if (saved?.flowVersion === 1 && activeAttempt.section)
                activeAttempt.section.revision = saved.section.revision;
              if (activeAttemptRef.current?.scope === scope) {
                setSaveError(null);
                setSaveStatus('saved');
              }
            } catch (error) {
              // A newer attempt can use the same origin. Do not let the old
              // request requeue data or paint an error into the new attempt.
              if (activeAttemptRef.current?.scope !== scope) return;
              const code = getApiErrorCode(error);
              if (
                code === 'ATTEMPT_REVISION_CONFLICT' ||
                code === 'ATTEMPT_SECTION_LOCKED' ||
                code === 'ATTEMPT_NOT_IN_PROGRESS'
              ) {
                conflictRef.current = error;
                setConflict(true);
                clearSaveTimer();
              }
              const queued = pendingAnswersRef.current as PendingAnswers | null;
              if (!section)
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
      if (conflictRef.current) return;
      saveTimerRef.current = setTimeout(() => {
        void flushPendingAnswers().catch(() => {
          toast.error('An answer is still waiting to be saved. Try again before leaving.');
        });
      }, ANSWER_SAVE_DEBOUNCE_MS);
    },
    [clearSaveTimer, flushPendingAnswers]
  );

  const clearAnswer = useCallback(
    (exerciseId: string) => {
      const activeAttempt = activeAttemptRef.current;
      if (!activeAttempt) return;

      setAnswers(current => {
        const next = { ...current };
        delete next[exerciseId];
        return next;
      });
      const queued = pendingAnswersRef.current;
      pendingAnswersRef.current =
        queued?.scope === activeAttempt.scope
          ? {
              scope: activeAttempt.scope,
              answers: { ...queued.answers, [exerciseId]: null },
            }
          : {
              scope: activeAttempt.scope,
              answers: { [exerciseId]: null },
            };
      setSaveError(null);
      setSaveStatus('recorded');

      clearSaveTimer();
      if (conflictRef.current) return;
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
    conflict,
    getSectionRevision: () => activeAttemptRef.current?.section?.revision,
    adoptPersistedAnswer,
    answers,
    clearAnswer,
    flushPendingAnswers,
    hasUnsavedAnswers,
    recordAnswer,
    reset,
    saveError,
    saveStatus,
  };
}
