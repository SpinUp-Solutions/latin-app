'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AI_CONVERSATION_HISTORY_LIMIT,
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
  /** Stops waiting for a reply: the message goes back into the box, and a late answer is ignored. */
  stop: (key: string) => void;
  /** Replies still running for other words that the admin has not chosen to let finish. */
  runningElsewhere: (key: string) => { key: string; word: string }[];
  keepGoing: (key: string) => void;
  /** Which word's chat is on screen, so an answer for another word is announced. */
  show: (key: string | null) => void;
}

const OPEN_KEY = 'vocabulary-ai-assistant-open';
const isCompletable = (field: string): field is AICompletableField => AICompletableFieldSchema.safeParse(field).success;
const draftValue = (draft: Partial<VocabularyWord>, field: AICompletableField): unknown =>
  (draft as Record<string, unknown>)[field];
export const snapshotValue = (value: unknown) => JSON.stringify(value ?? null);

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
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

  const send = async (key: string, { word, part_of_speech, asked, text }: SendToAI) => {
    const chat = chats[key] ?? EMPTY_CHAT;
    if (chat.pending) return;
    const history: VocabularyAIChatTurn[] = chat.turns
      .flatMap(turn => (turn.from === 'event' ? [] : [{ from: turn.from, text: turn.text }]))
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
    const proposal: Proposal = {
      changes,
      answered: reply.answered,
      remember: reply.remember,
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
    update(key, current => (current.pending ? withdraw(current, current.pending) : current));
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
