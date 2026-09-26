import { createHash, randomUUID } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import {
  STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION,
  STUDENT_FEEDBACK_COLLECTION,
  LEARNING_UNITS_COLLECTION,
  USERS_COLLECTION,
} from '@/shared/constants/firestore';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import {
  FEEDBACK_ADMIN_PAGE_SIZE,
  FEEDBACK_SCHEMA_VERSION,
  feedbackActivityDocumentSchema,
  feedbackAdminListItemSchema,
  feedbackDocumentIdSchema,
  feedbackIsoTimestampSchema,
  feedbackReportDocumentSchema,
  type FeedbackAdminListQuery,
  type FeedbackReportDocument,
} from '@/shared/student-feedback';
import { FeedbackError, invalidFeedbackDocument } from './http.server';
import { boundedFeedbackTitle } from './lessons.server';
import { applyFeedbackDateBounds } from './query-bounds';
import { feedbackActorName } from '@/src/lib/student-feedback/session.server';

type ListQuery = FeedbackAdminListQuery;
type StateInput = { action: 'resolve' | 'reopen' | 'archive' | 'unarchive'; expectedRevision: number; reason?: string };
const CURSOR_VERSION = 1;

function parseReport(data: unknown, id: string): FeedbackReportDocument {
  const parsed = feedbackReportDocumentSchema.safeParse(data);
  if (!parsed.success || parsed.data.id !== id || parsed.data.sessionId !== id) {
    invalidFeedbackDocument('Feedback report data is invalid');
  }
  return parsed.data;
}

function reportNotFound(): never {
  throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Feedback report not found', 404);
}

function filterFingerprint(filters: ListQuery, scope = 'reports'): string {
  const { cursor: _cursor, ...withoutCursor } = filters;
  return createHash('sha256').update(JSON.stringify({ scope, filters: withoutCursor })).digest('hex');
}

export function encodeCursor(filters: ListQuery, createdAt: string, id: string, scope = 'reports'): string {
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, f: filterFingerprint(filters, scope), createdAt, id }), 'utf8')
    .toString('base64url');
}

export function decodeCursor(value: string, filters: ListQuery, scope = 'reports'): { createdAt: string; id: string } {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (
      decoded.v !== CURSOR_VERSION ||
      decoded.f !== filterFingerprint(filters, scope) ||
      !feedbackIsoTimestampSchema.safeParse(decoded.createdAt).success ||
      !feedbackDocumentIdSchema.safeParse(decoded.id).success
    ) throw new Error('invalid');
    const createdAt = decoded.createdAt as string;
    if ((filters.from && createdAt < filters.from) || (filters.to && createdAt > filters.to)) throw new Error('out of bounds');
    return { createdAt, id: decoded.id as string };
  } catch {
    throw new FeedbackError('FEEDBACK_REQUEST_CONFLICT', 'This page cursor does not match the filters', 400);
  }
}

function assertDateBounds(filters: ListQuery) {
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new FeedbackError('FEEDBACK_REQUEST_CONFLICT', 'The start date must be before the end date', 400);
  }
}

export function baseListQuery(db: Firestore, filters: ListQuery): Query {
  let query: Query = db.collection(STUDENT_FEEDBACK_COLLECTION).where('archived', '==', filters.archived === 'true');
  if (filters.status !== 'all') query = query.where('status', '==', filters.status);
  if (filters.type) query = query.where('type', '==', filters.type);
  if (filters.severity) query = query.where('severity', '==', filters.severity);
  if (filters.area) query = query.where(`areaFlags.${filters.area}`, '==', true);
  if (filters.lessonId) query = query.where('lesson.id', '==', filters.lessonId);
  if (filters.submitterUid) query = query.where('submitter.uid', '==', filters.submitterUid);
  if (filters.submitterEmail) query = query.where('submitter.emailNormalized', '==', filters.submitterEmail.toLowerCase());
  const direction = filters.sort === 'oldest' ? 'asc' : 'desc';
  return query.orderBy('createdAt', direction).orderBy(FieldPath.documentId(), direction);
}

export function applyDateAndCursor(query: Query, filters: ListQuery): Query {
  assertDateBounds(filters);
  const cursor = filters.cursor ? decodeCursor(filters.cursor, filters) : null;
  return applyFeedbackDateBounds(query, { sort: filters.sort, from: filters.from, to: filters.to, cursor });
}

function matchesDirect(report: FeedbackReportDocument, filters: ListQuery): boolean {
  if (report.archived !== (filters.archived === 'true')) return false;
  if (filters.status !== 'all' && report.status !== filters.status) return false;
  if (filters.type && report.type !== filters.type) return false;
  if (filters.severity && report.severity !== filters.severity) return false;
  if (filters.area && !report.areaFlags[filters.area]) return false;
  if (filters.lessonId && report.lesson?.id !== filters.lessonId) return false;
  if (filters.submitterUid && report.submitter.uid !== filters.submitterUid) return false;
  if (filters.submitterEmail && report.submitter.emailNormalized !== filters.submitterEmail.toLowerCase()) return false;
  if (filters.from && report.createdAt < filters.from) return false;
  if (filters.to && report.createdAt > filters.to) return false;
  return true;
}

function listItem(report: FeedbackReportDocument) {
  return feedbackAdminListItemSchema.parse({
    id: report.id,
    type: report.type,
    ...(report.severity ? { severity: report.severity } : {}),
    areas: report.areas,
    description: report.description,
    submitter: report.submitter,
    lesson: report.lesson,
    createdAt: report.createdAt,
    status: report.status,
    archived: report.archived,
    stateRevision: report.stateRevision,
    attachments: report.attachments,
  });
}

export async function listFeedback(filters: ListQuery, db: Firestore = adminDb) {
  assertDateBounds(filters);
  if (filters.feedbackId) {
    if (filters.cursor) decodeCursor(filters.cursor, filters);
    const snapshot = await db.collection(STUDENT_FEEDBACK_COLLECTION).doc(filters.feedbackId).get();
    if (!snapshot.exists) return { items: [], nextCursor: null };
    const report = parseReport(snapshot.data(), snapshot.id);
    return { items: matchesDirect(report, filters) ? [listItem(report)] : [], nextCursor: null };
  }
  const snapshots = await applyDateAndCursor(baseListQuery(db, filters), filters).limit(FEEDBACK_ADMIN_PAGE_SIZE + 1).get();
  const page = snapshots.docs.slice(0, FEEDBACK_ADMIN_PAGE_SIZE);
  const items = page.map(snapshot => listItem(parseReport(snapshot.data(), snapshot.id)));
  const last = page.at(-1);
  return {
    items,
    nextCursor: snapshots.size > FEEDBACK_ADMIN_PAGE_SIZE && last
      ? encodeCursor(filters, last.get('createdAt') as string, last.id)
      : null,
  };
}

export async function countFeedback(filters: ListQuery, db: Firestore = adminDb): Promise<number> {
  assertDateBounds(filters);
  if (filters.feedbackId) return (await listFeedback(filters, db)).items.length;
  const { cursor: _cursor, ...withoutCursor } = filters;
  return (await applyDateAndCursor(baseListQuery(db, withoutCursor), withoutCursor).count().get()).data().count;
}

export async function getAdminFeedback(feedbackId: string, db: Firestore = adminDb) {
  const snapshot = await db.collection(STUDENT_FEEDBACK_COLLECTION).doc(feedbackId).get();
  if (!snapshot.exists) reportNotFound();
  return parseReport(snapshot.data(), snapshot.id);
}

export async function getCurrentFeedbackLesson(lessonId: string | undefined, db: Firestore = adminDb) {
  if (!lessonId) return null;
  const snapshot = await db.collection(LEARNING_UNITS_COLLECTION).doc(lessonId).get();
  const data = snapshot.data();
  if (
    !snapshot.exists || !isLessonDocumentData(data) || data._deletionPending === true ||
    typeof data.title !== 'string' || !data.title.trim()
  ) return null;
  return { id: lessonId, title: boundedFeedbackTitle(data.title) };
}

export async function updateFeedbackState(
  feedbackId: string,
  token: DecodedIdToken,
  input: StateInput,
  db: Firestore = adminDb,
  nowMs = Date.now()
) {
  const ref = db.collection(STUDENT_FEEDBACK_COLLECTION).doc(feedbackId);
  const actorRef = db.collection(USERS_COLLECTION).doc(token.uid);
  return db.runTransaction(async transaction => {
    const [snapshot, actorSnapshot] = await Promise.all([transaction.get(ref), transaction.get(actorRef)]);
    if (!snapshot.exists) reportNotFound();
    const previous = parseReport(snapshot.data(), feedbackId);
    if (previous.stateRevision !== input.expectedRevision) {
      throw new FeedbackError('FEEDBACK_REVISION_CONFLICT', 'Feedback changed. Refresh and try again.', 409);
    }
    const alreadyApplied =
      (input.action === 'resolve' && previous.status === 'resolved') ||
      (input.action === 'reopen' && previous.status === 'unresolved') ||
      (input.action === 'archive' && previous.archived) ||
      (input.action === 'unarchive' && !previous.archived);
    if (alreadyApplied) return previous;

    const now = new Date(nowMs).toISOString();
    const next = feedbackReportDocumentSchema.parse({
      ...previous,
      updatedAt: now,
      stateRevision: previous.stateRevision + 1,
      ...(input.action === 'resolve'
        ? { status: 'resolved', resolvedBy: token.uid, resolvedAt: now, resolutionReason: input.reason ?? null }
        : input.action === 'reopen'
          ? { status: 'unresolved', resolvedBy: null, resolvedAt: null, resolutionReason: null }
          : input.action === 'archive'
            ? { archived: true, archivedBy: token.uid, archivedAt: now }
            : { archived: false, archivedBy: null, archivedAt: null }),
    });
    const id = randomUUID();
    const activity = feedbackActivityDocumentSchema.parse({
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
      id,
      feedbackId,
      kind: input.action === 'resolve' ? 'resolved' : input.action === 'reopen' ? 'reopened' : input.action === 'archive' ? 'archived' : 'unarchived',
      actorUid: token.uid,
      actorDisplayName: feedbackActorName(token, actorSnapshot.data()),
      createdAt: now,
      reason: input.reason ?? null,
      note: null,
      requestId: null,
    });
    transaction.set(ref, next);
    transaction.create(ref.collection(STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION).doc(id), activity);
    return next;
  });
}

export async function addPrivateFeedbackNote(
  feedbackId: string,
  token: DecodedIdToken,
  input: { requestId: string; note: string },
  db: Firestore = adminDb,
  nowMs = Date.now()
) {
  const reportRef = db.collection(STUDENT_FEEDBACK_COLLECTION).doc(feedbackId);
  const noteRef = reportRef.collection(STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION).doc(input.requestId);
  const actorRef = db.collection(USERS_COLLECTION).doc(token.uid);
  return db.runTransaction(async transaction => {
    const [reportSnapshot, noteSnapshot, actorSnapshot] = await Promise.all([
      transaction.get(reportRef), transaction.get(noteRef), transaction.get(actorRef),
    ]);
    if (!reportSnapshot.exists) reportNotFound();
    parseReport(reportSnapshot.data(), feedbackId);
    if (noteSnapshot.exists) {
      const parsed = feedbackActivityDocumentSchema.safeParse(noteSnapshot.data());
      if (
        !parsed.success || parsed.data.id !== input.requestId ||
        parsed.data.requestId !== input.requestId || parsed.data.feedbackId !== feedbackId
      ) invalidFeedbackDocument('Feedback activity data is invalid');
      if (parsed.data.kind !== 'note' || parsed.data.actorUid !== token.uid || parsed.data.note !== input.note) {
        throw new FeedbackError('FEEDBACK_REQUEST_CONFLICT', 'This note request ID was used for different content', 409);
      }
      return parsed.data;
    }
    const activity = feedbackActivityDocumentSchema.parse({
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
      id: input.requestId,
      feedbackId,
      kind: 'note',
      actorUid: token.uid,
      actorDisplayName: feedbackActorName(token, actorSnapshot.data()),
      createdAt: new Date(nowMs).toISOString(),
      reason: null,
      note: input.note,
      requestId: input.requestId,
    });
    transaction.create(noteRef, activity);
    return activity;
  });
}

export async function listFeedbackActivity(feedbackId: string, cursor: string | undefined, db: Firestore = adminDb) {
  const reportSnapshot = await db.collection(STUDENT_FEEDBACK_COLLECTION).doc(feedbackId).get();
  if (!reportSnapshot.exists) reportNotFound();
  parseReport(reportSnapshot.data(), feedbackId);
  let query = reportSnapshot.ref.collection(STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION)
    .orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (cursor) {
    const parsed = decodeCursor(cursor, { status: 'all', archived: 'false', sort: 'newest' }, `activity:${feedbackId}`);
    query = query.startAfter(parsed.createdAt, parsed.id);
  }
  const snapshot = await query.limit(FEEDBACK_ADMIN_PAGE_SIZE + 1).get();
  const page = snapshot.docs.slice(0, FEEDBACK_ADMIN_PAGE_SIZE);
  const items = page.map(document => {
    const parsed = feedbackActivityDocumentSchema.safeParse(document.data());
    if (!parsed.success || parsed.data.id !== document.id || parsed.data.feedbackId !== feedbackId) {
      invalidFeedbackDocument('Feedback activity data is invalid');
    }
    return parsed.data;
  });
  const last = page.at(-1);
  return {
    items,
    nextCursor: snapshot.size > FEEDBACK_ADMIN_PAGE_SIZE && last
      ? encodeCursor({ status: 'all', archived: 'false', sort: 'newest' }, last.get('createdAt') as string, last.id, `activity:${feedbackId}`)
      : null,
  };
}
