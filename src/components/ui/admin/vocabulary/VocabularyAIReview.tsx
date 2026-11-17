'use client';

import { createContext, useContext, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AlertTriangle, Loader2, Sparkles, StickyNote, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  ADMIN_NOTE_MAX,
  AICompletableFieldSchema,
  UNCERTAINTY_EXPLANATION_MAX,
  type AICompletableField,
  type VocabularyAIGuidance,
  type VocabularyAIReview,
} from '@/shared/types/vocabulary/ai-review';
import type { VocabularyWord } from '@/shared/types/vocabulary/schemas';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { useFirebaseAutocomplete } from '@/src/hooks/useFirebaseAutocomplete';
import { cn } from '@/src/lib/utils';
import { changedTableCells, sameWordValue, WORD_TABLE_FIELDS } from '@/src/utils/vocabulary/word-diff';
import { aiFieldLabel, WORD_FIELDS } from './wordFields';

/** What the word editor shares with the field reviews it renders. */
export interface AIReviewContextValue {
  /** Prefixes the element IDs the summary scrolls to. */
  anchorPrefix: string;
  review: VocabularyAIReview;
  /** The editor's current draft, including unsaved table edits; sent to the AI as context. */
  draft: Partial<VocabularyWord>;
  disabled: boolean;
  /** Puts the AI's value in the draft, closes the field's doubt and remembers the admin's note. */
  applyProposal: (field: AICompletableField, value: unknown, note: string) => void;
  /** Closes the field's doubt and keeps its value, remembering the admin's note if there is one. */
  resolve: (field: AICompletableField, note: string) => void;
  removeNote: (id: string) => void;
}

export const AIReviewContext = createContext<AIReviewContextValue | null>(null);

const isCompletable = (field: string): field is AICompletableField => AICompletableFieldSchema.safeParse(field).success;

/** Fields the editor shows in its form or as its table; their reviews render beside them. */
const INLINE_FIELDS = new Set<string>([...Object.keys(WORD_FIELDS), ...WORD_TABLE_FIELDS]);
const TABLE_FIELDS = new Set<string>(WORD_TABLE_FIELDS);
const MAX_LISTED_CELLS = 40;

const anchorId = (prefix: string, field: string) => `${prefix}-ai-review-${field}`;

const draftValue = (draft: Partial<VocabularyWord>, field: AICompletableField): unknown =>
  (draft as Record<string, unknown>)[field];

const doubtFor = (review: VocabularyAIReview, field: AICompletableField) =>
  review.uncertainties
    .filter(item => item.field === field)
    .map(item => item.explanation)
    .join('\n');

const isWordForm = (value: unknown): value is { full_form?: unknown; shortened_form?: unknown } =>
  typeof value === 'object' && value !== null && 'full_form' in value;

/** A value as an admin reads it, rather than as JSON. */
function formatValue(value: unknown, separator = ', '): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const items = value.map(item => formatValue(item)).filter(item => item !== '—');
    return items.length ? items.join(separator) : '—';
  }
  if (isWordForm(value)) {
    const full = formatValue(value.full_form);
    const short = formatValue(value.shortened_form);
    return short === '—' || short === full ? full : `${full} (${short})`;
  }
  return JSON.stringify(value);
}

const valueAt = (value: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => {
    if (Array.isArray(node)) return node[Number(key) - 1];
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  }, value);

function ProposedChange({
  field,
  current,
  proposed,
}: {
  field: AICompletableField;
  current: unknown;
  proposed: unknown;
}) {
  if (TABLE_FIELDS.has(field)) {
    const cells = changedTableCells(current, proposed);
    if (cells.length === 0) return <p className="text-gray-700">The AI proposes no change to the table.</p>;
    return (
      <div className="space-y-1">
        <p className="font-medium">{cells.length === 1 ? '1 cell changes' : `${cells.length} cells change`}</p>
        <ul className="max-h-56 overflow-auto rounded border border-amber-200 bg-white text-xs">
          {cells.slice(0, MAX_LISTED_CELLS).map(path => (
            <li key={path} className="flex flex-wrap justify-between gap-x-3 px-2 py-1 odd:bg-amber-50/50">
              <span className="text-gray-600">{path.split('.').join(' · ')}</span>
              <span>
                <span className="text-gray-500 line-through">{formatValue(valueAt(current, path))}</span>
                {' → '}
                <span className="font-medium">{formatValue(valueAt(proposed, path))}</span>
              </span>
            </li>
          ))}
        </ul>
        {cells.length > MAX_LISTED_CELLS && (
          <p className="text-xs text-gray-600">…and {cells.length - MAX_LISTED_CELLS} more.</p>
        )}
      </div>
    );
  }
  if (sameWordValue(current, proposed))
    return <p className="text-gray-700">The AI proposes no change to this value.</p>;
  const separator = field === 'definitions' ? '\n' : ', ';
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-amber-200 bg-white p-2">
      <dt className="text-gray-500">Now</dt>
      <dd className="whitespace-pre-wrap text-gray-500 line-through">{formatValue(current, separator)}</dd>
      <dt className="text-gray-500">AI</dt>
      <dd className="whitespace-pre-wrap font-medium">{formatValue(proposed, separator)}</dd>
    </dl>
  );
}

interface Proposal {
  /** The field's value when the admin asked, to detect an edit made while the AI was answering. */
  basis: string;
  note: string;
  answer: string | null;
  stillUnsure: string | null;
  hasValue: boolean;
  value: unknown;
}

/**
 * The AI's doubt about one field and the admin's answer to it: a note that the
 * AI turns into a corrected value, or a decision to keep the value as it is.
 */
function DoubtCard({ field, explanation }: { field: AICompletableField; explanation: string }) {
  const context = useContext(AIReviewContext)!;
  const id = useId();
  const label = aiFieldLabel(field);
  const [note, setNote] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const { requestAutocomplete, isLoading } = useFirebaseAutocomplete({
    onError: message => toast.error('The AI could not answer', { description: message }),
  });

  const current = draftValue(context.draft, field);
  const stale = proposal !== null && JSON.stringify(current ?? null) !== proposal.basis;
  const busy = context.disabled || isLoading;
  const trimmed = note.trim();

  const askAI = async () => {
    const { word, part_of_speech } = context.draft;
    if (!trimmed || !word || !part_of_speech || busy) return;
    const basis = JSON.stringify(current ?? null);
    const result = await requestAutocomplete({
      word,
      part_of_speech,
      existingData: context.draft,
      fieldsToComplete: [field],
      overwriteExisting: true,
      followUp: { field, note: trimmed, doubt: explanation.slice(0, UNCERTAINTY_EXPLANATION_MAX) },
    });
    if (!result?.data) return;
    const data = result.data as Record<string, unknown>;
    setProposal({
      basis,
      note: trimmed,
      answer: result.reviewAnswer ?? null,
      stillUnsure: result.uncertainties?.map(item => item.explanation).join('\n') || null,
      hasValue: Object.hasOwn(data, field) && data[field] !== undefined,
      value: data[field],
    });
  };

  const accept = () => {
    if (!proposal?.hasValue || stale || busy) return;
    context.applyProposal(field, proposal.value, proposal.note);
  };

  const keep = () => {
    if (!busy) context.resolve(field, trimmed);
  };

  const onNoteKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void askAI();
    }
  };

  return (
    <div role="group" aria-label={`AI doubt about ${label}`} className="space-y-3 text-sm">
      <p className="flex gap-2 text-amber-950">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <span>
          <span className="font-medium">AI is unsure: </span>
          <span className="whitespace-pre-wrap">{explanation}</span>
        </span>
      </p>

      <div className="space-y-1">
        <label htmlFor={`${id}-note`} className="text-xs font-medium text-gray-700">
          Your note for the AI about {label}
        </label>
        <Textarea
          id={`${id}-note`}
          data-ai-note
          rows={2}
          value={note}
          maxLength={ADMIN_NOTE_MAX}
          readOnly={proposal !== null}
          disabled={busy}
          placeholder="What is correct? e.g. “Third declension i-stem: genitive plural -ium.”"
          onChange={event => setNote(event.target.value)}
          onKeyDown={onNoteKeyDown}
          className="bg-white"
        />
      </div>

      {proposal === null ? (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={askAI} disabled={busy || !trimmed} className="gap-1.5">
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isLoading ? 'Asking AI…' : 'Fix with AI'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={keep} disabled={busy}>
              Keep current value
            </Button>
          </div>
          <p className="text-xs text-gray-600">Your note stays with this word and is sent to the AI next time.</p>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-amber-200 bg-white/70 p-2">
          {proposal.answer && <p className="whitespace-pre-wrap text-gray-800">{proposal.answer}</p>}
          {proposal.stillUnsure && (
            <p className="whitespace-pre-wrap text-amber-800">Still unsure: {proposal.stillUnsure}</p>
          )}
          {proposal.hasValue ? (
            <ProposedChange field={field} current={current} proposed={proposal.value} />
          ) : (
            <p className="text-gray-700">The AI did not propose a value.</p>
          )}
          {stale && (
            <p role="status" className="text-amber-800">
              {label} changed while the AI was answering. Discard and ask again.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={accept} disabled={busy || stale || !proposal.hasValue}>
              Accept
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setProposal(null)} disabled={busy}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteList({ notes }: { notes: VocabularyAIGuidance[] }) {
  const context = useContext(AIReviewContext)!;
  return (
    <ul className="space-y-1">
      {notes.map(note => (
        <li key={note.id} className="flex items-start gap-2 text-xs text-gray-600">
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex-1 whitespace-pre-wrap">
            <span className="font-medium">Note for AI:</span> {note.instruction}
          </span>
          <button
            type="button"
            onClick={() => context.removeNote(note.id)}
            disabled={context.disabled}
            aria-label={`Remove note: ${note.instruction}`}
            className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50">
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Wraps one field of the word editor. When the AI is unsure about the field,
 * the field is highlighted and the doubt is answered right there; notes the
 * admin left for the field are listed under it. Outside the editor (or when AI
 * is off) it renders the field unchanged.
 */
export function AIFieldReview({
  field,
  doubtFirst = false,
  fieldHidden = false,
  children,
}: {
  field: string;
  /** Put the doubt above the field, for a table too long to scroll past. */
  doubtFirst?: boolean;
  /**
   * The form hides this field for the current word (such as Person for a
   * non-personal pronoun). An open doubt is still shown, so it can be resolved.
   */
  fieldHidden?: boolean;
  children?: ReactNode;
}) {
  const context = useContext(AIReviewContext);
  if (!context || !isCompletable(field)) return fieldHidden ? null : children;
  const explanation = doubtFor(context.review, field);
  const notes = context.review.guidance.filter(note => note.field === field);
  const doubt = explanation ? <DoubtCard field={field} explanation={explanation} /> : null;
  if (fieldHidden) {
    if (!doubt) return null;
    return (
      <div
        id={anchorId(context.anchorPrefix, field)}
        className="scroll-mt-4 space-y-3 rounded-lg border border-amber-300 bg-amber-50/70 p-3">
        <p className="text-sm font-medium">
          {aiFieldLabel(field)}: <span className="font-normal">{formatValue(draftValue(context.draft, field))}</span>
        </p>
        {doubt}
      </div>
    );
  }
  return (
    <div
      id={anchorId(context.anchorPrefix, field)}
      className={cn(
        'scroll-mt-4',
        explanation && 'space-y-3 rounded-lg border border-amber-300 bg-amber-50/70 p-3',
        !explanation && notes.length > 0 && 'space-y-2'
      )}>
      {doubtFirst && doubt}
      {children}
      {!doubtFirst && doubt}
      {notes.length > 0 && <NoteList notes={notes} />}
    </div>
  );
}

/**
 * The top of the word editor: which fields the AI is unsure about, as links to
 * them, plus doubts and notes for fields the form does not show.
 */
export function AIReviewSummary() {
  const context = useContext(AIReviewContext);
  if (!context) return null;
  const fields = [...new Set(context.review.uncertainties.map(item => item.field))];
  const elsewhere = fields.filter(field => !INLINE_FIELDS.has(field));
  const otherNotes = context.review.guidance.filter(note => !note.field || !INLINE_FIELDS.has(note.field));
  if (fields.length === 0 && otherNotes.length === 0) return null;

  const jumpTo = (field: string) => {
    const target = document.getElementById(anchorId(context.anchorPrefix, field));
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    target?.querySelector<HTMLTextAreaElement>('[data-ai-note]')?.focus({ preventScroll: true });
  };

  return (
    <section aria-label="AI review" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      {fields.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span className="font-medium text-amber-950">
            AI is unsure about {fields.length === 1 ? '1 field' : `${fields.length} fields`}:
          </span>
          {fields.map(field => (
            <button
              key={field}
              type="button"
              onClick={() => jumpTo(field)}
              className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100">
              {aiFieldLabel(field)}
            </button>
          ))}
        </div>
      )}
      {elsewhere.map(field => (
        <div
          key={field}
          id={anchorId(context.anchorPrefix, field)}
          className="scroll-mt-4 space-y-2 rounded-md border border-amber-200 bg-white p-3">
          <p className="font-medium">
            {aiFieldLabel(field)}: <span className="font-normal">{formatValue(draftValue(context.draft, field))}</span>
          </p>
          <DoubtCard field={field} explanation={doubtFor(context.review, field)} />
        </div>
      ))}
      {otherNotes.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-700">Other notes for the AI on this word</p>
          <NoteList notes={otherNotes} />
        </div>
      )}
    </section>
  );
}
