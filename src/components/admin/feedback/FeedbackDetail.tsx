'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  MessageSquare,
  Pencil,
  RotateCcw,
  Send,
  Star,
  type LucideIcon,
} from 'lucide-react';
import {
  FEEDBACK_AREA_LABELS,
  FEEDBACK_MAX_NOTE_LENGTH,
  FEEDBACK_MAX_REASON_LENGTH,
  FEEDBACK_TYPE_LABELS,
  type FeedbackActivity,
  type FeedbackAdminAction,
  type FeedbackAdminDetailResponse,
} from '@/shared/student-feedback';
import { AdminErrorState, AdminLoadingState, AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useAddAdminFeedbackNoteMutation,
  useGetAdminFeedbackDetailQuery,
  useUpdateAdminFeedbackStateMutation,
} from '@/src/store/api/studentFeedbackApi';
import { cn } from '@/src/lib/utils';
import { FeedbackAttachments } from './FeedbackAttachments';
import { FeedbackBadges, FeedbackTypeIcon, formatDateTime, formatRelativeTime, submitterName } from './feedback-ui';

const ACTIVITY: Record<FeedbackActivity['kind'], { icon: LucideIcon; text: string }> = {
  submitted: { icon: Send, text: 'sent this report' },
  resolved: { icon: CheckCircle2, text: 'marked it resolved' },
  reopened: { icon: RotateCcw, text: 'reopened it' },
  archived: { icon: Archive, text: 'archived it' },
  unarchived: { icon: ArchiveRestore, text: 'moved it out of the archive' },
  note: { icon: MessageSquare, text: 'added a note' },
};

const ACTION_MESSAGES: Record<FeedbackAdminAction, string> = {
  resolve: 'Marked as resolved.',
  reopen: 'Reopened.',
  archive: 'Archived.',
  unarchive: 'Moved out of the archive.',
};

function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border bg-white shadow-sm', className)} aria-label={title}>
      {title && (
        <h2 className="border-b border-border px-5 py-3 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-roman-stone">
          {title}
        </h2>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-roman-stone">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function ReviewPanel({ feedbackId, feedback }: { feedbackId: string; feedback: FeedbackAdminDetailResponse['feedback'] }) {
  const [updateState, { isLoading }] = useUpdateAdminFeedbackStateMutation();
  const [reason, setReason] = useState('');
  const run = async (action: FeedbackAdminAction) => {
    const text = reason.trim();
    try {
      await updateState({ feedbackId, action, ...(text ? { reason: text } : {}) }).unwrap();
      // Keep anything typed while the request was in flight.
      setReason(current => (current.trim() === text ? '' : current));
      toast.success(ACTION_MESSAGES[action]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update this report.'));
    }
  };
  const resolved = feedback.status === 'resolved';

  return (
    <Panel title="Review">
      <div className="space-y-3">
        <Textarea
          aria-label="Reason (optional)"
          placeholder="Add a reason for the activity log (optional)"
          rows={2}
          maxLength={FEEDBACK_MAX_REASON_LENGTH}
          value={reason}
          onChange={event => setReason(event.target.value)}
        />
        <Button
          type="button"
          className="w-full gap-2"
          variant={resolved ? 'outline' : 'default'}
          disabled={isLoading}
          onClick={() => void run(resolved ? 'reopen' : 'resolve')}>
          {resolved ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          {resolved ? 'Reopen' : 'Mark resolved'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full gap-2 text-roman-stone"
          disabled={isLoading}
          onClick={() => void run(feedback.archived ? 'unarchive' : 'archive')}>
          {feedback.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
          {feedback.archived ? 'Unarchive' : 'Archive'}
        </Button>
        <p className="text-xs leading-relaxed text-roman-stone">Archiving hides a report from the queue without resolving it.</p>
      </div>
    </Panel>
  );
}

function ActivityPanel({ feedbackId, activity }: { feedbackId: string; activity: FeedbackActivity[] }) {
  const [addNote, { isLoading }] = useAddAdminFeedbackNoteMutation();
  const [note, setNote] = useState('');
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = note.trim();
    if (!text || isLoading) return;
    try {
      await addNote({ feedbackId, note: text }).unwrap();
      setNote(current => (current.trim() === text ? '' : current));
      toast.success('Note added.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not add the note.'));
    }
  };

  return (
    <Panel title="Activity">
      <ol className="space-y-5">
        {activity.map((item, index) => {
          const { icon: Icon, text } = ACTIVITY[item.kind];
          return (
            <li key={item.id} className="relative flex gap-3">
              {index < activity.length - 1 && (
                <span className="absolute left-[13px] top-7 h-[calc(100%-4px)] w-px bg-border" aria-hidden="true" />
              )}
              <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-roman-parchment/60">
                <Icon className="h-3.5 w-3.5 text-roman-stone" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-sm">
                  <span className="font-medium text-foreground">{item.actorDisplayName || item.actorUid}</span>{' '}
                  <span className="text-roman-stone">{text}</span>{' '}
                  <time className="text-xs text-roman-stone/80" dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                    · {formatRelativeTime(item.createdAt)}
                  </time>
                </p>
                {item.reason && <p className="mt-1 whitespace-pre-wrap break-words text-sm italic text-roman-stone">“{item.reason}”</p>}
                {item.note && (
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-roman-gold/25 bg-roman-parchment/50 px-3 py-2 text-sm text-foreground">
                    {item.note}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <form onSubmit={submit} className="mt-6 border-t border-border pt-5">
        <label htmlFor="feedback-note" className="mb-2 block text-sm font-medium text-foreground">
          Private note
        </label>
        <Textarea
          id="feedback-note"
          rows={3}
          maxLength={FEEDBACK_MAX_NOTE_LENGTH}
          placeholder="Only admins can see notes. Press ⌘/Ctrl + Enter to add."
          value={note}
          onChange={event => setNote(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
          }}
        />
        <div className="mt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={isLoading || !note.trim()}>
            {isLoading ? 'Adding…' : 'Add note'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function StudentPanel({ submitter }: { submitter: FeedbackAdminDetailResponse['feedback']['submitter'] }) {
  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(submitter.uid);
      toast.success('UID copied.');
    } catch {
      toast.error('Could not copy the UID.');
    }
  };
  return (
    <Panel title="Student">
      <dl className="space-y-3">
        <Detail label="Name">{submitter.displayName || 'Not provided'}</Detail>
        <Detail label="Email">
          {submitter.email ? (
            <a href={`mailto:${submitter.email}`} className="text-primary hover:underline">
              {submitter.email}
            </a>
          ) : (
            'Not provided'
          )}
        </Detail>
        <Detail label="UID">
          <span className="inline-flex max-w-full items-center gap-1">
            <span className="truncate font-mono text-xs">{submitter.uid}</span>
            <button type="button" onClick={() => void copyUid()} className="rounded p-1 text-roman-stone hover:text-primary" aria-label="Copy UID">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        </Detail>
      </dl>
      <Link
        href={`/admin/feedback?status=all&submitterUid=${encodeURIComponent(submitter.uid)}`}
        className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
        All feedback from this student →
      </Link>
    </Panel>
  );
}

function LessonPanel({ feedback, currentLesson }: Pick<FeedbackAdminDetailResponse, 'feedback' | 'currentLesson'>) {
  const lesson = feedback.lesson;
  return (
    <Panel title="Lesson">
      {!lesson ? (
        <p className="text-sm text-roman-stone">Not about a specific lesson.</p>
      ) : (
        <div className="space-y-3">
          <SimpleRichDisplay content={lesson.title} className="font-medium text-foreground" />
          {lesson.pageIndex !== null && (
            <div className="flex items-start gap-2 text-sm text-roman-stone">
              <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                Page {lesson.pageIndex + 1}
                {lesson.pageTitle && (
                  <>
                    {' · '}
                    <SimpleRichDisplay content={lesson.pageTitle} className="inline text-sm text-roman-stone [&_p]:inline" />
                  </>
                )}
              </span>
            </div>
          )}
          {currentLesson ? (
            <>
              {currentLesson.title !== lesson.title && (
                <div className="text-xs text-roman-stone">
                  Now titled <SimpleRichDisplay content={currentLesson.title} className="inline text-xs [&_p]:inline" />
                </div>
              )}
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={`/admin/lessons/preview/${encodeURIComponent(currentLesson.id)}`}>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Preview lesson
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={`/admin/lessons/edit/${encodeURIComponent(currentLesson.id)}`}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-roman-stone">This lesson has since been removed.</p>
          )}
          <Link
            href={`/admin/feedback?status=all&lessonId=${encodeURIComponent(lesson.id)}`}
            className="inline-block text-sm font-medium text-primary hover:underline">
            All feedback about this lesson →
          </Link>
        </div>
      )}
    </Panel>
  );
}

function DevicePanel({ diagnostics }: { diagnostics: FeedbackAdminDetailResponse['feedback']['diagnostics'] }) {
  return (
    <Panel title="Device">
      <dl className="space-y-3">
        <Detail label="Sent from">{diagnostics.entryPoint === 'lesson' ? 'Lesson feedback panel' : 'Feedback page'}</Detail>
        {diagnostics.route && <Detail label="Page">{diagnostics.route}</Detail>}
        {diagnostics.viewport && (
          <Detail label="Window size">
            {diagnostics.viewport.width} × {diagnostics.viewport.height}
          </Detail>
        )}
        {diagnostics.appVersion && <Detail label="App version">{diagnostics.appVersion}</Detail>}
        {diagnostics.browser && (
          <Detail label="Browser">
            <span className="text-xs text-roman-stone">{diagnostics.browser}</span>
          </Detail>
        )}
      </dl>
    </Panel>
  );
}

export function FeedbackDetail({ feedbackId }: { feedbackId: string }) {
  const searchParams = useSearchParams();
  const requestedReturn = searchParams.get('return');
  const returnHref = requestedReturn && /^\/admin\/feedback(?:\?|$)/.test(requestedReturn) ? requestedReturn : '/admin/feedback';
  const { data, isLoading, isError, error, refetch } = useGetAdminFeedbackDetailQuery(feedbackId);
  const feedback = data?.feedback;

  return (
    <AdminPage>
      <AdminPageHeader
        title={
          feedback ? (
            <span className="flex items-center gap-3">
              <FeedbackTypeIcon type={feedback.type} />
              {FEEDBACK_TYPE_LABELS[feedback.type]}
            </span>
          ) : (
            'Feedback'
          )
        }
        description={
          feedback && (
            <>
              From {submitterName(feedback.submitter)} ·{' '}
              <time dateTime={feedback.createdAt} title={formatDateTime(feedback.createdAt)}>
                {formatRelativeTime(feedback.createdAt)}
              </time>
            </>
          )
        }
        actions={
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={returnHref}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              All feedback
            </Link>
          </Button>
        }
      />

      {isLoading && <AdminLoadingState label="Loading feedback" />}
      {isError && <AdminErrorState message={getApiErrorMessage(error, 'Could not load this report.')} onRetry={() => void refetch()} />}

      {data && feedback && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            <Panel>
              <div className="flex flex-wrap items-center gap-2">
                <FeedbackBadges report={feedback} showOpen />
                {feedback.areas.map(area => (
                  <span key={area} className="rounded-full bg-roman-parchment px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {FEEDBACK_AREA_LABELS[area]}
                  </span>
                ))}
              </div>
              {feedback.otherAreaExplanation && (
                <p className="mt-2 text-xs text-roman-stone">Other area: {feedback.otherAreaExplanation}</p>
              )}
              <p className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">{feedback.description}</p>
              {feedback.comments && (
                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.12em] text-roman-stone">Anything else</h3>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{feedback.comments}</p>
                </div>
              )}
              <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-roman-stone">
                <span>Overall experience</span>
                {feedback.rating ? (
                  <span className="flex items-center gap-0.5" aria-label={`${feedback.rating} of 5`}>
                    {[1, 2, 3, 4, 5].map(value => (
                      <Star
                        key={value}
                        className={cn('h-4 w-4', value <= (feedback.rating ?? 0) ? 'fill-roman-gold text-roman-gold' : 'text-roman-stone/30')}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                ) : (
                  <span className="text-roman-stone/80">not rated</span>
                )}
              </div>
            </Panel>

            {feedback.attachments.length > 0 && (
              <Panel title={`Attachments (${feedback.attachments.length})`}>
                <FeedbackAttachments feedbackId={feedbackId} attachments={feedback.attachments} />
              </Panel>
            )}

            <ActivityPanel feedbackId={feedbackId} activity={data.activity} />
          </div>

          <aside className="space-y-6">
            <ReviewPanel feedbackId={feedbackId} feedback={feedback} />
            <StudentPanel submitter={feedback.submitter} />
            <LessonPanel feedback={feedback} currentLesson={data.currentLesson} />
            <DevicePanel diagnostics={feedback.diagnostics} />
          </aside>
        </div>
      )}
    </AdminPage>
  );
}

export const ProtectedFeedbackDetail = withAdminAuth(FeedbackDetail);
