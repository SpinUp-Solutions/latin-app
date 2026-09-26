'use client';

import { useId, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Lock, Send } from 'lucide-react';
import {
  FEEDBACK_MAX_COMMENTS_LENGTH,
  FEEDBACK_MAX_DESCRIPTION_LENGTH,
  FEEDBACK_MAX_OTHER_EXPLANATION_LENGTH,
  type FeedbackType,
} from '@/shared/student-feedback';
import type { FeedbackDraft, FeedbackFields } from '@/src/hooks/useFeedbackDraft';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { cn } from '@/src/lib/utils';
import { AreaChips, FieldError, FieldHeading, RatingField, SeverityPicker, TypePicker } from './FeedbackFields';
import { FeedbackLessonPicker } from './FeedbackLessonPicker';
import { FeedbackAttachmentsField } from './FeedbackAttachmentsField';

const FIELD_ORDER: Array<keyof FeedbackFields> = ['type', 'severity', 'areas', 'otherAreaExplanation', 'description'];

const DESCRIPTION_PLACEHOLDERS: Record<FeedbackType | 'none', string> = {
  bug_report: 'What happened, and what did you expect instead? Steps to reproduce it help a lot.',
  feature_suggestion: 'What would you like to see, and how would it help you?',
  general: 'Tell us what is on your mind.',
  none: 'Tell us what happened or what you would like to see.',
};

function CharacterCount({ value, max }: { value: string; max: number }) {
  if (value.length < max * 0.8) return null;
  return (
    <p className="mt-1 text-right text-xs text-roman-stone">
      {value.length.toLocaleString()} / {max.toLocaleString()}
    </p>
  );
}

function FeedbackSuccess({ draft, onReturn }: { draft: FeedbackDraft; onReturn?: () => void }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center" role="status">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-roman-green/10">
        <CheckCircle2 className="h-9 w-9 text-roman-green" aria-hidden="true" />
      </div>
      <h2 className="mt-5 font-serif text-2xl text-foreground">Thank you for your feedback</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-roman-stone">
        It has been sent to the course team and helps us improve the app.
      </p>
      <p className="mt-4 text-xs text-roman-stone">
        Reference: <span className="select-all break-all font-mono">{draft.receipt?.feedbackId}</span>
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {onReturn ? (
          <Button type="button" onClick={onReturn}>
            Back to lesson
          </Button>
        ) : (
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        )}
        <Button type="button" variant="outline" onClick={draft.reset}>
          Send more feedback
        </Button>
      </div>
    </div>
  );
}

export function FeedbackForm({
  draft,
  variant,
  onReturn,
}: {
  draft: FeedbackDraft;
  /** "panel" scrolls the fields above a pinned submit bar. */
  variant: 'page' | 'panel';
  onReturn?: () => void;
}) {
  const prefix = useId();
  const ids = {
    type: `${prefix}-type`,
    severity: `${prefix}-severity`,
    areas: `${prefix}-areas`,
    otherAreaExplanation: `${prefix}-other`,
    description: `${prefix}-description`,
    lesson: `${prefix}-lesson`,
    attachments: `${prefix}-attachments`,
    rating: `${prefix}-rating`,
    comments: `${prefix}-comments`,
  };
  const { fields, errors, setField, uploads } = draft;

  if (draft.receipt) return <FeedbackSuccess draft={draft} onReturn={onReturn} />;

  const addFiles = (files: File[]) => {
    for (const message of uploads.addFiles(files)) toast.error(message);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const fieldErrors = await draft.submit();
    const first = fieldErrors && FIELD_ORDER.find(key => fieldErrors[key]);
    if (first) document.getElementById(ids[first as keyof typeof ids])?.focus();
  };

  const submitLabel = draft.submitting ? 'Sending…' : uploads.uploading ? 'Waiting for uploads…' : 'Send feedback';
  const panel = variant === 'panel';

  return (
    <form
      noValidate
      aria-label="Student feedback form"
      onSubmit={handleSubmit}
      onPaste={event => {
        const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
        if (images.length) {
          event.preventDefault();
          addFiles(images);
        }
      }}
      className={cn(panel && 'flex min-h-0 flex-1 flex-col')}>
      <div className={cn('space-y-8', panel && 'min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6')}>
        <TypePicker id={ids.type} value={fields.type} error={errors.type} onChange={value => setField('type', value)} />

        {fields.type === 'bug_report' && (
          <SeverityPicker
            id={ids.severity}
            value={fields.severity}
            error={errors.severity}
            onChange={value => setField('severity', value)}
          />
        )}

        <div>
          <AreaChips id={ids.areas} value={fields.areas} error={errors.areas} onChange={value => setField('areas', value)} />
          {fields.areas.includes('other') && (
            <div className="mt-3">
              <Input
                id={ids.otherAreaExplanation}
                aria-label="Which other area?"
                placeholder="Which other area?"
                maxLength={FEEDBACK_MAX_OTHER_EXPLANATION_LENGTH}
                value={fields.otherAreaExplanation}
                aria-invalid={Boolean(errors.otherAreaExplanation)}
                aria-describedby={errors.otherAreaExplanation ? `${ids.otherAreaExplanation}-error` : undefined}
                onChange={event => setField('otherAreaExplanation', event.target.value)}
              />
              <FieldError id={`${ids.otherAreaExplanation}-error`} message={errors.otherAreaExplanation} />
            </div>
          )}
        </div>

        <div>
          <FieldHeading htmlFor={ids.description}>Tell us more</FieldHeading>
          <Textarea
            id={ids.description}
            rows={6}
            className="resize-y bg-white text-base sm:text-sm"
            placeholder={DESCRIPTION_PLACEHOLDERS[fields.type ?? 'none']}
            maxLength={FEEDBACK_MAX_DESCRIPTION_LENGTH}
            value={fields.description}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? `${ids.description}-error` : undefined}
            onChange={event => setField('description', event.target.value)}
          />
          <CharacterCount value={fields.description} max={FEEDBACK_MAX_DESCRIPTION_LENGTH} />
          <FieldError id={`${ids.description}-error`} message={errors.description} />
        </div>

        <FeedbackLessonPicker
          id={ids.lesson}
          lessonId={draft.lessonId}
          lessonContext={draft.lessonContext}
          pageNumber={draft.pageNumber}
          onChoose={draft.chooseLesson}
        />

        <FeedbackAttachmentsField id={ids.attachments} uploads={uploads} onAddFiles={addFiles} />

        <RatingField id={ids.rating} value={fields.rating} onChange={value => setField('rating', value)} />

        <div>
          <FieldHeading htmlFor={ids.comments} optional>
            Anything else you would like to add?
          </FieldHeading>
          <Textarea
            id={ids.comments}
            rows={3}
            className="resize-y bg-white text-base sm:text-sm"
            maxLength={FEEDBACK_MAX_COMMENTS_LENGTH}
            value={fields.comments}
            onChange={event => setField('comments', event.target.value)}
          />
          <CharacterCount value={fields.comments} max={FEEDBACK_MAX_COMMENTS_LENGTH} />
        </div>
      </div>

      <div
        className={cn(
          'flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between',
          panel ? 'shrink-0 border-t border-roman-gold/20 bg-white px-5 py-4 sm:px-6' : 'mt-10 border-t border-roman-gold/20 pt-6'
        )}>
        <p className="flex items-center gap-1.5 text-xs text-roman-stone">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Your name and email are shared with the course team.
        </p>
        <Button type="submit" className="gap-2 sm:min-w-40" disabled={draft.submitting || uploads.uploading}>
          {draft.submitting || uploads.uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
