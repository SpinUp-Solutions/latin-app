'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  FEEDBACK_AREAS,
  FEEDBACK_AREA_LABELS,
  FEEDBACK_MAX_COMMENTS_LENGTH,
  FEEDBACK_MAX_DESCRIPTION_LENGTH,
  FEEDBACK_MAX_OTHER_EXPLANATION_LENGTH,
  feedbackFormSchema,
  submitFeedbackRequestSchema,
  type FeedbackArea,
  type FeedbackReceipt,
  type FeedbackSeverity,
  type FeedbackType,
} from '@/shared/student-feedback';
import { Button } from '@/src/components/ui/button';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { getApiErrorCode, getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useCreateFeedbackSessionMutation,
  useGetFeedbackLessonsQuery,
  useLazyGetFeedbackSessionQuery,
  useSubmitFeedbackMutation,
} from '@/src/store/api/studentFeedbackApi';
import { useAuth } from '@/src/hooks/useAuth';
import type { FeedbackLessonOption } from '@/src/store/api/studentFeedbackApi';
import { useFeedbackAttachments } from '@/src/hooks/useFeedbackAttachments';
import { FEEDBACK_MAX_ATTACHMENTS, FEEDBACK_MAX_IMAGE_BYTES, FEEDBACK_MAX_TOTAL_BYTES, FEEDBACK_MAX_VIDEO_BYTES, FEEDBACK_MIME_TYPES } from '@/shared/student-feedback';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { UnsavedNavigationDialog } from '@/src/components/ui/core/UnsavedNavigationDialog';

export interface FeedbackLessonContext {
  lessonId: string;
  pageId: string;
  pageIndex: number;
  revision: number;
}

interface FeedbackComposerProps {
  entryPoint: 'standalone' | 'lesson';
  lessonContext?: FeedbackLessonContext;
  active?: boolean;
  onReturn?: () => void;
  renderContent?: (content: React.ReactNode) => React.ReactNode;
}

const TYPE_LABELS: Record<FeedbackType, string> = {
  bug_report: 'Bug report',
  feature_suggestion: 'Feature suggestion',
  general: 'General feedback',
};
const SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  blocking: 'Blocking (cannot continue)',
  major: 'Major (broken with workaround)',
  minor: 'Minor (visual/usability)',
};
const EMPTY_DRAFT = { type: '' as FeedbackType | '', severity: '' as FeedbackSeverity | '', areas: [] as FeedbackArea[], otherAreaExplanation: '', description: '', rating: '' as number | '', comments: '' };
const EMPTY_LESSONS: FeedbackLessonOption[] = [];
const fieldClass = 'w-full rounded-md border border-roman-gold/30 bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Kept mounted by the lesson dialog so closing it preserves the draft and uploads. */
export function FeedbackComposer({ entryPoint, lessonContext, active = true, onReturn, renderContent }: FeedbackComposerProps) {
  const { authUid } = useAuth();
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(lessonContext?.lessonId ?? null);
  const [pageContext, setPageContext] = useState<FeedbackLessonContext | null>(lessonContext ?? null);
  const [lessonSearch, setLessonSearch] = useState('');
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const sessionReady = useRef(false);
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [contextError, setContextError] = useState(false);
  const [uploadRemovalFailed, setUploadRemovalFailed] = useState(false);
  const [createSession] = useCreateFeedbackSessionMutation();
  const [getSession] = useLazyGetFeedbackSessionQuery();
  const [submitFeedback, submitState] = useSubmitFeedbackMutation();
  const { data: lessonData, isLoading: lessonsLoading, isError: lessonsError, refetch: refetchLessons } = useGetFeedbackLessonsQuery();

  const ensureSession = useCallback(async () => {
    if (sessionReady.current) return;
    try {
      await createSession({ sessionId }).unwrap();
      sessionReady.current = true;
      return;
    } catch (error) {
      // A lost create response may still have opened this idempotent session.
      try {
        const recovered = await getSession(sessionId).unwrap();
        if (recovered.session.status === 'open') { sessionReady.current = true; return; }
      } catch { /* Present the original error. */ }
      throw error;
    }
  }, [sessionId, createSession, getSession]);
  const attachments = useFeedbackAttachments({ sessionId, ensureSession });
  const startFreshUploadSession = () => {
    attachments.reset();
    setSessionId(crypto.randomUUID());
    sessionReady.current = false;
    setUploadRemovalFailed(false);
  };

  useEffect(() => {
    setDraft({ ...EMPTY_DRAFT });
    setSelectedLessonId(lessonContext?.lessonId ?? null);
    setPageContext(lessonContext ?? null);
    setSelectionTouched(false);
    setSessionId(crypto.randomUUID());
    sessionReady.current = false;
    setReceipt(null);
    setContextError(false);
    setUploadRemovalFailed(false);
    setFieldErrors({});
    // Intentionally reset when the account changes, not when a dialog closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUid]);

  const draftIsDirty = Boolean(draft.type || draft.areas.length || draft.description || draft.comments || draft.rating || draft.otherAreaExplanation || attachments.items.length || selectionTouched);
  const navigationGuard = useUnsavedNavigationGuard(draftIsDirty && !receipt, 'Discard your unfinished feedback?');
  useEffect(() => {
    if (!active || draftIsDirty || receipt || !lessonContext) return;
    setSelectedLessonId(lessonContext.lessonId);
    setPageContext(lessonContext);
  }, [active, draftIsDirty, receipt, lessonContext]);

  const lessons = lessonData?.lessons ?? EMPTY_LESSONS;
  const selectedLesson = lessons.find(item => item.id === selectedLessonId);
  const filteredLessons = useMemo(() => lessons.filter(item => item.title.replace(/<[^>]*>/g, ' ').toLocaleLowerCase().includes(lessonSearch.toLocaleLowerCase())), [lessons, lessonSearch]);
  const update = <K extends keyof typeof EMPTY_DRAFT>(key: K, value: (typeof EMPTY_DRAFT)[K]) => {
    setDraft(previous => ({ ...previous, [key]: value }));
    setFieldErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
  };
  const selectLesson = (id: string | null) => {
    setSelectionTouched(true);
    setSelectedLessonId(id);
    setPageContext(current => current?.lessonId === id ? current : null);
    setContextError(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    const formValue = {
      type: draft.type,
      ...(draft.type === 'bug_report' ? { severity: draft.severity } : {}),
      areas: draft.areas,
      ...(draft.areas.includes('other') ? { otherAreaExplanation: draft.otherAreaExplanation.trim() } : {}),
      description: draft.description.trim(),
      ...(draft.rating ? { rating: draft.rating } : {}),
      ...(draft.comments.trim() ? { comments: draft.comments.trim() } : {}),
    };
    const parsed = feedbackFormSchema.safeParse(formValue);
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])));
      const firstField = String(parsed.error.issues[0]?.path[0] ?? '');
      const selector: Record<string, string> = {
        type: 'input[name="feedbackType"]', severity: 'input[name="severity"]', areas: 'input[type="checkbox"]',
        otherAreaExplanation: '#feedback-other', description: '#feedback-description',
      };
      if (selector[firstField]) window.setTimeout(() => document.querySelector<HTMLElement>(selector[firstField])?.focus(), 0);
      return;
    }
    if (attachments.hasPendingOrFailed) {
      toast.error('Finish, retry, or remove every attachment before submitting.');
      return;
    }
    try {
      await ensureSession();
      const diagnostics = {
        entryPoint,
        ...(process.env.NEXT_PUBLIC_APP_VERSION ? { appVersion: process.env.NEXT_PUBLIC_APP_VERSION.slice(0, 100) } : {}),
        browser: navigator.userAgent.slice(0, 300),
        viewport: { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) },
        route: window.location.pathname.slice(0, 512),
      } as const;
      const body = submitFeedbackRequestSchema.parse({
        ...parsed.data,
        sessionId,
        lessonId: selectedLessonId,
        pageContext: pageContext && pageContext.lessonId === selectedLessonId
          ? { pageId: pageContext.pageId, pageIndex: pageContext.pageIndex, revision: pageContext.revision }
          : null,
        attachmentIds: attachments.readyIds,
        diagnostics,
      });
      const response = await submitFeedback(body).unwrap();
      setReceipt(response.receipt);
      toast.success('Feedback submitted. Thank you.');
    } catch (error) {
      if (getApiErrorCode(error) === 'FEEDBACK_STALE_LESSON_CONTEXT' || getApiErrorCode(error) === 'FEEDBACK_LESSON_INACCESSIBLE') {
        setContextError(true);
        void refetchLessons();
        return;
      }
      try {
        const recovered = await getSession(sessionId).unwrap();
        if (recovered.session.receipt) {
          setReceipt(recovered.session.receipt);
          toast.success('Feedback submitted. Thank you.');
          return;
        }
      } catch { /* Keep the draft and the original error. */ }
      if (getApiErrorCode(error) === 'FEEDBACK_SESSION_EXPIRED') {
        startFreshUploadSession();
        toast.error('Your feedback session expired. Your text and choices are saved. Add attachments again, then submit.');
        return;
      }
      toast.error(getApiErrorMessage(error, 'Could not submit feedback. Your draft is still here.'));
    }
  };

  if (receipt) {
    const result = (
    <div className="space-y-5" role="status">
      <h2 className="font-serif text-2xl text-roman-red">Thank you for your feedback</h2>
      <p>Reference: <strong className="break-all">{receipt.feedbackId}</strong></p>
      <p className="text-sm text-roman-stone">Submitted {new Date(receipt.submittedAt).toLocaleString()}.</p>
      <div className="flex flex-wrap gap-3">
        {onReturn ? <Button type="button" onClick={onReturn}>Return to lesson</Button> : null}
        <Button asChild variant={onReturn ? 'outline' : 'default'}><Link href="/dashboard">Back to dashboard</Link></Button>
        {entryPoint === 'standalone' ? <Button type="button" variant="outline" onClick={() => { attachments.reset(); setDraft({ ...EMPTY_DRAFT }); setSessionId(crypto.randomUUID()); sessionReady.current = false; setReceipt(null); setSelectedLessonId(null); setPageContext(null); }}>Submit another</Button> : null}
      </div>
    </div>
    );
    return <>{renderContent ? renderContent(result) : result}<UnsavedNavigationDialog guard={navigationGuard} /></>;
  }

  const result = (
    <form onSubmit={submit} className="space-y-6" aria-label="Student feedback form" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); attachments.addFiles(Array.from(event.dataTransfer.files)); }} onPaste={event => {
      const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
      if (images.length) { event.preventDefault(); attachments.addFiles(images); }
    }}>
      <p className="text-sm text-roman-stone">Your name and email, when available, will be visible to administrators along with this report.</p>
      <fieldset className="space-y-2" aria-required="true" aria-invalid={Boolean(fieldErrors.type)} aria-describedby={fieldErrors.type ? 'feedback-type-error' : undefined}>
        <legend className="font-semibold">What kind of feedback is this? <span aria-hidden="true">*</span></legend>
        {(Object.entries(TYPE_LABELS) as [FeedbackType, string][]).map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="feedbackType" value={value} checked={draft.type === value} onChange={() => { setDraft(previous => ({ ...previous, type: value, severity: value === 'bug_report' ? previous.severity : '' })); setFieldErrors(previous => ({ ...previous, type: '', severity: '' })); }} />{label}</label>)}
        {fieldErrors.type && <p id="feedback-type-error" className="text-sm text-destructive">{fieldErrors.type}</p>}
      </fieldset>
      {draft.type === 'bug_report' && <fieldset className="space-y-2" aria-required="true" aria-invalid={Boolean(fieldErrors.severity)} aria-describedby={fieldErrors.severity ? 'feedback-severity-error' : undefined}>
        <legend className="font-semibold">How severe is it? <span aria-hidden="true">*</span></legend>
        {(Object.entries(SEVERITY_LABELS) as [FeedbackSeverity, string][]).map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="severity" value={value} checked={draft.severity === value} onChange={() => update('severity', value)} />{label}</label>)}
        {fieldErrors.severity && <p id="feedback-severity-error" className="text-sm text-destructive">{fieldErrors.severity}</p>}
      </fieldset>}
      <fieldset className="space-y-2" aria-required="true" aria-invalid={Boolean(fieldErrors.areas)} aria-describedby={fieldErrors.areas ? 'feedback-areas-error' : undefined}>
        <legend className="font-semibold">Which areas does this concern? <span aria-hidden="true">*</span></legend>
        {FEEDBACK_AREAS.map(area => <label key={area} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={draft.areas.includes(area)} onChange={event => {
          const areas = event.target.checked ? [...draft.areas, area] : draft.areas.filter(item => item !== area);
          setDraft(previous => ({ ...previous, areas, otherAreaExplanation: areas.includes('other') ? previous.otherAreaExplanation : '' }));
          setFieldErrors(previous => ({ ...previous, areas: '', otherAreaExplanation: '' }));
        }} /><span>{FEEDBACK_AREA_LABELS[area]}</span></label>)}
        {fieldErrors.areas && <p id="feedback-areas-error" className="text-sm text-destructive">{fieldErrors.areas}</p>}
      </fieldset>
      {draft.areas.includes('other') && <div className="space-y-1">
        <label htmlFor="feedback-other" className="font-semibold">Please explain Other <span aria-hidden="true">*</span></label>
        <input id="feedback-other" className={fieldClass} maxLength={FEEDBACK_MAX_OTHER_EXPLANATION_LENGTH} aria-required="true" aria-invalid={Boolean(fieldErrors.otherAreaExplanation)} aria-describedby={fieldErrors.otherAreaExplanation ? 'feedback-other-error' : undefined} value={draft.otherAreaExplanation} onChange={event => update('otherAreaExplanation', event.target.value)} />
        <p className="text-xs text-roman-stone">{draft.otherAreaExplanation.length}/{FEEDBACK_MAX_OTHER_EXPLANATION_LENGTH}</p>
        {fieldErrors.otherAreaExplanation && <p id="feedback-other-error" className="text-sm text-destructive">{fieldErrors.otherAreaExplanation}</p>}
      </div>}
      <div className="space-y-1">
        <label htmlFor="feedback-description" className="font-semibold">Describe the issue or suggestion <span aria-hidden="true">*</span></label>
        <textarea id="feedback-description" className={fieldClass} rows={6} maxLength={FEEDBACK_MAX_DESCRIPTION_LENGTH} aria-required="true" aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? 'feedback-description-error' : undefined} value={draft.description} onChange={event => update('description', event.target.value)} />
        <p className="text-xs text-roman-stone">{draft.description.length}/{FEEDBACK_MAX_DESCRIPTION_LENGTH}</p>
        {fieldErrors.description && <p id="feedback-description-error" className="text-sm text-destructive">{fieldErrors.description}</p>}
      </div>
      <div className="space-y-2">
        <label htmlFor="feedback-lesson" className="font-semibold">Related lesson (optional)</label>
        <p className="text-sm text-roman-stone">Choose an accessible lesson, or leave this report without a lesson.</p>
        <input type="search" aria-label="Search lessons" placeholder="Search lessons" className={fieldClass} value={lessonSearch} onChange={event => setLessonSearch(event.target.value)} />
        <select id="feedback-lesson" className={fieldClass} value={selectedLessonId ?? ''} onChange={event => selectLesson(event.target.value || null)}>
          <option value="">Not about a specific lesson</option>
          {selectedLessonId && !selectedLesson && <option value={selectedLessonId} disabled>{lessonsLoading ? 'Loading selected lesson…' : 'Selected lesson unavailable'}</option>}
          {selectedLessonId && !filteredLessons.some(item => item.id === selectedLessonId) && selectedLesson ? <option value={selectedLesson.id}>{selectedLesson.title.replace(/<[^>]*>/g, ' ')}</option> : null}
          {filteredLessons.map(item => <option key={item.id} value={item.id}>{item.title.replace(/<[^>]*>/g, ' ')}</option>)}
        </select>
        {selectedLesson && <div className="text-sm">Selected: <SimpleRichDisplay content={selectedLesson.title} className="inline" /></div>}
        {selectedLessonId && !selectedLesson && !lessonsLoading && !lessonsError && <div role="alert" className="text-sm text-amber-800">This lesson is unavailable. Choose another lesson or select “Not about a specific lesson.”</div>}
        {pageContext && selectedLessonId === pageContext.lessonId && <p className="text-xs text-roman-stone">Current lesson page {pageContext.pageIndex + 1} is included. Changing the lesson clears page context.</p>}
        {lessonsLoading && <p className="text-sm text-roman-stone">Loading accessible lessons…</p>}
        {lessonsError && <Button type="button" variant="outline" onClick={() => void refetchLessons()}>Retry loading lessons</Button>}
        {contextError && <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
          <p>That lesson or page changed or is no longer accessible. Your draft is safe.</p>
          <div className="flex flex-wrap gap-2">
            {selectedLesson && <Button type="button" variant="outline" size="sm" onClick={() => { setPageContext(null); setContextError(false); }}>Use refreshed lesson without page</Button>}
            <Button type="button" variant="outline" size="sm" onClick={() => { selectLesson(null); setPageContext(null); }}>No lesson</Button>
          </div>
        </div>}
      </div>
      <div className="space-y-3 rounded-lg border border-dashed border-roman-gold/50 p-4">
        <label htmlFor="feedback-attachments" className="block font-semibold">Screenshots or screen recordings (optional)</label>
        <p className="text-xs text-roman-stone">Choose files, drop them here, or paste images. Up to {FEEDBACK_MAX_ATTACHMENTS} files, {FEEDBACK_MAX_IMAGE_BYTES / 1048576} MiB per image, {FEEDBACK_MAX_VIDEO_BYTES / 1048576} MiB per video, and {FEEDBACK_MAX_TOTAL_BYTES / 1048576} MiB total. PNG, JPEG, WebP, MP4, WebM, and MOV.</p>
        <input id="feedback-attachments" type="file" multiple accept={FEEDBACK_MIME_TYPES.join(',')} className="block w-full text-sm" onChange={event => { attachments.addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
        {attachments.items.length > 0 && <ul className="space-y-2" aria-label="Attachments">{attachments.items.map(item => <li key={item.id} className="rounded-md border border-border bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-all font-medium">{item.name}</span><span className="text-xs text-roman-stone">{(item.size / 1048576).toFixed(1)} MiB</span></div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><span role="status">{item.status === 'uploading' ? `Uploading ${Math.round(item.progress * 100)}%` : item.status === 'processing' ? 'Processing and verifying…' : item.status === 'ready' ? 'Ready' : `Failed: ${item.error || 'Upload failed'}`}</span><div className="flex gap-2">{item.status === 'error' && <Button type="button" variant="outline" size="sm" onClick={() => attachments.retry(item.id)}>Retry</Button>}<Button type="button" variant="ghost" size="sm" onClick={() => { void attachments.remove(item.id).catch(error => { setUploadRemovalFailed(true); toast.error(getApiErrorMessage(error, 'Could not remove attachment.')); }); }}>Remove</Button></div></div>
          {item.status === 'uploading' && <progress className="mt-2 w-full" max={100} value={Math.round(item.progress * 100)} aria-label={`Upload progress for ${item.name}`} />}
        </li>)}</ul>}
        {(attachments.items.some(item => item.status === 'error') || uploadRemovalFailed) && <div className="space-y-2 text-sm"><p>If an upload cannot be retried or removed, you can start a fresh upload session. Your written feedback and choices stay here; add any files again.</p><Button type="button" variant="outline" onClick={startFreshUploadSession}>Remove uploads and start a new session</Button></div>}
      </div>
      <fieldset className="space-y-2">
        <legend className="font-semibold">Overall experience (optional)</legend>
        <div className="flex flex-wrap gap-4"><label className="text-sm"><input type="radio" name="rating" checked={draft.rating === ''} onChange={() => update('rating', '')} /> No rating</label>{[1, 2, 3, 4, 5].map(value => <label key={value} className="text-sm"><input type="radio" name="rating" checked={draft.rating === value} onChange={() => update('rating', value)} /> {value}</label>)}</div>
      </fieldset>
      <div className="space-y-1">
        <label htmlFor="feedback-comments" className="font-semibold">Anything else? (optional)</label>
        <textarea id="feedback-comments" className={fieldClass} rows={3} maxLength={FEEDBACK_MAX_COMMENTS_LENGTH} value={draft.comments} onChange={event => update('comments', event.target.value)} />
        <p className="text-xs text-roman-stone">{draft.comments.length}/{FEEDBACK_MAX_COMMENTS_LENGTH}</p>
      </div>
      <Button type="submit" disabled={submitState.isLoading || attachments.hasPendingOrFailed || !active}>{submitState.isLoading ? 'Submitting…' : 'Submit feedback'}</Button>
    </form>
  );
  return <>{renderContent ? renderContent(result) : result}<UnsavedNavigationDialog guard={navigationGuard} /></>;
}
