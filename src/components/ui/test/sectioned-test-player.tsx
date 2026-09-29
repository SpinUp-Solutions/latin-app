'use client';

import React, { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { StudentInProgressTestAttempt, StudentSubmittedTestAttempt, StudentTestDelivery } from '@/src/types/test';
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
import { SectionReviewView } from './section-review-view';
import { TestTakingView } from './test-taking-view';

interface Props {
  attempt: StudentInProgressTestAttempt;
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
  const [pendingAction, setPendingAction] = useState<'navigation' | 'confirmation' | null>(null);
  const busy = pendingAction !== null;
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [recovery, setRecovery] = useState<{
    delivery: StudentTestDelivery;
    answers: Record<string, ExerciseAnswer>;
  } | null>(null);
  const [recoveredSubmission, setRecoveredSubmission] = useState<StudentSubmittedTestAttempt | null>(null);
  const page = attempt.delivery.pages[0];
  const exercises = page.items.filter(item => isExerciseType(item.type)) as Exercise[];
  const answered = exercises.filter(item =>
    isExerciseAnswerComplete(
      item,
      buffer.answers[item.id],
      attempt.delivery.resolvedExercises[item.id]?.items.length ?? 0
    )
  ).length;
  const revision = () => buffer.getSectionRevision() ?? attempt.section.revision;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { activateAttempt } = buffer;
  const adopt = useCallback(
    (updated: StudentInProgressTestAttempt) => {
      if (!mountedRef.current) return;
      activateAttempt({
        attemptId: updated.id,
        answers: updated.answers,
        section: updated.section,
        originKey,
      });
      onAttempt(updated);
    },
    [activateAttempt, onAttempt, originKey]
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

  /** Runs one server step at a time; the ref also blocks a second click before the state re-renders. */
  const runExclusive = async (action: 'navigation' | 'confirmation', task: () => Promise<void>) => {
    if (busyRef.current || buffer.conflict) return;
    busyRef.current = true;
    setPendingAction(action);
    try {
      await task();
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPendingAction(null);
    }
  };

  const changePhase = (phase: 'answering' | 'review') =>
    runExclusive('navigation', async () => {
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        if (!mountedRef.current) return;
        toast.error(getApiErrorMessage(error, 'Save your answers before continuing.'));
      }
    });

  const confirm = (acknowledgeIncomplete: boolean) =>
    runExclusive('confirmation', async () => {
      try {
        await buffer.flushPendingAnswers();
        const request = {
          uid,
          attemptId: attempt.id,
          pageId: page.id,
          expectedRevision: revision(),
          requestId: crypto.randomUUID(),
          acknowledgeIncomplete,
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
      }
    });

  // A refresh during confirmation lands in the confirming phase. Resume it once per section.
  const resumeInterruptedConfirmation = useEffectEvent(() => {
    if (attempt.section.phase === 'confirming') void confirm(true);
  });
  useEffect(() => {
    resumeInterruptedConfirmation();
  }, [attempt.id, page.id]);

  const saveStatus = (
    <span>
      {pendingAction === 'confirmation'
        ? 'Confirming section…'
        : pendingAction === 'navigation'
          ? 'Saving answers…'
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

  const sectionKey = `${attempt.id}:${page.id}:${attempt.section.revision}:${attempt.updatedAt}`;
  return (
    <>
      {conflictNotice}
      {attempt.section.phase === 'answering' ? (
        <TestTakingView
          key={sectionKey}
          title={<SimpleRichDisplay content={title} />}
          page={page}
          sectionIndex={attempt.section.pageIndex}
          totalSections={attempt.section.totalPages}
          answeredCount={answered}
          totalExercises={exercises.length}
          status={saveStatus}
          answers={buffer.answers}
          resolvedExerciseState={attempt.delivery.resolvedExercises}
          resolvedVocabularyPool={attempt.delivery.vocabularyPool}
          onAnswer={buffer.recordAnswer}
          onReview={() => void changePhase('review')}
          onExit={() => void onExit()}
          navigationPending={busy || buffer.conflict}
        />
      ) : (
        <SectionReviewView
          key={`${attempt.id}:${page.id}`}
          title={<SimpleRichDisplay content={title} />}
          sectionIndex={attempt.section.pageIndex}
          totalSections={attempt.section.totalPages}
          delivery={attempt.delivery}
          answers={buffer.answers}
          answersKey={sectionKey}
          onAnswer={buffer.recordAnswer}
          answeredCount={answered}
          totalExercises={exercises.length}
          status={saveStatus}
          busy={busy}
          locked={buffer.conflict}
          resumingConfirmation={attempt.section.phase === 'confirming'}
          confirming={pendingAction === 'confirmation'}
          onReturn={() => void changePhase('answering')}
          onConfirm={acknowledgeIncomplete => void confirm(acknowledgeIncomplete)}
          onExit={() => void onExit()}
        />
      )}
      {recoveryView}
    </>
  );
}
