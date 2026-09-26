'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  feedbackFormSchema,
  type FeedbackArea,
  type FeedbackReceipt,
  type FeedbackSeverity,
  type FeedbackType,
} from '@/shared/student-feedback';
import { getApiErrorCode, getApiErrorMessage } from '@/src/store/api/baseQuery';
import { studentFeedbackApi, useSubmitFeedbackMutation } from '@/src/store/api/studentFeedbackApi';
import { useAppDispatch } from '@/src/store/hooks';
import { useFeedbackUploads } from '@/src/hooks/useFeedbackUploads';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';

export interface FeedbackLessonContext {
  lessonId: string;
  lessonTitle: string;
  pageId: string;
  pageNumber: number;
}

export interface FeedbackFields {
  type: FeedbackType | null;
  severity: FeedbackSeverity | null;
  areas: FeedbackArea[];
  otherAreaExplanation: string;
  description: string;
  rating: number | null;
  comments: string;
}

export type FeedbackFieldErrors = Partial<Record<keyof FeedbackFields, string>>;

const EMPTY_FIELDS: FeedbackFields = {
  type: null,
  severity: null,
  areas: [],
  otherAreaExplanation: '',
  description: '',
  rating: null,
  comments: '',
};

/** "context" follows the lesson page the student is on; "picked" is an explicit choice. */
type LessonChoice = { source: 'context' } | { source: 'picked'; lessonId: string | null };

/**
 * Holds one feedback draft. Callers keep this hook mounted while a dialog closes
 * so the draft survives, and key it by account so signing out discards it.
 */
export function useFeedbackDraft(lessonContext?: FeedbackLessonContext) {
  const dispatch = useAppDispatch();
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [errors, setErrors] = useState<FeedbackFieldErrors>({});
  const [lessonChoice, setLessonChoice] = useState<LessonChoice>({ source: 'context' });
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);
  const [submitFeedback, { isLoading: submitting }] = useSubmitFeedbackMutation();
  const uploads = useFeedbackUploads(draftId);

  const lessonId = lessonChoice.source === 'context' ? (lessonContext?.lessonId ?? null) : lessonChoice.lessonId;
  const pageId = lessonChoice.source === 'context' ? (lessonContext?.pageId ?? null) : null;

  const dirty =
    fields.type !== null ||
    fields.areas.length > 0 ||
    fields.rating !== null ||
    [fields.description, fields.comments, fields.otherAreaExplanation].some(text => text.trim()) ||
    uploads.uploads.length > 0 ||
    lessonChoice.source === 'picked';
  const navigationGuard = useUnsavedNavigationGuard(dirty && !receipt, 'Discard your unfinished feedback?');

  const setField = useCallback(<K extends keyof FeedbackFields>(key: K, value: FeedbackFields[K]) => {
    setFields(current => ({ ...current, [key]: value }));
    setErrors(current => (current[key] ? { ...current, [key]: undefined } : current));
  }, []);

  const chooseLesson = useCallback(
    (id: string | null) => {
      const contextId = lessonContext?.lessonId ?? null;
      setLessonChoice(id === contextId ? { source: 'context' } : { source: 'picked', lessonId: id });
    },
    [lessonContext?.lessonId]
  );

  const { reset: resetUploads } = uploads;
  const reset = useCallback(() => {
    resetUploads();
    setDraftId(crypto.randomUUID());
    setFields(EMPTY_FIELDS);
    setErrors({});
    setLessonChoice({ source: 'context' });
    setReceipt(null);
  }, [resetUploads]);

  /** Returns field errors when validation fails, so the form can focus the first one. */
  const submit = async (): Promise<FeedbackFieldErrors | null> => {
    // Severity and the "Other" explanation stay in the draft when hidden, but only count while they apply.
    const parsed = feedbackFormSchema.safeParse({
      type: fields.type ?? undefined,
      severity: fields.type === 'bug_report' ? (fields.severity ?? undefined) : undefined,
      areas: fields.areas,
      otherAreaExplanation: fields.areas.includes('other') ? fields.otherAreaExplanation.trim() || undefined : undefined,
      description: fields.description,
      rating: fields.rating ?? undefined,
      comments: fields.comments.trim() || undefined,
    });
    if (!parsed.success) {
      const next: FeedbackFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FeedbackFields;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return next;
    }
    if (uploads.uploading) return null;
    if (uploads.failed) {
      toast.error('Retry or remove the files that failed to upload.');
      return null;
    }

    try {
      const response = await submitFeedback({
        draftId,
        ...parsed.data,
        lessonId,
        pageId,
        attachments: uploads.ready,
        diagnostics: {
          entryPoint: lessonContext ? 'lesson' : 'standalone',
          ...(process.env.NEXT_PUBLIC_APP_VERSION ? { appVersion: process.env.NEXT_PUBLIC_APP_VERSION.slice(0, 100) } : {}),
          browser: navigator.userAgent.slice(0, 300),
          viewport: { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) },
          route: window.location.pathname.slice(0, 512),
        },
      }).unwrap();
      setReceipt(response.receipt);
    } catch (error) {
      if (getApiErrorCode(error) === 'FEEDBACK_LESSON_UNAVAILABLE') {
        setLessonChoice({ source: 'picked', lessonId: null });
        dispatch(studentFeedbackApi.util.invalidateTags(['FeedbackLessons']));
        toast.error('That lesson is no longer available, so we removed it from your report. Please send it again.');
      } else {
        toast.error(getApiErrorMessage(error, 'Could not send your feedback. Your draft is still here.'));
      }
    }
    return null;
  };

  return {
    fields,
    setField,
    errors,
    lessonContext,
    lessonId,
    pageNumber: pageId ? (lessonContext?.pageNumber ?? null) : null,
    chooseLesson,
    uploads,
    submit,
    submitting,
    receipt,
    reset,
    navigationGuard,
  };
}

export type FeedbackDraft = ReturnType<typeof useFeedbackDraft>;
