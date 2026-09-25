'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { FEEDBACK_AREA_LABELS, type FeedbackActivityDocument, type FeedbackAttachmentDescriptor } from '@/shared/student-feedback';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { Button } from '@/src/components/ui/button';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { getApiErrorCode, getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useAddAdminFeedbackNoteMutation,
  useGetAdminFeedbackActivityQuery,
  useGetAdminFeedbackDetailQuery,
  useLazyGetAdminFeedbackAttachmentAccessQuery,
  useUpdateAdminFeedbackStateMutation,
} from '@/src/store/api/studentFeedbackApi';
import { useAuth } from '@/src/hooks/useAuth';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';

const typeLabels = { bug_report: 'Bug report', feature_suggestion: 'Feature suggestion', general: 'General feedback' } as const;
const severityLabels = { blocking: 'Blocking (cannot continue)', major: 'Major (broken with workaround)', minor: 'Minor (visual/usability)' } as const;
const activityLabels: Record<FeedbackActivityDocument['kind'], string> = { submitted: 'Submitted', resolved: 'Resolved', reopened: 'Reopened', archived: 'Archived', unarchived: 'Unarchived', note: 'Private note' };
const isInlineMedia = (type: string) => ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'].includes(type);

function AttachmentRow({ feedbackId, attachment }: { feedbackId: string; attachment: FeedbackAttachmentDescriptor }) {
  const { authUid } = useAuth();
  const [getAccess, { isFetching }] = useLazyGetAdminFeedbackAttachmentAccessQuery();
  const [prepared, setPrepared] = useState<{ url: string; expiresAt: string; disposition: string } | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { setPrepared(null); }, [authUid]);
  useEffect(() => {
    if (!prepared) return;
    setNow(Date.now());
    const delay = Math.max(0, Date.parse(prepared.expiresAt) - Date.now());
    const timer = window.setTimeout(() => setNow(Date.now()), delay + 1);
    return () => window.clearTimeout(timer);
  }, [prepared]);
  const prepare = async (disposition: 'inline' | 'attachment') => {
    setError('');
    setPrepared(null);
    try {
      const result = await getAccess({ feedbackId, attachmentId: attachment.id, disposition }).unwrap();
      setPrepared({ ...result, disposition });
    } catch (cause) { setError(getApiErrorMessage(cause, 'Could not prepare this attachment.')); }
  };
  const valid = prepared && Date.parse(prepared.expiresAt) > now;
  return <li className="rounded-md border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="break-all font-medium">{attachment.originalName}</p><p className="text-xs text-roman-stone">{attachment.contentType} · {(attachment.sizeBytes / (1024 * 1024)).toFixed(1)} MiB</p></div>
      <div className="flex flex-wrap gap-2">
        {isInlineMedia(attachment.contentType) && <Button type="button" size="sm" variant="outline" disabled={isFetching} onClick={() => void prepare('inline')}>Prepare preview</Button>}
        <Button type="button" size="sm" variant="outline" disabled={isFetching} onClick={() => void prepare('attachment')}>Prepare download</Button>
      </div>
    </div>
    {valid && <a href={prepared.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-medium text-roman-red underline">{prepared.disposition === 'inline' ? 'Open preview' : 'Download file'}</a>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {attachment.contentType === 'video/quicktime' && <p className="mt-2 text-xs text-roman-stone">MOV playback may not be supported by your browser. Download the file to view it.</p>}
  </li>;
}

export function FeedbackDetail({ feedbackId }: { feedbackId: string }) {
  const searchParams = useSearchParams();
  const requestedReturn = searchParams.get('return');
  const returnHref = requestedReturn && /^\/admin\/feedback(?:\?|$)/.test(requestedReturn) ? requestedReturn : '/admin/feedback';
  const { data, isLoading, isError, error, refetch } = useGetAdminFeedbackDetailQuery(feedbackId);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const activity = useGetAdminFeedbackActivityQuery({ feedbackId, cursor: activityCursor });
  const [updateState, updateResult] = useUpdateAdminFeedbackStateMutation();
  const [addNote, noteResult] = useAddAdminFeedbackNoteMutation();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [noteRequestId, setNoteRequestId] = useState(() => crypto.randomUUID());
  const [lastAttemptedNote, setLastAttemptedNote] = useState<string | null>(null);
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const feedback = data?.feedback;

  const changeState = async (action: 'resolve' | 'reopen' | 'archive' | 'unarchive') => {
    if (!feedback || busyActions.has(action)) return;
    setBusyActions(current => new Set(current).add(action));
    try {
      await updateState({ feedbackId, action, expectedRevision: feedback.stateRevision, ...(reason.trim() ? { reason: reason.trim() } : {}) }).unwrap();
      setReason('');
      toast.success(`Feedback ${action === 'resolve' ? 'resolved' : action === 'reopen' ? 'reopened' : action === 'archive' ? 'archived' : 'unarchived'}.`);
    } catch (cause) {
      if (getApiErrorCode(cause) === 'FEEDBACK_REVISION_CONFLICT') {
        toast.error('This report changed. The latest state has been loaded; review it before trying again.');
        void refetch();
      } else toast.error(getApiErrorMessage(cause, 'Could not update feedback.'));
    } finally { setBusyActions(current => { const next = new Set(current); next.delete(action); return next; }); }
  };
  const submitNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    const submittedNote = note.trim();
    const submittedRequestId = noteRequestId;
    setLastAttemptedNote(submittedNote);
    try {
      await addNote({ feedbackId, requestId: submittedRequestId, note: submittedNote }).unwrap();
      setNote(current => current.trim() === submittedNote ? '' : current);
      setNoteRequestId(current => current === submittedRequestId ? crypto.randomUUID() : current);
      setLastAttemptedNote(current => current === submittedNote ? null : current);
      toast.success('Private note added.');
    } catch (cause) { toast.error(getApiErrorMessage(cause, 'Could not add the note. Retry to keep the same request ID.')); }
  };

  return <AdminPage>
    <AdminPageHeader title="Feedback detail" actions={<Button asChild variant="outline"><Link href={returnHref}>Back to feedback</Link></Button>} />
    {isLoading && <p role="status">Loading feedback…</p>}
    {isError && <div role="alert" className="rounded-xl border border-destructive/30 bg-white p-5"><p>{getApiErrorMessage(error, 'Could not load feedback.')}</p><Button type="button" variant="outline" className="mt-3" onClick={() => void refetch()}>Retry</Button></div>}
    {feedback && <div className="space-y-5">
      <section className="rounded-xl border border-border bg-white p-5 space-y-3" aria-label="Report">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-xl">{typeLabels[feedback.type]}</h2><span className="rounded-full bg-roman-parchment px-3 py-1 text-sm">{feedback.status}{feedback.archived ? ' · archived' : ''}</span></div>
        <p className="text-sm text-roman-stone">Reference {feedback.id} · Submitted <time dateTime={feedback.createdAt}>{new Date(feedback.createdAt).toLocaleString()}</time></p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-semibold">Submitted by</dt><dd>{feedback.submitter.displayName || 'Name unavailable'} · {feedback.submitter.email || 'Email unavailable'}</dd><dd className="break-all text-xs text-roman-stone">UID: {feedback.submitter.uid}</dd></div>
          <div><dt className="font-semibold">Severity</dt><dd>{feedback.severity ? severityLabels[feedback.severity] : 'Not applicable'}</dd></div>
          <div><dt className="font-semibold">Areas</dt><dd>{feedback.areas.map(area => FEEDBACK_AREA_LABELS[area]).join('; ')}{feedback.otherAreaExplanation ? ` — ${feedback.otherAreaExplanation}` : ''}</dd></div>
          <div><dt className="font-semibold">Overall experience</dt><dd>{feedback.rating ? `${feedback.rating} / 5` : 'Not rated'}</dd></div>
        </dl>
        <div><h3 className="font-semibold">Description</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm">{feedback.description}</p></div>
        {feedback.comments && <div><h3 className="font-semibold">Additional comments</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm">{feedback.comments}</p></div>}
      </section>
      <section className="rounded-xl border border-border bg-white p-5 space-y-3" aria-label="Lesson context">
        <h2 className="font-serif text-lg">Lesson context</h2>
        {feedback.lesson ? <>
          <div className="text-sm">At submission: <SimpleRichDisplay content={feedback.lesson.title} className="inline" /></div>
          {feedback.lesson.pageId && <div className="text-sm">Page {feedback.lesson.pageIndex === null ? 'unknown' : feedback.lesson.pageIndex + 1}: <SimpleRichDisplay content={feedback.lesson.pageTitle || feedback.lesson.pageId} className="inline" /></div>}
          {data.currentLesson ? <><div className="text-sm">Current title: <SimpleRichDisplay content={data.currentLesson.title} className="inline" /></div><div className="flex gap-3 text-sm"><Link href={`/admin/lessons/preview/${encodeURIComponent(data.currentLesson.id)}`} className="font-medium text-roman-red underline">Preview lesson</Link><Link href={`/admin/lessons/edit/${encodeURIComponent(data.currentLesson.id)}`} className="font-medium text-roman-red underline">Edit lesson</Link></div></> : <p className="text-sm text-roman-stone">This lesson is no longer available. Preview and edit are unavailable.</p>}
        </> : <p className="text-sm text-roman-stone">No lesson associated.</p>}
      </section>
      <section className="rounded-xl border border-border bg-white p-5 space-y-3" aria-label="Attachments"><h2 className="font-serif text-lg">Attachments ({feedback.attachments.length})</h2>{feedback.attachments.length ? <ul className="space-y-2">{feedback.attachments.map(item => <AttachmentRow key={item.id} feedbackId={feedbackId} attachment={item} />)}</ul> : <p className="text-sm text-roman-stone">No attachments.</p>}</section>
      <section className="rounded-xl border border-border bg-white p-5 space-y-3" aria-label="Diagnostics"><h2 className="font-serif text-lg">Context and diagnostics</h2><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Entry point</dt><dd>{feedback.diagnostics.entryPoint}</dd></div><div><dt className="font-semibold">Route</dt><dd className="break-all">{feedback.diagnostics.route || 'Unavailable'}</dd></div><div><dt className="font-semibold">App version</dt><dd>{feedback.diagnostics.appVersion || 'Unavailable'}</dd></div><div><dt className="font-semibold">Browser</dt><dd className="break-all">{feedback.diagnostics.browser || 'Unavailable'}</dd></div><div><dt className="font-semibold">Viewport</dt><dd>{feedback.diagnostics.viewport ? `${feedback.diagnostics.viewport.width} × ${feedback.diagnostics.viewport.height}` : 'Unavailable'}</dd></div></dl></section>
      <section className="rounded-xl border border-border bg-white p-5 space-y-3" aria-label="Admin actions"><h2 className="font-serif text-lg">Review</h2><label className="block text-sm">Reason (optional)<textarea className="mt-1 w-full rounded-md border border-border p-2" rows={2} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label><div className="flex flex-wrap gap-2"><Button type="button" disabled={updateResult.isLoading || feedback.status === 'resolved'} onClick={() => void changeState('resolve')}>Resolve</Button><Button type="button" variant="outline" disabled={updateResult.isLoading || feedback.status === 'unresolved'} onClick={() => void changeState('reopen')}>Reopen</Button><Button type="button" variant="outline" disabled={updateResult.isLoading || feedback.archived} onClick={() => void changeState('archive')}>Archive</Button><Button type="button" variant="outline" disabled={updateResult.isLoading || !feedback.archived} onClick={() => void changeState('unarchive')}>Unarchive</Button></div><p className="text-xs text-roman-stone">Archiving changes visibility, not resolution. All changes remain in activity.</p></section>
      <section className="rounded-xl border border-border bg-white p-5 space-y-4" aria-label="Activity"><h2 className="font-serif text-lg">Activity and private notes</h2><form onSubmit={submitNote} className="space-y-2"><label htmlFor="feedback-note" className="block text-sm font-semibold">Add a private admin note</label><textarea id="feedback-note" className="w-full rounded-md border border-border p-2" rows={3} maxLength={5000} value={note} onChange={event => { const next = event.target.value; if (lastAttemptedNote !== null && next.trim() !== lastAttemptedNote) { setNoteRequestId(crypto.randomUUID()); setLastAttemptedNote(null); } setNote(next); }} /><Button type="submit" disabled={noteResult.isLoading || !note.trim()}>{noteResult.isLoading ? 'Saving…' : 'Add note'}</Button></form>{activity.isLoading && <p>Loading activity…</p>}{activity.isError && <div role="alert"><p>{getApiErrorMessage(activity.error, 'Could not load activity.')}</p><Button type="button" variant="outline" onClick={() => void activity.refetch()}>Retry</Button></div>}<ol className="space-y-3">{activity.currentData?.items.map(item => <li key={item.id} className="border-l-2 border-roman-gold/40 pl-3 text-sm"><div className="flex flex-wrap gap-2"><strong>{activityLabels[item.kind]}</strong><time dateTime={item.createdAt} className="text-roman-stone">{new Date(item.createdAt).toLocaleString()}</time></div><p className="text-roman-stone">By {item.actorDisplayName || item.actorUid}</p>{item.reason && <p className="mt-1 whitespace-pre-wrap break-words">Reason: {item.reason}</p>}{item.note && <p className="mt-1 whitespace-pre-wrap break-words">{item.note}</p>}</li>)}</ol>{activity.currentData?.nextCursor && <Button type="button" variant="outline" disabled={activity.isFetching} onClick={() => setActivityCursor(activity.currentData?.nextCursor ?? null)}>Load older activity</Button>}</section>
    </div>}
  </AdminPage>;
}

export const ProtectedFeedbackDetail = withAdminAuth(FeedbackDetail);
