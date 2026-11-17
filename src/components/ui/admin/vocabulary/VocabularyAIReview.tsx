'use client';

import { createContext, useContext, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUp, BookmarkCheck, CircleHelp, Lightbulb, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  ADMIN_NOTE_MAX,
  AI_CONVERSATION_HISTORY_LIMIT,
  AICompletableFieldSchema,
  type AICompletableField,
  type VocabularyAIChatTurn,
  type VocabularyAIMemory,
  type VocabularyAIReview,
  type VocabularyAIUncertainty,
} from '@/shared/types/vocabulary/ai-review';
import type { VocabularyWord } from '@/shared/types/vocabulary/schemas';
import type { LearnedAIRules } from '@/src/store/api/vocabularyAIGuidanceApi';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { useFirebaseAutocomplete } from '@/src/hooks/useFirebaseAutocomplete';
import { cn } from '@/src/lib/utils';
import { changedTableCells, sameWordValue, WORD_TABLE_FIELDS } from '@/src/utils/vocabulary/word-diff';
import { aiFieldLabel, WORD_FIELDS } from './wordFields';

/** An answer from the AI that the admin accepted, as the editor applies it. */
export interface AcceptedAIReply {
  /** New field values, keyed by field. */
  changes: Partial<Record<AICompletableField, unknown>>;
  /** Questions the answer settles. */
  closed: AICompletableField[];
  /** Facts to keep on the word for later AI requests. */
  notes: VocabularyAIMemory[];
}

/** What the word editor shares with the AI assistant and the field markers it renders. */
export interface AIReviewContextValue {
  /** Prefixes the element IDs that questions and fields link to. */
  anchorPrefix: string;
  review: VocabularyAIReview;
  /** The editor's current draft, including unsaved table edits; sent to the AI as context. */
  draft: Partial<VocabularyWord>;
  disabled: boolean;
  acceptReply: (reply: AcceptedAIReply) => void;
  /** Closes a question and keeps the field's value, remembering that an admin confirmed it. */
  keep: (field: AICompletableField, note: string) => void;
  removeNote: (id: string) => void;
  /** Saves the rules for all words that the AI learns; without it the AI's rules are shown but not kept. */
  learnedRules?: LearnedAIRules;
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
const snapshot = (value: unknown) => JSON.stringify(value ?? null);
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
function reveal(id: string, focus?: () => HTMLElement | null | undefined) {
  document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  focus?.()?.focus({ preventScroll: true });
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

interface ProposedChange {
  field: AICompletableField;
  value: unknown;
  /** The field's value when the admin asked, to notice an edit made since. */
  basis: string;
}

interface Proposal {
  changes: ProposedChange[];
  answered: AICompletableField[];
  remember: VocabularyAIMemory[];
  rule: string | null;
  /** The admin message the AI answered; a learned rule records it as its source. */
  prompt: string;
}

type RuleState =
  | { status: 'offered' }
  | { status: 'declined' }
  | { status: 'saving' }
  | { status: 'saved'; id: string }
  | { status: 'known' }
  | { status: 'undone' }
  | { status: 'failed'; message: string };

type Turn =
  | { id: number; from: 'admin'; text: string }
  | { id: number; from: 'event'; text: string }
  | {
      id: number;
      from: 'ai';
      text: string;
      proposal: Proposal | null;
      /** `answer` is a reply with nothing to accept, such as an explanation or a question back. */
      status: 'answer' | 'pending' | 'accepted' | 'discarded' | 'replaced';
      rule: RuleState;
      /** Changes left out on accepting, because the admin had edited those fields since asking. */
      skipped?: AICompletableField[];
    };
type AITurn = Extract<Turn, { from: 'ai' }>;

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
  onPick,
  onKeep,
}: {
  number: number;
  question: VocabularyAIUncertainty;
  onPick: (answer: string) => void;
  onKeep: () => void;
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
              onClick={() => reveal(fieldAnchor(context.anchorPrefix, field))}
              aria-label={`Show the ${label} field`}>
              {label}
            </button>
          ) : (
            label
          )}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={context.disabled}
          onClick={onKeep}>
          Keep as is
        </Button>
      </div>
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

function ProposalView({
  turn,
  busy,
  onAccept,
  onDiscard,
  onDeclineRule,
  onUndoRule,
}: {
  turn: AITurn;
  busy: boolean;
  onAccept: () => void;
  onDiscard: () => void;
  onDeclineRule: () => void;
  onUndoRule: (id: string) => void;
}) {
  const context = useContext(AIReviewContext)!;
  const proposal = turn.proposal!;
  const pending = turn.status === 'pending';
  const word = context.draft.word ?? 'this word';
  const stale = (change: ProposedChange) => snapshot(draftValue(context.draft, change.field)) !== change.basis;
  const fresh = proposal.changes.filter(change => !stale(change));
  const savedRuleId = turn.rule.status === 'saved' ? turn.rule.id : null;
  const acceptLabel = fresh.length ? `Accept ${fresh.length === 1 ? 'change' : `${fresh.length} changes`}` : 'Accept';

  return (
    <div className="space-y-2">
      {proposal.changes.length > 0 && (
        <ul
          aria-label="Proposed changes"
          className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
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
                    You edited {aiFieldLabel(change.field)} after asking, so this change will not be applied. Ask again
                    to update it.
                  </p>
                )}
                {turn.skipped?.includes(change.field) && (
                  <p className="text-xs text-amber-800">Not applied, because you had edited this field.</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {proposal.remember.length > 0 && (
        <div className="flex gap-2 text-xs text-gray-700">
          <BookmarkCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
          <div>
            <p className="font-medium">
              {turn.status === 'accepted' ? `Remembered for ${word}:` : `I'll remember for ${word}:`}
            </p>
            <ul className="list-disc pl-4">
              {proposal.remember.map(item => (
                <li key={item.note}>{item.note}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {proposal.rule && turn.rule.status !== 'declined' && turn.rule.status !== 'undone' && (
        <div className="flex gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs text-gray-700">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p>
              <span className="font-medium">
                {savedRuleId || turn.rule.status === 'known' ? 'Rule for all words:' : 'New rule for all words:'}
              </span>{' '}
              “{proposal.rule}”
            </p>
            {pending && !context.learnedRules && <p className="text-gray-500">Rules can’t be saved from this page.</p>}
            {turn.rule.status === 'saving' && <p className="text-gray-500">Saving the rule…</p>}
            {turn.rule.status === 'known' && <p className="text-gray-500">The AI already follows this rule.</p>}
            {turn.rule.status === 'failed' && <p className="text-amber-800">Not saved: {turn.rule.message}</p>}
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
          </div>
          {pending && context.learnedRules && (
            <button
              type="button"
              onClick={onDeclineRule}
              className="h-6 shrink-0 rounded px-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
              Don’t save
            </button>
          )}
        </div>
      )}
      {pending && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" size="sm" onClick={onAccept} disabled={busy}>
            {acceptLabel}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
            Discard
          </Button>
        </div>
      )}
      {turn.status === 'accepted' && <p className="text-xs font-medium text-green-700">Accepted</p>}
      {turn.status === 'discarded' && <p className="text-xs text-gray-500">Discarded</p>}
      {turn.status === 'replaced' && <p className="text-xs text-gray-500">Replaced by a newer answer</p>}
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
      <ul aria-label={`What the AI remembers about ${word}`} className="max-h-40 space-y-1 overflow-auto">
        {notes.map(note => (
          <li key={note.id} className="flex items-start gap-2 text-xs text-gray-700">
            <span className="min-w-0 flex-1 whitespace-pre-wrap">
              {note.field && <span className="font-medium">{aiFieldLabel(note.field)}: </span>}
              {note.instruction}
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

/**
 * The AI assistant at the top of the word editor: what the AI is unsure about,
 * as questions with suggested answers, and a conversation in which the admin
 * answers them or asks for any other fix. The AI answers in words and lists the
 * changes it proposes; nothing reaches the draft until the admin accepts it.
 * Facts the admin states are remembered on the word, and a principle that
 * applies to every word becomes a rule for all words.
 */
export function AIReviewPanel() {
  const context = useContext(AIReviewContext);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(0);
  const { requestAutocomplete, isLoading } = useFirebaseAutocomplete({
    onError: error => toast.error('The AI could not answer', { description: error }),
  });
  if (!context) return null;

  const { review, draft, disabled } = context;
  const word = draft.word?.trim() || 'this word';
  const questions = review.uncertainties;
  const busy = disabled || isLoading;
  const quiet = questions.length === 0 && turns.length === 0;
  const newId = () => ++nextId.current;
  const update = (id: number, change: (turn: AITurn) => Partial<AITurn>) =>
    setTurns(previous =>
      previous.map(turn => (turn.id === id && turn.from === 'ai' ? ({ ...turn, ...change(turn) } as Turn) : turn))
    );

  const send = async () => {
    const text = message.trim();
    const { part_of_speech } = draft;
    if (!text || busy || !draft.word || !part_of_speech) return;
    const history: VocabularyAIChatTurn[] = turns
      .flatMap(turn => (turn.from === 'event' ? [] : [{ from: turn.from, text: turn.text }]))
      .slice(-AI_CONVERSATION_HISTORY_LIMIT);
    const asked = draft;
    const sent: Turn = { id: newId(), from: 'admin', text };
    setTurns(previous => [...previous, sent]);
    setMessage('');

    const result = await requestAutocomplete({
      word: draft.word,
      part_of_speech,
      existingData: asked,
      conversation: { message: text, history },
    });
    if (!result?.reply || !result.data) {
      // Nothing was answered: the message goes back into the box to send again.
      setTurns(previous => previous.filter(turn => turn.id !== sent.id));
      setMessage(current => current || text);
      return;
    }
    const { reply } = result;
    const changes = Object.entries(result.data).flatMap(([field, value]) =>
      isCompletable(field) && !sameWordValue(draftValue(asked, field), value)
        ? [{ field, value, basis: snapshot(draftValue(asked, field)) }]
        : []
    );
    const proposal: Proposal = {
      changes,
      answered: reply.answered,
      remember: reply.remember,
      rule: reply.rule,
      prompt: text,
    };
    const actionable = changes.length > 0 || reply.answered.length > 0 || reply.remember.length > 0 || !!reply.rule;
    setTurns(previous => [
      // A newer answer replaces one the admin had not accepted yet.
      ...previous.map(turn =>
        turn.from === 'ai' && turn.status === 'pending' ? { ...turn, status: 'replaced' as const } : turn
      ),
      {
        id: newId(),
        from: 'ai',
        text: reply.message,
        proposal: actionable ? proposal : null,
        status: actionable ? 'pending' : 'answer',
        rule: { status: 'offered' },
      },
    ]);
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
    const stale = new Set(
      proposal.changes
        .filter(change => snapshot(draftValue(draft, change.field)) !== change.basis)
        .map(change => change.field)
    );
    const fresh = proposal.changes.filter(change => !stale.has(change.field));
    const open = new Set(questions.map(question => question.field));
    context.acceptReply({
      changes: Object.fromEntries(fresh.map(change => [change.field, change.value])),
      closed: [...new Set([...proposal.answered, ...fresh.map(change => change.field)])].filter(
        field => open.has(field) && !stale.has(field)
      ),
      notes: proposal.remember.filter(note => !note.field || !stale.has(note.field)),
    });
    const learnRule = proposal.rule && turn.rule.status === 'offered' && context.learnedRules;
    update(turn.id, () => ({
      status: 'accepted',
      skipped: [...stale],
      ...(learnRule ? { rule: { status: 'saving' } } : {}),
    }));
    if (!learnRule || !proposal.rule) return;
    try {
      const { rule, added } = await learnRule.learn({
        instruction: proposal.rule,
        learnedFrom: { word, message: proposal.prompt },
      });
      update(turn.id, () => ({ rule: added ? { status: 'saved', id: rule.id } : { status: 'known' } }));
      if (added) {
        toast.success('The AI learned a rule for all words', {
          description: rule.instruction,
          action: { label: 'Undo', onClick: () => void undoRule(turn.id, rule.id) },
        });
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Try again later.';
      update(turn.id, () => ({ rule: { status: 'failed', message: description } }));
      toast.warning('The rule for all words was not saved', { description });
    }
  };

  const keep = (question: VocabularyAIUncertainty) => {
    if (busy) return;
    context.keep(
      question.field,
      question.question
        ? `When asked “${question.question}”, an admin confirmed the current value.`
        : 'An admin confirmed the current value.'
    );
    setTurns(previous => [
      ...previous,
      { id: newId(), from: 'event', text: `You kept ${aiFieldLabel(question.field)} as it is.` },
    ]);
  };

  const pick = (field: AICompletableField, answer: string) => {
    const line = `${aiFieldLabel(field)}: ${answer}`;
    setMessage(current => (current.trim() ? `${current.trimEnd()}\n${line}` : line));
    composer.current?.focus();
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  };

  const summary =
    questions.length > 0
      ? `I'm not sure about ${questions.length === 1 ? 'one thing' : `${questions.length} things`} in ${word}. Pick a suggested answer, or reply in your own words.`
      : null;

  return (
    <section
      aria-label="AI assistant"
      className={cn(
        'overflow-hidden rounded-xl border bg-white shadow-sm',
        questions.length > 0 ? 'border-amber-300' : 'border-violet-200',
        quiet && 'focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100'
      )}>
      {!quiet && (
        <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
          <AIAvatar />
          <h3 className="flex-1 text-sm font-semibold text-gray-900">AI assistant</h3>
          {questions.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              {plural(questions.length, 'question')}
            </span>
          )}
        </header>
      )}

      {!quiet && (
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
                  onPick={answer => pick(question.field, answer)}
                  onKeep={() => keep(question)}
                />
              ))}
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
                    onDeclineRule={() => update(turn.id, () => ({ rule: { status: 'declined' } }))}
                    onUndoRule={id => void undoRule(turn.id, id)}
                  />
                )}
              </AIBubble>
            );
          })}
          {isLoading && (
            <AIBubble>
              <p className="flex items-center gap-2 text-gray-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Thinking…
              </p>
            </AIBubble>
          )}
        </ol>
      )}

      <div className={cn(quiet ? 'px-1.5 py-1' : 'border-t border-gray-100 bg-gray-50/70 px-3 py-2.5')}>
        <div
          className={cn(
            'flex items-end gap-2 rounded-xl bg-white py-1.5 pl-3 pr-1.5',
            !quiet &&
              'border border-gray-200 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100'
          )}>
          {quiet && <Sparkles className="mb-2.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden />}
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
                : `Ask the AI to fix or explain something in ${word}…`
            }
            onChange={event => setMessage(event.target.value)}
            onKeyDown={onComposerKeyDown}
            className="min-h-0 resize-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg"
            aria-label="Send to the AI"
            disabled={busy || !message.trim()}
            onClick={() => void send()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
        {(!quiet || message) && (
          <p className="mt-1 px-1 text-[11px] text-gray-500">
            Enter to send, Shift+Enter for a new line. You’ll see every change before it reaches the word.
          </p>
        )}
      </div>

      <MemoryList word={word} />
    </section>
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
          onClick={() =>
            reveal(questionAnchor(anchorPrefix, field), () => document.getElementById(composerId(anchorPrefix)))
          }
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
