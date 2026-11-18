'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AI_CONVERSATION_HISTORY_LIMIT,
  AI_REPLY_MAX,
  AICompletableFieldSchema,
  type AICompletableField,
  type VocabularyAIChatTurn,
  type VocabularyAIMemory,
} from '@/shared/types/vocabulary/ai-review';
import type { VocabularyWord } from '@/shared/types/vocabulary/schemas';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import { callAutocompleteWord } from '@/src/hooks/useFirebaseAutocomplete';
import { sameWordValue } from '@/src/utils/vocabulary/word-diff';

export interface ProposedChange {
  field: AICompletableField;
  value: unknown;
  /** The field's value when the admin asked, to notice an edit made since. */
  basis: string;
}

export interface Proposal {
  changes: ProposedChange[];
  answered: AICompletableField[];
  remember: VocabularyAIMemory[];
  /**
   * The value the AI saw for each field it settles a question about or keeps a note on without changing,
   * so Accept notices an edit made since, as it does for a proposed change.
   */
  seen: Partial<Record<AICompletableField, string>>;
  /** The headword the AI answered about. A reply is about that word only. */
  headword: string;
  rule: string | null;
  /** The admin message the AI answered; a learned rule records it as its source. */
  prompt: string;
}

/** A rule for all words the AI suggested: saved only when the admin asks, apart from accepting the reply. */
export type RuleState =
  | { status: 'offered' }
  | { status: 'saving' }
  | { status: 'saved'; id: string }
  | { status: 'known' }
  | { status: 'undone' }
  | { status: 'failed'; message: string };

export type Turn =
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
      /** What accepting actually put in the draft: the values, the notes that fit and the questions closed. */
      applied?: {
        values: Partial<Record<AICompletableField, unknown>>;
        notes: string[];
        closed: AICompletableField[];
      };
    };
export type AITurn = Extract<Turn, { from: 'ai' }>;

/** A message the AI is still answering. */
export interface PendingReply {
  request: number;
  /** The admin's message, taken back out of the conversation if the admin stops the reply. */
  turnId: number;
  word: string;
  text: string;
  /** The admin chose to let it finish while working on another word. */
  keepGoing: boolean;
}

/** One word's conversation with the AI; kept while the page is open, so switching words loses nothing. */
export interface AIChat {
  turns: Turn[];
  /** What the admin has typed but not sent. */
  message: string;
  /** Field values when the AI asked about them during this visit, to notice an edit by hand. */
  basis: Partial<Record<AICompletableField, unknown>>;
  pending: PendingReply | null;
}

const EMPTY_CHAT: AIChat = { turns: [], message: '', basis: {}, pending: null };

export interface SendToAI {
  word: string;
  part_of_speech: PartOfSpeech;
  /** The draft when the admin asked; changes are measured against it. */
  asked: Partial<VocabularyWord>;
  text: string;
}

export interface AIAssistantStore {
  /** Shown, or dismissed to its tab. */
  open: boolean;
  setOpen: (open: boolean) => void;
  chat: (key: string) => AIChat;
  update: (key: string, change: (chat: AIChat) => AIChat) => void;
  newTurnId: () => number;
  send: (key: string, request: SendToAI) => Promise<void>;
  /**
   * Stops waiting for a reply: the message goes back into the box, and a late answer is ignored. The
   * Function cannot be cancelled from here, so the AI may still finish, and that call is still charged.
   */
  stop: (key: string) => void;
  /** Replies still running for other words that the admin has not chosen to let finish. */
  runningElsewhere: (key: string) => { key: string; word: string }[];
  keepGoing: (key: string) => void;
  /** Which word's chat is on screen, so an answer for another word is announced. */
  show: (key: string | null) => void;
}

const OPEN_KEY = 'vocabulary-ai-assistant-open';
/** What "Stop waiting" does, said on the button and again in the conversation once it has. */
export const STOP_WAITING_HINT = 'This stops waiting for the answer. Generation may continue and still incur charges.';
const STOPPED_NOTE = 'You stopped waiting for this answer. Generation may continue and still incur charges.';
const isCompletable = (field: string): field is AICompletableField => AICompletableFieldSchema.safeParse(field).success;
export const draftValue = (draft: Partial<VocabularyWord>, field: AICompletableField): unknown =>
  (draft as Record<string, unknown>)[field];

/*
 * Two equality rules, on purpose.
 * - Edited since asking is exact (`snapshotValue`): the AI answered about the exact value it saw, so a
 *   field whose value now differs, even '' where it saw null, makes that part of its answer stale. Only
 *   the end state counts: an edit reverted is no edit, and a missing field reads as null.
 * - Shows the same is loose (`sameWordValue`, which treats null, '', and empty lists and tables alike):
 *   it decides whether a reply proposes a change at all, and whether an accepted value is still the one in
 *   the draft or the saved word, where '' against null is only the editor's noise.
 */
export const snapshotValue = (value: unknown) => JSON.stringify(value ?? null);

/**
 * A copy of the draft to send to the AI and to measure its answer against. The form's values share
 * their lists with the form, which edits them in place, so without a copy a definition typed while the
 * AI answers would already be in "what the AI saw", and Accept would overwrite it.
 */
export const copyDraft = (draft: Partial<VocabularyWord>): Partial<VocabularyWord> => JSON.parse(JSON.stringify(draft));

/**
 * The headword of a draft, as the AI is asked about it. An answer about rosa does not apply once the
 * admin has renamed the word to via, even if the document is the same.
 */
export const headwordOf = (draft: Partial<VocabularyWord>) => (draft.word ?? '').trim();

/**
 * The fields of a reply the admin has edited since asking: those it changes, and those it only settles a
 * question or keeps a note about. A field changed and then changed back is not stale.
 */
export function staleFields(proposal: Proposal, draft: Partial<VocabularyWord>): Set<AICompletableField> {
  const seen: [AICompletableField, string][] = [
    ...proposal.changes.map(change => [change.field, change.basis] as [AICompletableField, string]),
    ...(Object.entries(proposal.seen) as [AICompletableField, string][]),
  ];
  return new Set(
    seen.filter(([field, basis]) => snapshotValue(draftValue(draft, field)) !== basis).map(([field]) => field)
  );
}

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** What the admin did with an earlier answer, so a follow-up is read against what actually applied. */
function outcomeTag(turn: AITurn): string | null {
  if (!turn.proposal) return null;
  switch (turn.status) {
    case 'accepted':
      return turn.skipped?.length ? `[partly applied: ${turn.skipped.join(', ')} skipped]` : '[accepted]';
    case 'discarded':
      return '[discarded]';
    case 'replaced':
      return '[replaced by a newer answer]';
    case 'pending':
      return '[not accepted yet]';
    default:
      return null;
  }
}

function historyText(turn: Exclude<Turn, { from: 'event' }>): string {
  if (turn.from === 'admin') return turn.text;
  const tag = outcomeTag(turn);
  if (!tag) return turn.text;
  const room = AI_REPLY_MAX - tag.length - 1;
  const text = turn.text.length > room ? `${turn.text.slice(0, room - 1)}…` : turn.text;
  return `${text} ${tag}`;
}

/** Puts a message the AI did not answer back where the admin typed it. */
function withdraw(chat: AIChat, pending: PendingReply): AIChat {
  return {
    ...chat,
    turns: chat.turns.filter(turn => turn.id !== pending.turnId),
    message: chat.message || pending.text,
    pending: null,
  };
}

function useAIAssistantState(): AIAssistantStore {
  const [open, setOpenState] = useState(readOpen);
  const [chats, setChats] = useState<Record<string, AIChat>>({});
  const turnIds = useRef(0);
  const requests = useRef(0);
  /** The request each chat is waiting for; a stopped or abandoned request is no longer here. */
  const active = useRef(new Map<string, number>());
  const visible = useRef<string | null>(null);

  useEffect(() => {
    const waiting = active.current;
    return () => waiting.clear();
  }, []);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    try {
      window.localStorage.setItem(OPEN_KEY, String(next));
    } catch {
      // Storage can be unavailable; the choice then lasts while the page is open.
    }
  };

  const update = (key: string, change: (chat: AIChat) => AIChat) =>
    setChats(previous => ({ ...previous, [key]: change(previous[key] ?? EMPTY_CHAT) }));

  const newTurnId = () => ++turnIds.current;

  const send = async (key: string, { word, part_of_speech, asked: draft, text }: SendToAI) => {
    const asked = copyDraft(draft);
    const chat = chats[key] ?? EMPTY_CHAT;
    // `chats` is this render's copy: a second send before the next render would still see no pending
    // reply, so the request in flight is checked too. Otherwise both are billed and one answer is lost.
    if (chat.pending || active.current.has(key)) return;
    const history: VocabularyAIChatTurn[] = chat.turns
      .flatMap(turn => (turn.from === 'event' ? [] : [{ from: turn.from, text: historyText(turn) }]))
      .slice(-AI_CONVERSATION_HISTORY_LIMIT);
    const pending: PendingReply = { request: ++requests.current, turnId: newTurnId(), word, text, keepGoing: false };
    active.current.set(key, pending.request);
    update(key, current => ({
      ...current,
      message: '',
      turns: [...current.turns, { id: pending.turnId, from: 'admin', text }],
      pending,
    }));

    const outcome = await callAutocompleteWord({
      word,
      part_of_speech,
      existingData: asked,
      conversation: { message: text, history },
    });
    if (active.current.get(key) !== pending.request) return;
    active.current.delete(key);

    const reply = outcome.ok ? outcome.result.reply : undefined;
    const data = outcome.ok ? outcome.result.data : undefined;
    if (!reply || !data) {
      toast.error('The AI could not answer', {
        description: outcome.ok ? 'It sent no reply. Try again.' : outcome.error,
      });
      update(key, current => withdraw(current, pending));
      return;
    }
    const changes = Object.entries(data).flatMap(([field, value]) =>
      isCompletable(field) && !sameWordValue(draftValue(asked, field), value)
        ? [{ field, value, basis: snapshotValue(draftValue(asked, field)) }]
        : []
    );
    const changed = new Set(changes.map(change => change.field));
    const touched = [...reply.answered, ...reply.remember.flatMap(note => (note.field ? [note.field] : []))];
    const seen = Object.fromEntries(
      touched.filter(field => !changed.has(field)).map(field => [field, snapshotValue(draftValue(asked, field))])
    ) as Proposal['seen'];
    const proposal: Proposal = {
      changes,
      answered: reply.answered,
      remember: reply.remember,
      seen,
      headword: headwordOf(asked),
      rule: reply.rule,
      prompt: text,
    };
    // A suggested rule is not something to accept: the admin saves it on its own, or not at all.
    const actionable = changes.length > 0 || reply.answered.length > 0 || reply.remember.length > 0;
    update(key, current => ({
      ...current,
      pending: null,
      turns: [
        // A newer answer replaces one the admin had not accepted yet.
        ...current.turns.map(turn =>
          turn.from === 'ai' && turn.status === 'pending' ? { ...turn, status: 'replaced' as const } : turn
        ),
        {
          id: newTurnId(),
          from: 'ai',
          text: reply.message,
          proposal: actionable || reply.rule ? proposal : null,
          status: actionable ? 'pending' : 'answer',
          rule: { status: 'offered' },
        },
      ],
    }));
    if (visible.current !== key) {
      toast.info(`The AI answered about ${word}`, { description: `Open ${word} to see its answer.` });
    }
  };

  const stop = (key: string) => {
    const pending = chats[key]?.pending;
    if (!pending) return;
    active.current.delete(key);
    const id = newTurnId();
    update(key, current => {
      if (!current.pending) return current;
      const withdrawn = withdraw(current, current.pending);
      return { ...withdrawn, turns: [...withdrawn.turns, { id, from: 'event', text: STOPPED_NOTE }] };
    });
  };

  const runningElsewhere = (key: string) =>
    Object.entries(chats).flatMap(([other, chat]) =>
      other !== key && chat.pending && !chat.pending.keepGoing ? [{ key: other, word: chat.pending.word }] : []
    );

  const keepGoing = (key: string) =>
    update(key, current =>
      current.pending ? { ...current, pending: { ...current.pending, keepGoing: true } } : current
    );

  const show = (key: string | null) => {
    visible.current = key;
  };

  return {
    open,
    setOpen,
    chat: key => chats[key] ?? EMPTY_CHAT,
    update,
    newTurnId,
    send,
    stop,
    runningElsewhere,
    keepGoing,
    show,
  };
}

const AIAssistantContext = createContext<AIAssistantStore | null>(null);

/** Keeps each word's conversation with the AI, and replies still running, while the admin moves between words. */
export function AIAssistantProvider({ children }: { children: ReactNode }) {
  const store = useAIAssistantState();
  return <AIAssistantContext.Provider value={store}>{children}</AIAssistantContext.Provider>;
}

/** The page's assistant store, or one for this editor alone when the page provides none. */
export function useAIAssistant(): AIAssistantStore {
  const local = useAIAssistantState();
  return useContext(AIAssistantContext) ?? local;
}
