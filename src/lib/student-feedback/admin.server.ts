import { randomUUID } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import {
  STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION,
  STUDENT_FEEDBACK_COLLECTION,
  USERS_COLLECTION,
} from '@/shared/constants/firestore';
import {
  FEEDBACK_ADMIN_PAGE_SIZE,
  FEEDBACK_MAX_ACTIVITY_ITEMS,
  feedbackActivitySchema,
  feedbackReportSchema,
  type FeedbackActivity,
  type FeedbackAdminAction,
  type FeedbackAdminDetailResponse,
  type FeedbackAdminListItem,
  type FeedbackAdminListQuery,
  type FeedbackAdminListResponse,
  type FeedbackReport,
} from '@/shared/student-feedback';
import { FeedbackError, feedbackNotFound, invalidFeedbackDocument } from './http.server';
import { getCurrentFeedbackLesson } from './lessons.server';
import { feedbackActorName } from './service.server';

const EXCERPT_LENGTH = 280;
const ACTIVITY_KIND: Record<FeedbackAdminAction, FeedbackActivity['kind']> = {
  resolve: 'resolved',
  reopen: 'reopened',
  archive: 'archived',
  unarchive: 'unarchived',
};

function parseReport(data: unknown, id: string): FeedbackReport {
  const parsed = feedbackReportSchema.safeParse(data);
  if (!parsed.success || parsed.data.id !== id) invalidFeedbackDocument('Feedback report data is invalid');
  return parsed.data;
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id]), 'utf8').toString('base64url');
}

function decodeCursor(value: string): [string, string] {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (Array.isArray(decoded) && decoded.length === 2 && decoded.every(part => typeof part === 'string')) {
      return decoded as [string, string];
    }
  } catch {
    // Fall through to the domain error.
  }
  throw new FeedbackError('FEEDBACK_INVALID_CURSOR', 'This page link is no longer valid', 400);
}

export function feedbackListQuery(db: Firestore, filters: FeedbackAdminListQuery): Query {
  let query: Query = db.collection(STUDENT_FEEDBACK_COLLECTION).where('archived', '==', filters.archived === 'true');
  if (filters.status !== 'all') query = query.where('status', '==', filters.status);
  if (filters.type) query = query.where('type', '==', filters.type);
  if (filters.severity) query = query.where('severity', '==', filters.severity);
  if (filters.area) query = query.where('areas', 'array-contains', filters.area);
  if (filters.lessonId) query = query.where('lesson.id', '==', filters.lessonId);
  if (filters.submitterUid) query = query.where('submitter.uid', '==', filters.submitterUid);
  if (filters.submitterEmail) query = query.where('submitter.emailNormalized', '==', filters.submitterEmail.toLowerCase());

  const direction = filters.sort === 'oldest' ? 'asc' : 'desc';
  query = query.orderBy('createdAt', direction).orderBy(FieldPath.documentId(), direction);
  // Date bounds are cursors on the sort field, so every filter reuses the same sort indexes.
  const [start, end] = direction === 'asc' ? [filters.from, filters.to] : [filters.to, filters.from];
  if (filters.cursor) query = query.startAfter(...decodeCursor(filters.cursor));
  else if (start) query = query.startAt(start);
  if (end) query = query.endAt(end);
  return query;
}

function listItem(report: FeedbackReport): FeedbackAdminListItem {
  return {
    id: report.id,
    type: report.type,
    severity: report.severity,
    areas: report.areas,
    excerpt: report.description.slice(0, EXCERPT_LENGTH),
    submitter: report.submitter,
    lesson: report.lesson,
    createdAt: report.createdAt,
    status: report.status,
    archived: report.archived,
    attachmentCount: report.attachments.length,
  };
}

export async function listFeedback(filters: FeedbackAdminListQuery, db: Firestore = adminDb): Promise<FeedbackAdminListResponse> {
  const snapshot = await feedbackListQuery(db, filters).limit(FEEDBACK_ADMIN_PAGE_SIZE + 1).get();
  const page = snapshot.docs.slice(0, FEEDBACK_ADMIN_PAGE_SIZE).map(document => parseReport(document.data(), document.id));
  const last = page.at(-1);
  return {
    items: page.map(listItem),
    nextCursor: snapshot.size > FEEDBACK_ADMIN_PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export async function countOpenFeedback(db: Firestore = adminDb): Promise<number> {
  const snapshot = await db
    .collection(STUDENT_FEEDBACK_COLLECTION)
    .where('archived', '==', false)
    .where('status', '==', 'unresolved')
    .count()
    .get();
  return snapshot.data().count;
}

export async function getFeedbackReport(feedbackId: string, db: Firestore = adminDb): Promise<FeedbackReport> {
  const snapshot = await db.collection(STUDENT_FEEDBACK_COLLECTION).doc(feedbackId).get();
  if (!snapshot.exists) feedbackNotFound();
  return parseReport(snapshot.data(), snapshot.id);
}

export async function getFeedbackDetail(feedbackId: string, db: Firestore = adminDb): Promise<FeedbackAdminDetailResponse> {
  const [feedback, activitySnapshot] = await Promise.all([
    getFeedbackReport(feedbackId, db),
    db
      .collection(STUDENT_FEEDBACK_COLLECTION)
      .doc(feedbackId)
      .collection(STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION)
      .orderBy('createdAt', 'asc')
      .limit(FEEDBACK_MAX_ACTIVITY_ITEMS)
      .get(),
  ]);
  const currentLesson = await getCurrentFeedbackLesson(feedback.lesson?.id, db);
  const activity = activitySnapshot.docs.map(document => {
    const parsed = feedbackActivitySchema.safeParse(document.data());
    if (!parsed.success || parsed.data.id !== document.id) invalidFeedbackDocument('Feedback activity data is invalid');
    return parsed.data;
  });
  return { feedback, activity, currentLesson };
}

function statePatch(report: FeedbackReport, action: FeedbackAdminAction) {
  switch (action) {
    case 'resolve':
      return report.status === 'resolved' ? null : { status: 'resolved' as const };
    case 'reopen':
      return report.status === 'unresolved' ? null : { status: 'unresolved' as const };
    case 'archive':
      return report.archived ? null : { archived: true };
    case 'unarchive':
      return report.archived ? { archived: false } : null;
  }
}

type AdminChange = { action: FeedbackAdminAction; reason?: string } | { note: string };

/** Records a state action or a note, with its activity entry, in one transaction. */
async function recordAdminChange(feedbackId: string, token: DecodedIdToken, change: AdminChange, db: Firestore, nowMs: number) {
  const reportRef = db.collection(STUDENT_FEEDBACK_COLLECTION).doc(feedbackId);
  return db.runTransaction(async transaction => {
    const [snapshot, actorSnapshot] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(db.collection(USERS_COLLECTION).doc(token.uid)),
    ]);
    if (!snapshot.exists) feedbackNotFound();
    const report = parseReport(snapshot.data(), feedbackId);
    const isAction = 'action' in change;
    const patch = isAction ? statePatch(report, change.action) : null;
    // Actions are toggles: repeating one that already applies changes nothing.
    if (isAction && !patch) return { feedback: report, activity: null };

    const now = new Date(nowMs).toISOString();
    const activityRef = reportRef.collection(STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION).doc(randomUUID());
    const activity: FeedbackActivity = {
      id: activityRef.id,
      kind: isAction ? ACTIVITY_KIND[change.action] : 'note',
      actorUid: token.uid,
      actorDisplayName: feedbackActorName(token, actorSnapshot.data()),
      createdAt: now,
      reason: isAction ? (change.reason ?? null) : null,
      note: isAction ? null : change.note,
    };
    if (patch) transaction.update(reportRef, { ...patch, updatedAt: now });
    transaction.create(activityRef, activity);
    return { feedback: patch ? { ...report, ...patch, updatedAt: now } : report, activity };
  });
}

export async function updateFeedbackState(
  feedbackId: string,
  token: DecodedIdToken,
  input: { action: FeedbackAdminAction; reason?: string },
  db: Firestore = adminDb,
  nowMs = Date.now()
): Promise<FeedbackReport> {
  return (await recordAdminChange(feedbackId, token, input, db, nowMs)).feedback;
}

export async function addFeedbackNote(
  feedbackId: string,
  token: DecodedIdToken,
  note: string,
  db: Firestore = adminDb,
  nowMs = Date.now()
): Promise<FeedbackActivity> {
  return (await recordAdminChange(feedbackId, token, { note }, db, nowMs)).activity!;
}
