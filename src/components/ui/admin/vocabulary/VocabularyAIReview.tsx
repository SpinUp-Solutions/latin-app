'use client';

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ArrowUp,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Lightbulb,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import {
  ADMIN_NOTE_MAX,
  AI_REVIEW_ITEM_LIMIT,
  AICompletableFieldSchema,
  type AICompletableField,
  type VocabularyAIMemory,
  type VocabularyAIReview,
  type VocabularyAIUncertainty,
} from '@/shared/types/vocabulary/ai-review';
import type { VocabularyWord } from '@/shared/types/vocabulary/schemas';
import type { LearnedAIRules } from '@/src/store/api/vocabularyAIGuidanceApi';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { cn } from '@/src/lib/utils';
import { changedTableCells, sameWordValue, WORD_TABLE_FIELDS } from '@/src/utils/vocabulary/word-diff';
import { aiFieldLabel, WORD_FIELDS } from './wordFields';
import {
  snapshotValue as snapshot,
  STOP_WAITING_HINT,
  type AIAssistantStore,
  type AITurn,
  type ProposedChange,
  type Turn,
} from './aiAssistantStore';

/** An answer from the AI that the admin accepted, as the editor applies it. */
export interface AcceptedAIReply {
  /** New field values, keyed by field. */
  changes: Partial<Record<AICompletableField, unknown>>;
  /** Questions the answer settles. */
  closed: AICompletableField[];
  /** Facts to keep on the word for later AI requests. */
  notes: VocabularyAIMemory[];
  /** The admin's message the notes were drawn from, kept with them. */
  source?: string;
}

/** What the word editor shares with the AI assistant and the field markers it renders. */
export interface AIReviewContextValue {
  /** Prefixes the element IDs that questions and fields link to. */
  anchorPrefix: string;
  review: VocabularyAIReview;
  /** The editor's current draft, including unsaved table edits; sent to the AI as context. */
  draft: Partial<VocabularyWord>;
  disabled: boolean;
  /** Applies an accepted answer to the draft and returns the notes that fit on the word. */
  acceptReply: (reply: AcceptedAIReply) => VocabularyAIMemory[];
  /** The label of the editor's save button, for saying how to keep the draft. */
  saveLabel: string;
  /** Closes a question and keeps the field's value, remembering that an admin confirmed it. */
  keep: (field: AICompletableField, note: string) => void;
  removeNote: (id: string) => void;
  /** Saves the rules for all words that the AI learns; without it the AI's rules are shown but not kept. */
  learnedRules?: LearnedAIRules;
  /** Keeps this word's conversation, and whether the assistant is shown, across word switches. */
  assistant: AIAssistantStore;
  /** Which conversation in the store belongs to this word. */
  chatKey: string;
  /** The word as saved, to notice a field the admin changed by hand after the AI asked about it. */
  saved: Partial<VocabularyWord>;
}

export const AIReviewContext = createContext<AIReviewContextValue | null>(null);

const isCompletable = (field: string): field is AICompletableField => AICompletableFieldSchema.safeParse(field).success;

/** Fields the editor shows in its form or as its table, which a question can link to. */
const INLINE_FIELDS = new Set<string>([...Object.keys(WORD_FIELDS), ...WORD_TABLE_FIELDS]);
const TABLE_FIELDS = new Set<string>(WORD_TABLE_FIELDS);
const MAX_LISTED_CELLS = 40;

const questionAnchor = (prefix: string, field: string) => `${prefix}-ai-question-${field}`;
const fieldAnchor = (prefix: string, field: string) => `${prefix}-ai-field-${field}`;
const composerId = (prefix: string) => `${prefix}-ai-composer`;

const draftValue = (draft: Partial<VocabularyWord>, field: AICompletableField): unknown =>
  (draft as Record<string, unknown>)[field];
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const truncate = (text: string, length: number) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

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

/** Scrolls to an element in the editor and optionally focuses something in it. */
function reveal(id: string, focus?: () => HTMLElement | null | undefined, block: ScrollLogicalPosition = 'center') {
  document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block });
  focus?.()?.focus({ preventScroll: true });
}

const listLabels = (labels: string[]) =>
  labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

/** What one autocomplete did, so the assistant can say so. */
export interface AIAutocompleteRun {
  filled: AICompletableField[];
  questions: number;
  /** Fields the AI would have changed but left alone, because the admin changed them while it worked. */
  kept?: AICompletableField[];
}

/** The assistant's report on an autocomplete: all good, or what it still asks. */
export function autocompleteMessage(run: AIAutocompleteRun, word: string): string {
  const filled = run.filled.length > 4 ? plural(run.filled.length, 'field') : listLabels(run.filled.map(aiFieldLabel));
  const kept = run.kept?.length
    ? ` I left ${listLabels(run.kept.map(aiFieldLabel))} as you changed it while I was working.`
    : '';
  // No questions means the model raised none, not that its answers were checked, so it says only that.
  if (run.questions === 0) {
    return filled
      ? `All good! No questions from me about ${word}. I filled ${filled}.${kept} If anything looks off, tell me below.`
      : `All good! No questions from me about ${word}, and there was nothing left to fill.${kept} If anything looks off, tell me below.`;
  }
  const asks = `I have ${plural(run.questions, 'question')} for you above.`;
  return filled ? `Done. I filled ${filled} in ${word}.${kept} ${asks}` : `Done.${kept} ${asks}`;
}

/** The AI's proposed value next to the current one; for a table, only the cells that change. */
function ChangeView({ field, current, proposed }: { field: AICompletableField; current: unknown; proposed: unknown }) {
  if (TABLE_FIELDS.has(field)) {
    const cells = changedTableCells(current, proposed);
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">
          {cells.length === 1 ? '1 cell changes' : `${cells.length} cells change`}
        </p>
        <ul className="max-h-48 overflow-auto rounded border border-gray-200 text-xs">
          {cells.slice(0, MAX_LISTED_CELLS).map(path => (
            <li key={path} className="flex flex-wrap justify-between gap-x-3 px-2 py-1 odd:bg-gray-50">
              <span className="text-gray-600">{path.split('.').join(' · ')}</span>
              <span>
                <span className="text-gray-500 line-through">{formatValue(valueAt(current, path))}</span>
                {' → '}
                <span className="font-medium text-gray-900">{formatValue(valueAt(proposed, path))}</span>
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
  const separator = field === 'definitions' ? '\n' : ', ';
  return (
    <div className="space-y-0.5 text-sm">
      <p className="whitespace-pre-wrap text-gray-500 line-through">{formatValue(current, separator)}</p>
      <p className="whitespace-pre-wrap font-medium text-gray-900">{formatValue(proposed, separator)}</p>
    </div>
  );
}

function AIAvatar() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}

function AIBubble({ children, label = 'AI' }: { children: ReactNode; label?: string }) {
  return (
    <li className="flex items-start gap-2">
      <AIAvatar />
      <div className="min-w-0 flex-1 space-y-2 rounded-2xl rounded-tl-sm bg-violet-50/70 px-3 py-2 text-sm text-gray-900">
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </li>
  );
}

function QuestionCard({
  number,
  question,
  changed,
  onPick,
  onKeep,
  onDone,
}: {
  number: number;
  question: VocabularyAIUncertainty;
  /** The admin changed the field by hand since the AI asked. */
  changed: boolean;
  onPick: (answer: string) => void;
  onKeep: () => void;
  onDone: () => void;
}) {
  const context = useContext(AIReviewContext)!;
  const { field } = question;
  const label = aiFieldLabel(field);
  const current = draftValue(context.draft, field);
  return (
    <div
      role="group"
      aria-label={`AI question about ${label}`}
      id={questionAnchor(context.anchorPrefix, field)}
      className="scroll-mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-amber-900">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[11px]">
            {number}
          </span>
          {INLINE_FIELDS.has(field) ? (
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => reveal(fieldAnchor(context.anchorPrefix, field), undefined, 'start')}
              aria-label={`Show the ${label} field`}>
              {label}
            </button>
          ) : (
            label
          )}
        </span>
        {!changed && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={context.disabled}
            onClick={onKeep}>
            Keep as is
          </Button>
        )}
      </div>
      {changed && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs text-gray-800 ring-1 ring-amber-200">
          <span>You changed {label} since the AI asked.</span>
          <Button type="button" size="sm" className="h-7 px-3 text-xs" disabled={context.disabled} onClick={onDone}>
            Done
          </Button>
        </div>
      )}
      <p className="font-medium text-gray-900">{question.question ?? question.explanation}</p>
      {question.question && <p className="whitespace-pre-wrap text-sm text-gray-700">{question.explanation}</p>}
      {!TABLE_FIELDS.has(field) && (
        <p className="text-xs text-gray-600">
          Now: <span className="text-gray-800">{truncate(formatValue(current), 240)}</span>
        </p>
      )}
      {(question.options?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={`Suggested answers about ${label}`}>
          {question.options!.map(option => (
            <button
              key={option}
              type="button"
              disabled={context.disabled}
              onClick={() => onPick(option)}
              className="rounded-full border border-amber-300 bg-white px-3 py-1 text-left text-xs text-gray-800 shadow-sm transition-colors hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50">
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The suggested rule for all words: saved only on its own click, whatever became of the reply. */
function RuleSuggestion({
  turn,
  onSaveRule,
  onUndoRule,
}: {
  turn: AITurn;
  onSaveRule: () => void;
  onUndoRule: (id: string) => void;
}) {
  const context = useContext(AIReviewContext)!;
  const proposal = turn.proposal!;
  const savedRuleId = turn.rule.status === 'saved' ? turn.rule.id : null;
  return (
    <div className="flex gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs text-gray-700">
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p>
          <span className="font-medium">
            {savedRuleId || turn.rule.status === 'known' ? 'Rule for all words:' : 'Suggested rule for all words:'}
          </span>{' '}
          “{proposal.rule}”
        </p>
        <p className="text-gray-500" title={proposal.prompt}>
          From your message: “{truncate(proposal.prompt, 160)}”
        </p>
        {!context.learnedRules && <p className="text-gray-500">Rules can’t be saved from this page.</p>}
        {turn.rule.status === 'saving' && <p className="text-gray-500">Saving the rule…</p>}
        {turn.rule.status === 'known' && <p className="text-gray-500">The AI already follows this rule.</p>}
        {turn.rule.status === 'failed' && <p className="text-amber-800">Not saved: {turn.rule.message}</p>}
        {turn.rule.status === 'undone' && <p className="text-gray-500">Rule removed.</p>}
        {savedRuleId && (
          <p className="text-green-700">
            Saved. The AI follows it for every word.{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => onUndoRule(savedRuleId)}>
              Undo
            </button>
          </p>
        )}
        {context.learnedRules &&
          (turn.rule.status === 'offered' || turn.rule.status === 'failed' || turn.rule.status === 'undone') && (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onSaveRule}>
              {turn.rule.status === 'failed' ? 'Try again' : 'Save as rule for all words'}
            </Button>
          )}
      </div>
    </div>
  );
}

/** The proposed changes, as old and new values. */
function ChangeList({ turn }: { turn: AITurn }) {
  const context = useContext(AIReviewContext)!;
  const proposal = turn.proposal!;
  const pending = turn.status === 'pending';
  const stale = (change: ProposedChange) => snapshot(draftValue(context.draft, change.field)) !== change.basis;
  if (proposal.changes.length === 0) return null;
  return (
    <ul aria-label="Proposed changes" className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      {proposal.changes.map(change => (
        <li key={change.field} className="grid gap-1 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
          <span className="text-xs font-medium text-gray-600">{aiFieldLabel(change.field)}</span>
          <div className="min-w-0 space-y-1">
            <ChangeView
              field={change.field}
              current={pending ? draftValue(context.draft, change.field) : JSON.parse(change.basis)}
              proposed={change.value}
            />
            {pending && stale(change) && (
              <p role="status" className="text-xs text-amber-800">
                You edited {aiFieldLabel(change.field)} after asking, so this change will not be applied. Ask again to
                update it.
              </p>
            )}
            {turn.skipped?.includes(change.field) && (
              <p className="text-xs text-amber-800">Not applied, because you had edited this field.</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function NoteList({ title, notes }: { title: string; notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="flex gap-2 text-xs text-gray-700">
      <BookmarkCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        <ul className="list-disc pl-4">
          {notes.map(note => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * What a decided reply actually did, in one line, with its details on request.
 * It reports only what landed, and whether the saved word holds it yet.
 */
function DecisionReceipt({ turn }: { turn: AITurn }) {
  const context = useContext(AIReviewContext)!;
  const [showDetails, setShowDetails] = useState(false);
  const proposal = turn.proposal!;
  const word = context.draft.word?.trim() || 'this word';
  const applied = turn.status === 'accepted' ? turn.applied : undefined;
  const fields = applied ? (Object.keys(applied.values) as AICompletableField[]) : [];
  const kept = applied?.notes ?? [];
  const skipped = turn.skipped ?? [];

  let summary = 'Replaced by a newer answer. Nothing was changed.';
  let status: { text: string; tone: 'saved' | 'warn' | 'draft' } | null = null;
  if (turn.status === 'discarded') summary = 'Discarded. Nothing was changed.';
  if (applied) {
    summary = [
      fields.length > 0 ? `Accepted into the draft: ${listLabels(fields.map(aiFieldLabel))}.` : 'Accepted.',
      kept.length > 0 ? `Remembering ${plural(kept.length, 'note')}.` : '',
      skipped.length > 0 ? `Skipped ${listLabels(skipped.map(aiFieldLabel))}, which you had edited.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const savedReview = context.saved.ai_review;
    const landed = fields.length + kept.length + applied.closed.length > 0;
    // Saved means the saved word holds what was accepted, not merely that a save happened since.
    const saved =
      fields.every(field => sameWordValue(draftValue(context.saved, field), applied.values[field])) &&
      kept.every(note => savedReview?.guidance.some(item => item.instruction === note)) &&
      applied.closed.every(field => !savedReview?.uncertainties.some(item => item.field === field));
    const overwritten = fields.filter(field => !sameWordValue(draftValue(context.draft, field), applied.values[field]));
    if (!landed) status = null;
    else if (saved) status = { text: `Saved on ${word}.`, tone: 'saved' };
    else if (overwritten.length > 0)
      status = {
        text: `You have since changed ${listLabels(overwritten.map(aiFieldLabel))} by hand, so the AI’s version will not be saved.`,
        tone: 'warn',
      };
    else status = { text: `Not saved yet: save the word with ${context.saveLabel}.`, tone: 'draft' };
  }

  const dropped = applied ? proposal.remember.filter(note => !kept.includes(note.note)) : [];
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-start gap-2">
        <p className="flex-1 font-medium text-gray-800">{summary}</p>
        <button
          type="button"
          aria-expanded={showDetails}
          onClick={() => setShowDetails(!showDetails)}
          className="shrink-0 rounded px-1.5 text-gray-600 underline-offset-2 hover:underline">
          {showDetails ? 'Hide details' : 'Details'}
        </button>
      </div>
      {status && (
        <p
          className={cn(
            status.tone === 'saved' && 'text-green-700',
            status.tone === 'warn' && 'text-amber-800',
            status.tone === 'draft' && 'text-gray-600'
          )}>
          {status.text}
        </p>
      )}
      {showDetails && (
        <div className="space-y-2 pt-1">
          <ChangeList turn={turn} />
          {applied ? (
            <>
              <NoteList title={`Remembered for ${word}:`} notes={kept} />
              <NoteList
                title="Not kept:"
                notes={dropped.map(note =>
                  note.field && skipped.includes(note.field)
                    ? `${note.note} (you had edited ${aiFieldLabel(note.field)})`
                    : `${note.note} (this word already holds ${AI_REVIEW_ITEM_LIMIT} notes)`
                )}
              />
            </>
          ) : (
            <NoteList title="Suggested notes, not kept:" notes={proposal.remember.map(note => note.note)} />
          )}
        </div>
      )}
    </div>
  );
}

function ProposalView({
  turn,
  busy,
  onAccept,
  onDiscard,
  onSaveRule,
  onUndoRule,
}: {
  turn: AITurn;
  busy: boolean;
  onAccept: () => void;
  onDiscard: () => void;
  onSaveRule: () => void;
  onUndoRule: (id: string) => void;
}) {
  const context = useContext(AIReviewContext)!;
  const proposal = turn.proposal!;
  const word = context.draft.word ?? 'this word';
  const decidable = proposal.changes.length + proposal.remember.length + proposal.answered.length > 0;
  const rule = proposal.rule ? <RuleSuggestion turn={turn} onSaveRule={onSaveRule} onUndoRule={onUndoRule} /> : null;

  // Once decided, a reply shrinks to what it did; an unsaved rule stays in full, still saveable.
  if (turn.status !== 'pending') {
    return (
      <div className="space-y-2">
        {decidable && <DecisionReceipt turn={turn} />}
        {rule}
      </div>
    );
  }

  const fresh = proposal.changes.filter(change => snapshot(draftValue(context.draft, change.field)) === change.basis);
  const acceptLabel = fresh.length ? `Accept ${fresh.length === 1 ? 'change' : `${fresh.length} changes`}` : 'Accept';
  return (
    <div className="space-y-2">
      <ChangeList turn={turn} />
      <NoteList title={`I'll remember for ${word}:`} notes={proposal.remember.map(note => note.note)} />
      {rule}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" onClick={onAccept} disabled={busy}>
          {acceptLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function MemoryList({ word }: { word: string }) {
  const context = useContext(AIReviewContext)!;
  const notes = context.review.guidance;
  if (notes.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t border-gray-100 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
        <BookmarkCheck className="h-3.5 w-3.5 text-violet-600" aria-hidden />
        What the AI remembers about {word}
      </p>
      <ul aria-label={`What the AI remembers about ${word}`} className="space-y-1">
        {notes.map(note => (
          <li key={note.id} className="flex items-start gap-2 text-xs text-gray-700">
            <span className="min-w-0 flex-1 whitespace-pre-wrap">
              {note.field && <span className="font-medium">{aiFieldLabel(note.field)}: </span>}
              {note.instruction}
              {note.source && (
                <span className="block text-[11px] text-gray-500" title={note.source}>
                  From the message: “{truncate(note.source, 160)}”
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => context.removeNote(note.id)}
              disabled={context.disabled}
              aria-label={`Forget: ${note.instruction}`}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Slides the dock and its tab in and out quickly; people who ask for less motion get none. */
const SLIDE =
  'transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none';

/**
 * The AI assistant, floating at the bottom of the word editor like a chat
 * input. Above the input: what the AI is unsure about, as questions with
 * suggested answers, and the conversation in which the admin answers them or
 * asks for any other fix. The AI answers in words and lists the changes it
 * proposes; nothing reaches the draft until the admin accepts it. Facts the
 * admin states are remembered on the word, and a principle that applies to
 * every word becomes a rule for all words.
 *
 * The down arrow dismisses it to a small tab, keeping what was typed. Each
 * word's conversation lives in the page's store, so it survives switching
 * words, and a reply still running for another word can be stopped or let
 * finish.
 */
export function AIAssistantDock() {
  const context = useContext(AIReviewContext);
  const composer = useRef<HTMLTextAreaElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  /** Rules being saved, so a quick second click cannot send one twice. */
  const savingRules = useRef(new Set<number>());
  const chatKey = context?.chatKey ?? null;
  const chat = context ? context.assistant.chat(context.chatKey) : null;
  const turnCount = chat?.turns.length ?? 0;
  const waiting = Boolean(chat?.pending);

  // The store announces an answer that arrives for a word that is not on screen.
  const showChat = useEffectEvent((key: string | null) => context?.assistant.show(key));
  useEffect(() => {
    showChat(chatKey);
    return () => showChat(null);
  }, [chatKey]);

  // Like any chat, it follows the newest message, unless the admin has scrolled up to read.
  const following = useRef(true);
  useEffect(() => {
    const element = sheet.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [turnCount, waiting]);

  if (!context || !chat) return null;

  const { review, draft, disabled, assistant } = context;
  const key = context.chatKey;
  const { turns, message, pending } = chat;
  const word = draft.word?.trim() || 'this word';
  const questions = review.uncertainties;
  const busy = disabled || Boolean(pending);
  const open = assistant.open;
  const elsewhere = assistant.runningElsewhere(key)[0];
  const hasSheet = questions.length > 0 || turns.length > 0 || Boolean(pending) || review.guidance.length > 0;

  const setMessage = (change: (current: string) => string) =>
    assistant.update(key, current => ({ ...current, message: change(current.message) }));
  const update = (id: number, change: (turn: AITurn) => Partial<AITurn>) =>
    assistant.update(key, current => ({
      ...current,
      turns: current.turns.map(turn =>
        turn.id === id && turn.from === 'ai' ? ({ ...turn, ...change(turn) } as Turn) : turn
      ),
    }));

  const send = () => {
    const text = message.trim();
    const { part_of_speech } = draft;
    if (!text || busy || !draft.word || !part_of_speech) return;
    // Sending is a request to see the answer, wherever the admin had scrolled.
    following.current = true;
    void assistant.send(key, { word: draft.word, part_of_speech, asked: draft, text });
  };

  const undoRule = async (turnId: number, ruleId: string) => {
    try {
      await context.learnedRules?.forget(ruleId);
      update(turnId, () => ({ rule: { status: 'undone' } }));
      toast.success('Rule removed');
    } catch (error) {
      toast.error('The rule could not be removed', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const accept = async (turn: AITurn) => {
    const proposal = turn.proposal;
    if (!proposal || turn.status !== 'pending' || busy) return;
    // Stale means the draft no longer holds the value the AI saw. A field changed and then changed
    // back is not stale: the AI's change still applies to exactly what it was asked about. That holds
    // for every field the reply touches: one it only settles a question or keeps a note about is
    // stale too, so the question stays open and the note, which may now contradict the field, goes.
    const seen = Object.entries(proposal.seen) as [AICompletableField, string][];
    const stale = new Set([
      ...proposal.changes
        .filter(change => snapshot(draftValue(draft, change.field)) !== change.basis)
        .map(change => change.field),
      ...seen.filter(([field, basis]) => snapshot(draftValue(draft, field)) !== basis).map(([field]) => field),
    ]);
    const fresh = proposal.changes.filter(change => !stale.has(change.field));
    const asked = new Set(questions.map(question => question.field));
    const values = Object.fromEntries(fresh.map(change => [change.field, change.value]));
    const closed = [...new Set([...proposal.answered, ...fresh.map(change => change.field)])].filter(
      field => asked.has(field) && !stale.has(field)
    );
    const kept = context.acceptReply({
      changes: values,
      closed,
      // A note about a field skipped as stale goes too: it describes a value the admin has since replaced.
      notes: proposal.remember.filter(note => !note.field || !stale.has(note.field)),
      source: proposal.prompt,
    });
    // The receipt reports what landed, not what was proposed.
    update(turn.id, () => ({
      status: 'accepted',
      skipped: [...stale],
      applied: { values, notes: kept.map(note => note.note), closed },
    }));
  };

  /**
   * Saves the suggested rule for all words, only on the admin's own click and whatever became of the
   * reply. A second click while it saves does nothing, and the route never stores the same rule twice.
   */
  const saveRule = async (turn: AITurn) => {
    const instruction = turn.proposal?.rule;
    const learned = context.learnedRules;
    if (!instruction || !learned || savingRules.current.has(turn.id)) return;
    if (turn.rule.status === 'saving' || turn.rule.status === 'saved' || turn.rule.status === 'known') return;
    savingRules.current.add(turn.id);
    update(turn.id, () => ({ rule: { status: 'saving' } }));
    try {
      const { rule, added } = await learned.learn({
        instruction,
        learnedFrom: { word, message: turn.proposal!.prompt },
      });
      update(turn.id, () => ({ rule: added ? { status: 'saved', id: rule.id } : { status: 'known' } }));
      if (added) {
        toast.success('Saved as a rule for all words', {
          description: rule.instruction,
          action: { label: 'Undo', onClick: () => void undoRule(turn.id, rule.id) },
        });
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Try again later.';
      update(turn.id, () => ({ rule: { status: 'failed', message: description } }));
      toast.warning('The rule for all words was not saved', { description });
    } finally {
      savingRules.current.delete(turn.id);
    }
  };

  /** The field differs from its value when the AI asked: as saved, or as autocomplete left it. */
  const changedByHand = (field: AICompletableField) =>
    !sameWordValue(
      draftValue(draft, field),
      field in chat.basis ? chat.basis[field] : draftValue(context.saved, field)
    );

  const close = (question: VocabularyAIUncertainty, note: string, event: string) => {
    if (busy) return;
    context.keep(question.field, note);
    const id = assistant.newTurnId();
    assistant.update(key, current => {
      const basis = { ...current.basis };
      delete basis[question.field];
      return { ...current, basis, turns: [...current.turns, { id, from: 'event', text: event }] };
    });
  };
  const asked = (question: VocabularyAIUncertainty) =>
    question.question ? `When asked “${question.question}”, an admin` : 'An admin';
  const keep = (question: VocabularyAIUncertainty) =>
    close(
      question,
      `${asked(question)} confirmed the current value.`,
      `You kept ${aiFieldLabel(question.field)} as it is.`
    );
  const done = (question: VocabularyAIUncertainty) =>
    close(question, `${asked(question)} set the value by hand.`, `You marked ${aiFieldLabel(question.field)} as done.`);

  const pick = (field: AICompletableField, answer: string) => {
    const line = `${aiFieldLabel(field)}: ${answer}`;
    setMessage(current => (current.trim() ? `${current.trimEnd()}\n${line}` : line));
    composer.current?.focus();
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/⌘+Enter is left to the editor's "Save and next".
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing)
      return;
    event.preventDefault();
    send();
  };

  const summary =
    questions.length > 0
      ? `I'm not sure about ${questions.length === 1 ? 'one thing' : `${questions.length} things`} in ${word}. Pick a suggested answer, or reply in your own words.`
      : null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
        <section
          aria-label="AI assistant"
          aria-hidden={open ? undefined : true}
          inert={!open}
          className={cn(
            'flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)]',
            SLIDE,
            questions.length > 0 ? 'border-amber-300' : 'border-violet-200',
            open ? 'pointer-events-auto' : 'translate-y-[calc(100%+1rem)] opacity-0'
          )}>
          <header className="flex items-center gap-2 border-b border-gray-100 py-1.5 pl-3 pr-1.5">
            <AIAvatar />
            <h3 className="flex-1 text-sm font-semibold text-gray-900">AI assistant</h3>
            {questions.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {plural(questions.length, 'question')}
              </span>
            )}
            <button
              type="button"
              aria-label="Dismiss the AI assistant"
              title="Dismiss (what you typed is kept)"
              onClick={() => assistant.setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900">
              <ChevronDown className="h-5 w-5" aria-hidden />
            </button>
          </header>

          {elsewhere && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-violet-100 bg-violet-50 px-3 py-1.5 text-xs text-violet-900">
              <span className="flex flex-1 items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Still answering about {elsewhere.word}…
              </span>
              <button
                type="button"
                className="font-medium underline-offset-2 hover:underline"
                aria-label={`Stop waiting for the answer about ${elsewhere.word}`}
                title={STOP_WAITING_HINT}
                onClick={() => assistant.stop(elsewhere.key)}>
                Stop waiting
              </button>
              <button
                type="button"
                className="font-medium underline-offset-2 hover:underline"
                aria-label={`Keep going with the answer about ${elsewhere.word}`}
                onClick={() => assistant.keepGoing(elsewhere.key)}>
                Keep going
              </button>
            </div>
          )}

          {hasSheet && (
            <div
              ref={sheet}
              onScroll={event => {
                const element = event.currentTarget;
                following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
              }}
              className="max-h-[min(55vh,30rem)] overflow-y-auto overscroll-contain">
              <ol aria-label="Conversation with the AI" aria-live="polite" className="space-y-3 px-4 py-3">
                {summary && (
                  <AIBubble>
                    <p>{summary}</p>
                  </AIBubble>
                )}
                {questions.length > 0 && (
                  <li className="space-y-2 pl-9">
                    {questions.map((question, index) => (
                      <QuestionCard
                        key={question.field}
                        number={index + 1}
                        question={question}
                        changed={changedByHand(question.field)}
                        onPick={answer => pick(question.field, answer)}
                        onKeep={() => keep(question)}
                        onDone={() => done(question)}
                      />
                    ))}
                    <p className="px-1 text-[11px] text-gray-500">Unanswered questions stay open.</p>
                  </li>
                )}
                {turns.map(turn => {
                  if (turn.from === 'event') {
                    return (
                      <li key={turn.id} className="pl-9 text-xs text-gray-500">
                        {turn.text}
                      </li>
                    );
                  }
                  if (turn.from === 'admin') {
                    return (
                      <li key={turn.id} className="flex justify-end">
                        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-gray-100 px-3 py-2 text-sm text-gray-900">
                          <span className="sr-only">You: </span>
                          {turn.text}
                        </p>
                      </li>
                    );
                  }
                  return (
                    <AIBubble key={turn.id}>
                      <p className="whitespace-pre-wrap">{turn.text}</p>
                      {turn.proposal && (
                        <ProposalView
                          turn={turn}
                          busy={busy}
                          onAccept={() => void accept(turn)}
                          onDiscard={() => update(turn.id, () => ({ status: 'discarded' }))}
                          onSaveRule={() => void saveRule(turn)}
                          onUndoRule={id => void undoRule(turn.id, id)}
                        />
                      )}
                    </AIBubble>
                  );
                })}
                {pending && (
                  <AIBubble>
                    <p className="flex items-center gap-2 text-gray-600">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      <span className="flex-1">Thinking…</span>
                      <button
                        type="button"
                        className="rounded px-1.5 text-xs font-medium text-gray-700 underline-offset-2 hover:underline"
                        title={STOP_WAITING_HINT}
                        onClick={() => assistant.stop(key)}>
                        Stop waiting
                      </button>
                    </p>
                  </AIBubble>
                )}
              </ol>
              <MemoryList word={word} />
            </div>
          )}

          <div className={cn('px-3 py-2.5', hasSheet && 'border-t border-gray-100 bg-gray-50/70')}>
            <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white py-1.5 pl-3 pr-1.5 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
              <Textarea
                ref={composer}
                id={composerId(context.anchorPrefix)}
                aria-label="Message to the AI"
                rows={Math.min(6, Math.max(1, message.split('\n').length))}
                value={message}
                maxLength={ADMIN_NOTE_MAX}
                disabled={disabled}
                placeholder={
                  questions.length > 0
                    ? 'Answer the AI, or tell it what else to fix…'
                    : `Tell the AI what to fix or explain in ${word}…`
                }
                onChange={event => {
                  const next = event.target.value;
                  setMessage(() => next);
                }}
                onKeyDown={onComposerKeyDown}
                className="min-h-0 resize-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                type="button"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg"
                aria-label="Send to the AI"
                disabled={busy || !message.trim()}
                onClick={send}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
            {message && (
              <p className="mt-1 px-1 text-[11px] text-gray-500">
                Enter to send, Shift+Enter for a new line. You’ll see every change before it reaches the word.
              </p>
            )}
          </div>
        </section>
      </div>

      <button
        type="button"
        aria-label={
          questions.length > 0
            ? `Show the AI assistant (${plural(questions.length, 'question')})`
            : 'Show the AI assistant'
        }
        aria-hidden={open ? true : undefined}
        inert={open}
        onClick={() => {
          assistant.setOpen(true);
          composer.current?.focus({ preventScroll: true });
        }}
        className={cn(
          'absolute bottom-4 right-4 z-20 inline-flex items-center gap-1.5 rounded-full border bg-white py-1.5 pl-2.5 pr-2 text-sm font-medium shadow-lg hover:bg-violet-50',
          SLIDE,
          questions.length > 0 ? 'border-amber-300 text-amber-900' : 'border-violet-200 text-violet-800',
          open ? 'pointer-events-none translate-y-3 scale-90 opacity-0' : 'translate-y-0 scale-100 opacity-100'
        )}>
        <Sparkles className="h-4 w-4" aria-hidden />
        AI
        {questions.length > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">
            {questions.length}
          </span>
        )}
        <ChevronUp className="h-4 w-4" aria-hidden />
      </button>
    </>
  );
}

/**
 * Wraps one field of the word editor so questions can link to it. A field the
 * AI asked about is outlined, with a link back to the question. Outside the
 * editor (or when AI is off) it renders the field unchanged.
 */
export function AIFieldReview({ field, children }: { field: string; children?: ReactNode }) {
  const context = useContext(AIReviewContext);
  if (!context || !isCompletable(field)) return children;
  const asked = context.review.uncertainties.some(item => item.field === field);
  const { anchorPrefix } = context;
  return (
    <div
      id={fieldAnchor(anchorPrefix, field)}
      className={cn('scroll-mt-4', asked && 'relative rounded-lg ring-2 ring-amber-300 ring-offset-4')}>
      {asked && (
        <button
          type="button"
          onClick={() => {
            // A dismissed assistant cannot take focus, so it comes back first.
            flushSync(() => context.assistant.setOpen(true));
            reveal(
              questionAnchor(anchorPrefix, field),
              () => document.getElementById(composerId(anchorPrefix)),
              'nearest'
            );
          }}
          aria-label={`AI question about ${aiFieldLabel(field)}`}
          className="absolute -top-3 right-2 z-[1] inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 shadow-sm hover:bg-amber-100">
          <CircleHelp className="h-3 w-3" aria-hidden />
          AI question
        </button>
      )}
      {children}
    </div>
  );
}
