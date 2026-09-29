'use client';

import React, { useId, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ClipboardCheck, Eye, Loader2, LockKeyhole, LogOut, Save } from 'lucide-react';
import { Checkbox } from '@/src/components/ui/checkbox';
import { PlayerActionBar, PlayerBarButton } from '@/src/components/ui/core/player-action-bar';
import { RomanPlayerShell } from '@/src/components/ui/core/roman-player-shell';
import { cn } from '@/src/lib/utils';
import type { ExerciseAnswer, ExerciseAnswerEvent } from '@/src/types/runtime-mode';
import type { StudentTestDelivery } from '@/src/types/test';
import { SectionAnswerReview } from './section-answer-review';

interface SectionReviewViewProps {
  title: ReactNode;
  sectionIndex: number;
  totalSections: number;
  /** A delivery whose only page is the section under review. */
  delivery: StudentTestDelivery;
  vocabularyPoolId?: string | null;
  answers: Record<string, ExerciseAnswer>;
  /** Remounts the answer fields when the saved answers are replaced. */
  answersKey?: string;
  onAnswer: (event: ExerciseAnswerEvent) => void;
  answeredCount: number;
  totalExercises: number;
  status: ReactNode;
  busy?: boolean;
  /** Another tab changed the section: nothing may be edited or confirmed. */
  locked?: boolean;
  /** A confirmation was interrupted and is being resumed: answers are frozen, no acknowledgement is needed. */
  resumingConfirmation?: boolean;
  confirming?: boolean;
  onReturn: () => void;
  onConfirm: (acknowledgeIncomplete: boolean) => void;
  onExit?: () => void;
  preview?: boolean;
  embedded?: boolean;
}

/** The review phase of one test section, shared by student attempts and the admin preview. */
export function SectionReviewView({
  title,
  sectionIndex,
  totalSections,
  delivery,
  vocabularyPoolId,
  answers,
  answersKey,
  onAnswer,
  answeredCount,
  totalExercises,
  status,
  busy = false,
  locked = false,
  resumingConfirmation = false,
  confirming = false,
  onReturn,
  onConfirm,
  onExit,
  preview = false,
  embedded = false,
}: SectionReviewViewProps) {
  const omissionsId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const incomplete = answeredCount < totalExercises;
  const StatusIcon = preview ? Eye : Save;

  return (
    <main
      className={cn(
        embedded
          ? 'min-w-0'
          : 'min-h-screen bg-gradient-to-b from-roman-marble via-white to-roman-parchment/50 p-4 md:py-8'
      )}>
      <div className="mx-auto max-w-4xl space-y-7">
        <RomanPlayerShell
          icon={ClipboardCheck}
          label={preview ? 'Test preview' : 'Answer review'}
          currentPage={sectionIndex + 1}
          totalPages={totalSections}
          title="Review section"
          description={title}
          headingAs={embedded ? 'div' : 'h1'}
          className="overflow-hidden rounded-2xl border-roman-red/15 shadow-md"
          contentClassName="p-5 sm:p-6"
          headerFooter={
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-roman-stone">
              <div role="status" aria-live="polite" className="flex items-center gap-2">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <StatusIcon className="h-4 w-4" aria-hidden="true" />
                )}
                {status}
              </div>
              <span className="rounded-full border border-roman-red/10 bg-white/80 px-3 py-1 font-medium text-roman-red">
                {answeredCount} of {totalExercises} answered
              </span>
            </div>
          }>
          <div className="flex items-start gap-3 text-sm leading-relaxed text-slate-600">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-roman-red/5 text-roman-red">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            </span>
            <p>Check spelling and every answer carefully. After you confirm this section, you cannot return to it.</p>
          </div>
        </RomanPlayerShell>
        <SectionAnswerReview
          key={answersKey}
          delivery={delivery}
          vocabularyPoolId={vocabularyPoolId}
          answers={answers}
          onAnswer={event => {
            setAcknowledged(false);
            onAnswer(event);
          }}
          disabled={busy || locked || resumingConfirmation}
        />
        {incomplete && (
          <label
            htmlFor={omissionsId}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm leading-relaxed text-amber-950">
            <Checkbox
              id={omissionsId}
              className="mt-1 h-5 w-5 rounded-md border-amber-500 data-[state=checked]:border-roman-red data-[state=checked]:bg-roman-red"
              checked={acknowledged}
              disabled={busy}
              onCheckedChange={checked => setAcknowledged(checked === true)}
            />
            <span>I understand this section has unanswered parts and those parts will receive zero credit.</span>
          </label>
        )}
        <PlayerActionBar className="p-4">
          <PlayerBarButton
            type="button"
            tone="outline"
            className="min-h-11 text-roman-red"
            disabled={busy || locked}
            onClick={onReturn}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Return to section
          </PlayerBarButton>
          <PlayerBarButton
            type="button"
            className="h-auto min-h-11 whitespace-normal px-5 py-3 shadow-sm sm:ml-auto"
            disabled={busy || locked || (incomplete && !acknowledged && !resumingConfirmation)}
            onClick={() => onConfirm(resumingConfirmation || acknowledged)}>
            {confirming
              ? 'Confirming section…'
              : sectionIndex === totalSections - 1
                ? 'Confirm section and submit'
                : 'Confirm section and continue'}
            {confirming ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </PlayerBarButton>
          {onExit && (
            <PlayerBarButton type="button" tone="ghost" className="min-h-11" disabled={busy} onClick={onExit}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Exit test
            </PlayerBarButton>
          )}
        </PlayerActionBar>
      </div>
    </main>
  );
}
