import { createHash } from 'node:crypto';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  USERS_COLLECTION,
  VOCABULARY_WORD_UPDATE_REQUEST_NOTES_SUBCOLLECTION,
  VOCABULARY_WORD_UPDATE_REQUESTS_COLLECTION,
  VOCABULARY_WORDS_COLLECTION,
} from '@/shared/constants/firestore';
import { VocabularyWordSchema, type VocabularyWord } from '@/shared/types/vocabulary/schemas';
import { PartOfSpeechSchema } from '@/shared/types/vocabulary/schemas/enums';
import {
  VOCABULARY_WORD_UPDATE_NOTE_MAX_LENGTH,
  VOCABULARY_WORD_UPDATE_REQUEST_STATUSES,
  type VocabularyWordUpdateNote,
  type VocabularyWordUpdateNoteList,
  type VocabularyWordUpdateRequest,
  type VocabularyWordUpdateRequestDetail,
  type VocabularyWordUpdateRequestList,
  type VocabularyWordUpdateRequestStatus,
  type VocabularyWordUpdateRequestSummary,
  type WordChangeSummary,
} from '@/shared/types/vocabulary/update-requests';
import { RequestError } from '@/src/lib/domain-error';
import { estimateFirestoreDocumentBytes } from '@/src/lib/tests/firestore-size';
import { prepareVocabularyContentRevisionBump } from '@/src/lib/vocabulary-pools/content-revision.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { firestoreVersionFingerprint } from '@/src/lib/vocabulary/word-deletion.server';
import { stripMacrons } from '@/src/utils/exercises/helpers';
import { changedWordFields, summarizeWordChanges } from '@/src/utils/vocabulary/word-diff';

/** The review list loads at most this many requests of one status. */
export const WORD_UPDATE_REQUEST_LIST_LIMIT = 500;
/** An update's notes load the newest this many. */
export const WORD_UPDATE_NOTE_LIST_LIMIT = 200;
/** A request holds up to three copies of a word (base, proposal, replaced), so it stays well below 1 MiB. */
const MAX_REQUEST_BYTES = 900 * 1024;

type Plain = Record<string, unknown>;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const updateRequests = (db: Firestore) => db.collection(VOCABULARY_WORD_UPDATE_REQUESTS_COLLECTION);
const words = (db: Firestore) => db.collection(VOCABULARY_WORDS_COLLECTION);

const isTimestampLike = (value: unknown): value is { toDate: () => Date } =>
  !!value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function';

/** Firestore timestamps and dates as ISO strings, so the value can be sent as JSON or compared. */
const toJson = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (isTimestampLike(value)) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJson(entry)]));
  }
  return value;
};

const withoutUndefined = (value: Plain): Plain =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

/** A stored word's authored content: timestamps as ISO strings and internal `_` fields dropped. */
const authoredWord = (data: Plain): Plain =>
  Object.fromEntries(Object.entries(toJson(data) as Plain).filter(([key]) => !key.startsWith('_')));

/** The fields the word schema knows for a part of speech; anything else on a live word is kept as it is. */
const schemaFields = (partOfSpeech: unknown): Set<string> => {
  const schema = VocabularyWordSchema.options.find(option => option.shape.part_of_speech.value === partOfSpeech);
  return new Set(schema ? Object.keys(schema.shape) : []);
};

const requestNotFound = () =>
  new RequestError(404, 'VOCABULARY_UPDATE_REQUEST_NOT_FOUND', 'This update request no longer exists');
const requestNotPending = () =>
  new RequestError(409, 'VOCABULARY_UPDATE_NOT_PENDING', 'This update has already been approved or dismissed');
const requestChanged = () =>
  new RequestError(409, 'VOCABULARY_UPDATE_CHANGED', 'This update changed after you opened it. Review it again.');

type LiveWord = { data: Plain; authored: Plain; fingerprint: string };

function readLiveWord(snapshot: DocumentSnapshot): LiveWord {
  if (!snapshot.exists) throw new RequestError(404, 'WORD_NOT_FOUND', 'The word no longer exists');
  const data = snapshot.data() as Plain;
  if (data._deletionPending) {
    throw new RequestError(409, 'WORD_DELETE_IN_PROGRESS', 'Word deletion is already in progress');
  }
  return { data, authored: authoredWord(data), fingerprint: firestoreVersionFingerprint(snapshot.updateTime) };
}

/**
 * Validates a proposal as a replacement for the live word. The headword's sort
 * key is derived as the word editor does; the random index and timestamps are
 * the live word's, since an update never changes them.
 */
function validateProposal(proposed: Plain, live: Plain): { proposedWord: VocabularyWord; changes: WordChangeSummary } {
  if (proposed.part_of_speech !== live.part_of_speech) {
    throw new RequestError(400, 'VOCABULARY_UPDATE_PART_OF_SPEECH', 'An update cannot change the part of speech');
  }
  const now = new Date().toISOString();
  const result = VocabularyWordSchema.safeParse({
    ...proposed,
    sort_key: typeof proposed.word === 'string' ? stripMacrons(proposed.word) : proposed.word,
    random_index: typeof live.random_index === 'number' ? live.random_index : Math.random(),
    createdAt: typeof live.createdAt === 'string' ? live.createdAt : now,
    updatedAt: typeof live.updatedAt === 'string' ? live.updatedAt : now,
  });
  if (!result.success) {
    const issues = result.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
    throw new RequestError(400, 'INVALID_WORD_DATA', `Invalid word data: ${issues}`);
  }
  const changes = summarizeWordChanges(live, result.data);
  if (changes.fields.length === 0 && changes.tableCells === 0) {
    throw new RequestError(400, 'VOCABULARY_UPDATE_NO_CHANGES', 'The proposal is the same as the current word');
  }
  return { proposedWord: result.data, changes };
}

const summaryOf = (proposedWord: VocabularyWord, changes: WordChangeSummary) => ({
  word: proposedWord.word,
  part_of_speech: proposedWord.part_of_speech,
  translation: proposedWord.translation,
  changes,
});

function assertRequestSize(document: Plain) {
  if (estimateFirestoreDocumentBytes(document) > MAX_REQUEST_BYTES) {
    throw new RequestError(413, 'VOCABULARY_UPDATE_TOO_LARGE', 'This word is too large to stage as an update');
  }
}

const NullableString = z.string().nullable().optional();
const StoredRequestSchema = z.object({
  status: z.enum(VOCABULARY_WORD_UPDATE_REQUEST_STATUSES),
  wordId: z.string().min(1),
  summary: z.object({
    word: z.string(),
    part_of_speech: PartOfSpeechSchema,
    translation: z.string(),
    changes: z.object({ fields: z.array(z.string()), tableCells: z.number() }),
  }),
  reason: NullableString,
  source: NullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
});
const StoredDetailSchema = StoredRequestSchema.extend({
  proposedWord: z.record(z.string(), z.unknown()),
  baseWord: z.record(z.string(), z.unknown()),
  baseFingerprint: z.string(),
  createdBy: z.string(),
  approvedBy: NullableString,
  approvedAt: NullableString,
  appliedFromWord: z.record(z.string(), z.unknown()).nullable().optional(),
  dismissedBy: NullableString,
  dismissedReason: NullableString,
});

const invalidStoredRequest = () =>
  new RequestError(409, 'INVALID_VOCABULARY_UPDATE_REQUEST', 'This update request is stored in an invalid format');

function toSummary(id: string, data: z.infer<typeof StoredRequestSchema>): VocabularyWordUpdateRequestSummary {
  return {
    id,
    status: data.status,
    wordId: data.wordId,
    ...data.summary,
    reason: data.reason ?? null,
    source: data.source ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function serializeRequest(snapshot: DocumentSnapshot): VocabularyWordUpdateRequest {
  const parsed = StoredDetailSchema.safeParse(toJson(snapshot.data()));
  if (!parsed.success) throw invalidStoredRequest();
  const data = parsed.data;
  return {
    ...toSummary(snapshot.id, data),
    proposedWord: data.proposedWord as VocabularyWord,
    baseWord: data.baseWord as VocabularyWord,
    baseFingerprint: data.baseFingerprint,
    version: firestoreVersionFingerprint(snapshot.updateTime),
    createdBy: data.createdBy,
    approvedBy: data.approvedBy ?? null,
    approvedAt: data.approvedAt ?? null,
    appliedFromWord: (data.appliedFromWord as VocabularyWord | null | undefined) ?? null,
    dismissedBy: data.dismissedBy ?? null,
    dismissedReason: data.dismissedReason ?? null,
  };
}

const ProposedWordSchema = z.record(z.string(), z.unknown());

const StageInputSchema = z.object({
  wordId: z.string().trim().min(1).max(1500),
  proposedWord: ProposedWordSchema,
  reason: z.string().trim().max(2000).nullish(),
  source: z.string().trim().max(200).nullish(),
  /** Staging again with the same key returns the first request instead of a duplicate. */
  idempotencyKey: z.string().trim().min(1).max(500).optional(),
  /** Version of the word the proposal was made from; staging fails if the word has changed since. */
  baseFingerprint: z.string().trim().min(1).optional(),
});

/** Stages a proposed replacement for an existing word. Nothing is written to the word itself. */
export async function stageWordUpdate(
  db: Firestore,
  actorUid: string,
  input: unknown
): Promise<{ id: string; created: boolean }> {
  const parsed = StageInputSchema.parse(input);
  const requestRef = parsed.idempotencyKey
    ? updateRequests(db).doc(sha256(parsed.idempotencyKey))
    : updateRequests(db).doc();
  const wordRef = words(db).doc(parsed.wordId);
  const pendingForWord = updateRequests(db)
    .where('wordId', '==', parsed.wordId)
    .where('status', '==', 'pending')
    .limit(1);

  return db.runTransaction(async transaction => {
    const [existing, wordSnapshot, pending] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(wordRef),
      transaction.get(pendingForWord),
    ]);

    if (existing.exists) {
      const stored = existing.data() as Plain;
      const sameProposal =
        stored.wordId === parsed.wordId &&
        changedWordFields(toJson(stored.proposedWord) as Plain, parsed.proposedWord).length === 0;
      if (!sameProposal) {
        throw new RequestError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'This idempotency key was already used for a different proposal'
        );
      }
      return { id: existing.id, created: false };
    }

    const live = readLiveWord(wordSnapshot);
    if (parsed.baseFingerprint && parsed.baseFingerprint !== live.fingerprint) {
      throw new RequestError(
        409,
        'WORD_CHANGED_SINCE_PROPOSAL',
        'The word changed after this proposal was made. Make the proposal again from the current word.'
      );
    }
    if (!pending.empty) {
      throw new RequestError(409, 'VOCABULARY_UPDATE_ALREADY_PENDING', 'This word already has a pending update', {
        requestId: pending.docs[0].id,
      });
    }

    const { proposedWord, changes } = validateProposal(parsed.proposedWord, live.authored);
    const now = new Date();
    const document: Plain = {
      status: 'pending',
      wordId: parsed.wordId,
      proposedWord,
      baseWord: live.authored,
      baseFingerprint: live.fingerprint,
      summary: summaryOf(proposedWord, changes),
      reason: parsed.reason || null,
      source: parsed.source || null,
      idempotencyKey: parsed.idempotencyKey ?? null,
      createdBy: actorUid,
      updatedBy: actorUid,
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: null,
      appliedFromWord: null,
      dismissedBy: null,
      dismissedReason: null,
    };
    // Approval adds a copy of the replaced word, so reserve room for it now.
    assertRequestSize({ ...document, appliedFromWord: live.authored });
    transaction.create(requestRef, document);
    return { id: requestRef.id, created: true };
  });
}

/** Summaries of the requests with one status, newest first. */
export async function listWordUpdateRequests(
  db: Firestore,
  status: VocabularyWordUpdateRequestStatus
): Promise<VocabularyWordUpdateRequestList> {
  const snapshot = await updateRequests(db)
    .where('status', '==', status)
    .select('status', 'wordId', 'summary', 'reason', 'source', 'createdAt', 'updatedAt')
    .limit(WORD_UPDATE_REQUEST_LIST_LIMIT + 1)
    .get();
  const requests = snapshot.docs.slice(0, WORD_UPDATE_REQUEST_LIST_LIMIT).map(doc => {
    const parsed = StoredRequestSchema.safeParse(toJson(doc.data()));
    if (!parsed.success) throw invalidStoredRequest();
    return toSummary(doc.id, parsed.data);
  });
  requests.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.word.localeCompare(right.word));
  return { requests, truncated: snapshot.docs.length > WORD_UPDATE_REQUEST_LIST_LIMIT };
}

/** A request with the word as it is now, which is what approval replaces. */
export async function getWordUpdateRequestDetail(
  db: Firestore,
  id: string
): Promise<VocabularyWordUpdateRequestDetail> {
  const requestSnapshot = await updateRequests(db).doc(id).get();
  if (!requestSnapshot.exists) throw requestNotFound();
  const request = serializeRequest(requestSnapshot);
  const wordSnapshot = await words(db).doc(request.wordId).get();
  if (!wordSnapshot.exists) return { request, liveWord: null, liveFingerprint: null };
  return {
    request,
    liveWord: {
      id: wordSnapshot.id,
      ...authoredWord(wordSnapshot.data() as Plain),
    } as VocabularyWordUpdateRequestDetail['liveWord'],
    liveFingerprint: firestoreVersionFingerprint(wordSnapshot.updateTime),
  };
}

const SaveProposalSchema = z.object({ proposedWord: ProposedWordSchema, version: z.string().min(1) });

/** Replaces the proposal of a pending request with the reviewer's edit. */
export async function saveWordUpdateProposal(db: Firestore, actorUid: string, id: string, input: unknown) {
  const parsed = SaveProposalSchema.parse(input);
  const requestRef = updateRequests(db).doc(id);

  await db.runTransaction(async transaction => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw requestNotFound();
    const stored = serializeRequest(requestSnapshot);
    if (stored.status !== 'pending') throw requestNotPending();
    if (stored.version !== parsed.version) throw requestChanged();
    const live = readLiveWord(await transaction.get(words(db).doc(stored.wordId)));

    const { proposedWord, changes } = validateProposal(parsed.proposedWord, live.authored);
    assertRequestSize({ ...(requestSnapshot.data() as Plain), proposedWord, appliedFromWord: live.authored });
    transaction.update(requestRef, {
      proposedWord,
      summary: summaryOf(proposedWord, changes),
      updatedBy: actorUid,
      updatedAt: new Date(),
    });
  });

  return getWordUpdateRequestDetail(db, id);
}

const ApproveSchema = z.object({ version: z.string().min(1), wordFingerprint: z.string().min(1) });

/**
 * Writes the proposal to the word, exactly as the reviewer saw it. Approval
 * fails if the request or the word changed after the reviewer opened them.
 * The word keeps its creation time, random index and any field the schema
 * does not know, such as pool bookkeeping.
 */
export async function approveWordUpdate(db: Firestore, actorUid: string, id: string, input: unknown) {
  const parsed = ApproveSchema.parse(input);
  const requestRef = updateRequests(db).doc(id);

  await runVocabularyContentMutation(db, async transaction => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw requestNotFound();
    const stored = serializeRequest(requestSnapshot);
    if (stored.status !== 'pending') throw requestNotPending();
    if (stored.version !== parsed.version) throw requestChanged();

    const wordRef = words(db).doc(stored.wordId);
    const live = readLiveWord(await transaction.get(wordRef));
    if (live.fingerprint !== parsed.wordFingerprint) {
      throw new RequestError(
        409,
        'WORD_CHANGED_SINCE_REVIEW',
        'The word changed after you opened this update. Review it again.'
      );
    }
    const applyContentRevision = await prepareVocabularyContentRevisionBump(transaction, db);

    const { proposedWord } = validateProposal(stored.proposedWord, live.authored);
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...authored } = proposedWord;
    const known = schemaFields(proposedWord.part_of_speech);
    const kept = Object.fromEntries(
      Object.entries(live.data).filter(([key]) => !known.has(key) && key !== '_deletionPending')
    );
    const now = new Date();
    transaction.set(
      wordRef,
      withoutUndefined({
        ...authored,
        ...kept,
        random_index: typeof live.data.random_index === 'number' ? live.data.random_index : authored.random_index,
        createdAt: live.data.createdAt ?? now,
        updatedAt: now,
      })
    );
    transaction.update(requestRef, {
      status: 'approved',
      approvedBy: actorUid,
      approvedAt: now,
      appliedFromWord: live.authored,
      updatedBy: actorUid,
      updatedAt: now,
    });
    applyContentRevision();
  });

  return getWordUpdateRequestDetail(db, id);
}

const DismissSchema = z.object({ reason: z.string().trim().max(2000).nullish() });

/** Closes a pending request without touching the word. */
export async function dismissWordUpdate(db: Firestore, actorUid: string, id: string, input: unknown) {
  const parsed = DismissSchema.parse(input ?? {});
  const requestRef = updateRequests(db).doc(id);

  await db.runTransaction(async transaction => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw requestNotFound();
    if (serializeRequest(requestSnapshot).status !== 'pending') throw requestNotPending();
    const now = new Date();
    transaction.update(requestRef, {
      status: 'dismissed',
      dismissedBy: actorUid,
      dismissedReason: parsed.reason || null,
      updatedBy: actorUid,
      updatedAt: now,
    });
  });

  return getWordUpdateRequestDetail(db, id);
}

/*
 * Notes live in a subcollection, not on the request: the request's update time
 * is its version, and a note must not make another reviewer's open proposal stale.
 */
const notesOf = (db: Firestore, id: string) =>
  updateRequests(db).doc(id).collection(VOCABULARY_WORD_UPDATE_REQUEST_NOTES_SUBCOLLECTION);

const StoredNoteSchema = z.object({
  text: z.string(),
  createdBy: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
});

/** The name a note is signed with, from the author's profile when it was written. */
function authorNameOf(rawProfile: unknown): string {
  const profile = rawProfile && typeof rawProfile === 'object' ? (rawProfile as Plain) : {};
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const name =
    [text(profile.firstName), text(profile.lastName)].filter(Boolean).join(' ') ||
    text(profile.username) ||
    text(profile.email);
  return name.slice(0, 300) || 'Admin';
}

function serializeNote(snapshot: DocumentSnapshot, actorUid: string): VocabularyWordUpdateNote {
  const parsed = StoredNoteSchema.safeParse(toJson(snapshot.data()));
  if (!parsed.success) {
    throw new RequestError(
      409,
      'INVALID_VOCABULARY_UPDATE_NOTE',
      'A note on this update is stored in an invalid format'
    );
  }
  const { text, authorName, createdAt, createdBy } = parsed.data;
  return { id: snapshot.id, text, authorName, createdAt, mine: createdBy === actorUid };
}

/** An update's notes, oldest first. */
export async function listWordUpdateNotes(
  db: Firestore,
  actorUid: string,
  id: string
): Promise<VocabularyWordUpdateNoteList> {
  if (!(await updateRequests(db).doc(id).get()).exists) throw requestNotFound();
  const snapshot = await notesOf(db, id)
    .orderBy('createdAt', 'desc')
    .limit(WORD_UPDATE_NOTE_LIST_LIMIT + 1)
    .get();
  const notes = snapshot.docs.slice(0, WORD_UPDATE_NOTE_LIST_LIMIT).map(doc => serializeNote(doc, actorUid));
  return { notes: notes.reverse(), truncated: snapshot.docs.length > WORD_UPDATE_NOTE_LIST_LIMIT };
}

const NoteInputSchema = z.object({ text: z.string().trim().min(1).max(VOCABULARY_WORD_UPDATE_NOTE_MAX_LENGTH) });

/** Adds a note to an update in any status; the update itself is not changed. */
export async function addWordUpdateNote(
  db: Firestore,
  actorUid: string,
  id: string,
  input: unknown
): Promise<VocabularyWordUpdateNote> {
  const parsed = NoteInputSchema.parse(input);
  const requestRef = updateRequests(db).doc(id);
  const noteRef = notesOf(db, id).doc();

  await db.runTransaction(async transaction => {
    const [requestSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(db.collection(USERS_COLLECTION).doc(actorUid)),
    ]);
    if (!requestSnapshot.exists) throw requestNotFound();
    transaction.create(noteRef, {
      text: parsed.text,
      createdBy: actorUid,
      authorName: authorNameOf(profileSnapshot.data()),
      createdAt: new Date(),
    });
  });

  return serializeNote(await noteRef.get(), actorUid);
}

/** Deletes one of the admin's own notes. */
export async function deleteWordUpdateNote(db: Firestore, actorUid: string, id: string, noteId: string) {
  const noteRef = notesOf(db, id).doc(noteId);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(noteRef);
    if (!snapshot.exists) {
      throw new RequestError(404, 'VOCABULARY_UPDATE_NOTE_NOT_FOUND', 'This note no longer exists');
    }
    if (!serializeNote(snapshot, actorUid).mine) {
      throw new RequestError(403, 'VOCABULARY_UPDATE_NOTE_NOT_YOURS', 'You can only delete your own notes');
    }
    transaction.delete(noteRef);
  });
  return { id: noteId };
}
