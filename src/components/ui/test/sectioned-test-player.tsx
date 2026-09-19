'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  StudentInProgressTestAttempt,
  StudentSectionedTestAttempt,
  StudentSubmittedTestAttempt,
  StudentTestDelivery,
} from '@/src/types/test';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { Exercise } from '@/src/types/exercises';
import { useBufferedAttemptAnswers } from '@/src/hooks/useBufferedAttemptAnswers';
import {
  useConfirmTestSectionMutation,
  useLazyGetTestAttemptQuery,
  useSetTestSectionPhaseMutation,
} from '@/src/store/api/testApi';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { isExerciseType } from '@/src/lib/content/registry';
import { isExerciseAnswerComplete } from '@/src/lib/tests/answer-completion';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { SectionAnswerReview } from './section-answer-review';
import { SectionedTestProvider } from './sectioned-test-context';
import { TestTakingView } from './test-taking-view';

interface Props {
  attempt: StudentSectionedTestAttempt;
  onAttempt: (attempt: StudentInProgressTestAttempt) => void;
  buffer: ReturnType<typeof useBufferedAttemptAnswers>;
  title: string;
  uid: string;
  originKey: string;
  onSubmitted: (attempt: StudentSubmittedTestAttempt) => void;
  onExit: () => Promise<void>;
}

function draftText(answers: Record<string, ExerciseAnswer>): string {
  return Object.values(answers)
    .flatMap(answer => {
      if ('answers' in answer) return Object.values(answer.answers);
      if (answer.type === 'translation-grading') return answer.translations;
      if (answer.type === 'odd-one-out') return [answer.explanation];
      return [];
    })
    .join('\n\n');
}

export function SectionedTestPlayer({ attempt, onAttempt, buffer, title, uid, originKey, onSubmitted, onExit }: Props) {
  const [setPhase] = useSetTestSectionPhaseMutation();
  const [confirmSection] = useConfirmTestSectionMutation();
  const [getAttempt] = useLazyGetTestAttemptQuery();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [recovery, setRecovery] = useState<{
    delivery: StudentTestDelivery;
    answers: Record<string, ExerciseAnswer>;
  } | null>(null);
  const [recoveredSubmission, setRecoveredSubmission] = useState<StudentSubmittedTestAttempt | null>(null);
  const [autoReview, setAutoReview] = useState(false);
  const suppressAutoReview = useRef(false);
  const completedRef = useRef(new Set<string>());
  const resumedConfirmationRef = useRef<string | null>(null);
  const page = attempt.delivery.pages[0];
  const exercises = page.items.filter(item => isExerciseType(item.type)) as Exercise[];
  const answered = exercises.filter(item =>
    isExerciseAnswerComplete(
      item,
      buffer.answers[item.id],
      attempt.delivery.resolvedExercises[item.id]?.items.length ?? 0
    )
  ).length;
  const incomplete = answered < exercises.length;
  const revision = () => buffer.getSectionRevision() ?? attempt.section.revision;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    completedRef.current = new Set(
      exercises
        .filter(item =>
          isExerciseAnswerComplete(
            item,
            attempt.answers[item.id],
            attempt.delivery.resolvedExercises[item.id]?.items.length ?? 0
          )
        )
        .map(item => item.id)
    );
    suppressAutoReview.current = false;
    setAutoReview(false);
    setAcknowledged(false);
    // The frozen page identity defines a new section, not each autosave response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  const { activateAttempt } = buffer;
  const adopt = useCallback(
    (updated: StudentInProgressTestAttempt) => {
      if (!mountedRef.current) return;
      activateAttempt({
        attemptId: updated.id,
        answers: updated.answers,
        section: updated.section,
        originKey,
        uid,
      });
      onAttempt(updated);
    },
    [activateAttempt, onAttempt, originKey, uid]
  );

  const refresh = async (preserveDraft = false) => {
    if (preserveDraft) setRecovery({ delivery: attempt.delivery, answers: buffer.answers });
    const updated = await getAttempt(attempt.id, false).unwrap();
    if (!mountedRef.current) return;
    if (updated.status === 'submitted') {
      if (preserveDraft) {
        setRecoveredSubmission(updated);
        return;
      }
      buffer.reset();
      onSubmitted(updated);
    } else adopt(updated);
  };

  const changePhase = async (phase: 'answering' | 'review') => {
    if (busyRef.current || buffer.conflict) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await buffer.flushPendingAnswers();
      const updated = await setPhase({
        attemptId: attempt.id,
        pageId: page.id,
        expectedRevision: revision(),
        phase,
      }).unwrap();
      if (!mountedRef.current) return;
      adopt(updated);
      if (phase === 'answering') suppressAutoReview.current = true;
      setAutoReview(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (!mountedRef.current) return;
      setAutoReview(false);
      toast.error(getApiErrorMessage(error, 'Save your answers before continuing.'));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const confirm = async (resuming = false) => {
    if (busyRef.current || buffer.conflict) return;
    busyRef.current = true;
    setBusy(true);
    setAutoReview(false);
    try {
      await buffer.flushPendingAnswers();
      const request = {
        uid,
        attemptId: attempt.id,
        pageId: page.id,
        expectedRevision: revision(),
        requestId: crypto.randomUUID(),
        acknowledgeIncomplete: resuming || acknowledged,
      };
      while (mountedRef.current) {
        const result = await confirmSection(request).unwrap();
        if (!mountedRef.current) return;
        if (result.attempt.status === 'submitted') {
          buffer.reset();
          onSubmitted(result.attempt);
          return;
        }
        adopt(result.attempt);
        if (!result.pending) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        await new Promise(resolve => setTimeout(resolve, result.retryAfterMs ?? 1000));
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(getApiErrorMessage(error, 'Your answers are saved. Please retry section confirmation.'));
        // A lost final response may already have submitted the attempt. A save
        // failure, however, must never replace still-unsaved local answers.
        if (!buffer.hasUnsavedAnswers()) await refresh().catch(() => undefined);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (autoReview && !busy && !buffer.conflict && attempt.section.phase === 'answering') void changePhase('review');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReview, busy, buffer.conflict, attempt.section.phase]);
  useEffect(() => {
    const key = `${attempt.id}:${page.id}`;
    if (attempt.section.phase === 'confirming' && resumedConfirmationRef.current !== key) {
      resumedConfirmationRef.current = key;
      void confirm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.id, page.id]);

  const saveStatus = (
    <span>
      {busy
        ? 'Confirming section…'
        : (buffer.saveError ??
          (buffer.saveStatus === 'saved'
            ? 'Answers saved.'
            : buffer.saveStatus === 'saving'
              ? 'Saving answers…'
              : 'Answers recorded; saving…'))}
    </span>
  );
  const conflictNotice = buffer.conflict && (
    <div role="alert" className="mx-auto my-4 max-w-4xl space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p>
        This section changed in another tab. Reload the saved answers before continuing. Your unsaved answers will
        remain available below for reference.
      </p>
      <Button
        variant="outline"
        onClick={() =>
          void refresh(true).catch(error => toast.error(getApiErrorMessage(error, 'Could not reload your attempt')))
        }>
        Reload saved answers
      </Button>
    </div>
  );
  const recoveryView = recovery && (
    <details className="mx-auto my-4 max-w-4xl rounded-xl border bg-white p-4">
      <summary className="cursor-pointer font-medium">Your unsaved answers before reloading</summary>
      <p className="my-3 text-sm">
        These are kept here for reference. Re-enter any changes you want to keep if the current section is still
        editable.
      </p>
      {recovery.delivery.pages[0].id === page.id && !recoveredSubmission ? (
        <SectionAnswerReview
          delivery={recovery.delivery}
          answers={recovery.answers}
          onAnswer={() => undefined}
          disabled
        />
      ) : (
        <Textarea aria-label="Text from your unsaved answers" readOnly value={draftText(recovery.answers)} />
      )}
    </details>
  );

  if (recoveredSubmission)
    return (
      <main className="min-h-screen bg-roman-marble p-4">
        <div className="mx-auto max-w-4xl space-y-4 rounded-xl border bg-white p-6">
          <h1 className="font-serif text-2xl text-roman-red">This attempt has been submitted</h1>
          <p>Your unsaved text is available below to copy before viewing the submitted result.</p>
          {recoveryView}
          <Button
            onClick={() => {
              buffer.reset();
              onSubmitted(recoveredSubmission);
            }}>
            View submitted result
          </Button>
        </div>
      </main>
    );

  return (
    <SectionedTestProvider value>
      {conflictNotice}
      {attempt.section.phase === 'answering' ? (
        <TestTakingView
          key={`${attempt.id}:${page.id}:${attempt.section.revision}:${attempt.updatedAt}`}
          title={<SimpleRichDisplay content={title} />}
          pages={attempt.delivery.pages}
          currentPageIndex={0}
          sectionNavigation={{ pageIndex: attempt.section.pageIndex, totalPages: attempt.section.totalPages }}
          answeredCount={answered}
          totalExercises={exercises.length}
          status={saveStatus}
          answers={buffer.answers}
          resolvedExerciseState={attempt.delivery.resolvedExercises}
          resolvedVocabularyPool={attempt.delivery.vocabularyPool}
          onAnswer={buffer.recordAnswer}
          onPrevious={() => undefined}
          onNext={() => undefined}
          onReview={() => void changePhase('review')}
          onExit={() => void onExit()}
          navigationPending={busy || buffer.conflict}
          onExerciseComplete={id => {
            completedRef.current.add(id);
            if (!suppressAutoReview.current && exercises.every(item => completedRef.current.has(item.id)))
              setAutoReview(true);
          }}
        />
      ) : (
        <main className="min-h-screen bg-roman-marble p-4 md:py-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <header className="space-y-3 rounded-2xl border bg-white p-6">
              <p className="text-sm text-roman-stone">
                Section {attempt.section.pageIndex + 1} of {attempt.section.totalPages}
              </p>
              <h1 className="font-serif text-2xl text-roman-red">Review section</h1>
              <p>Check spelling and every answer carefully. After you confirm this section, you cannot return to it.</p>
              <div role="status" aria-live="polite" className="text-sm">
                {saveStatus}
              </div>
            </header>
            <SectionAnswerReview
              key={`${attempt.id}:${page.id}:${attempt.section.revision}:${attempt.updatedAt}`}
              delivery={attempt.delivery}
              answers={buffer.answers}
              onAnswer={event => {
                setAcknowledged(false);
                buffer.recordAnswer(event);
              }}
              disabled={busy || buffer.conflict || attempt.section.phase === 'confirming'}
            />
            {incomplete && (
              <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={busy}
                  onChange={event => setAcknowledged(event.target.checked)}
                />
                <span>I understand this section has unanswered parts and those parts will receive zero credit.</span>
              </label>
            )}
            <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
              <Button
                variant="outline"
                disabled={busy || buffer.conflict}
                onClick={() => void changePhase('answering')}>
                Return to section
              </Button>
              <Button
                disabled={
                  busy || buffer.conflict || (incomplete && !acknowledged && attempt.section.phase !== 'confirming')
                }
                onClick={() => void confirm(attempt.section.phase === 'confirming')}>
                {busy
                  ? 'Confirming section…'
                  : attempt.section.pageIndex === attempt.section.totalPages - 1
                    ? 'Confirm section and submit'
                    : 'Confirm section and continue'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void onExit()}>
                Exit test
              </Button>
            </div>
          </div>
        </main>
      )}
      {recoveryView}
    </SectionedTestProvider>
  );
}
