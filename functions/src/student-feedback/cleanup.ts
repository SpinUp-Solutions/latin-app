import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import {
  STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION,
  STUDENT_FEEDBACK_COLLECTION,
  STUDENT_FEEDBACK_SESSIONS_COLLECTION,
} from '../../../shared/constants/firestore';
import {
  FEEDBACK_TOMBSTONE_TTL_MS,
  feedbackAttachmentIntentDocumentSchema,
  feedbackReportDocumentSchema,
  feedbackSessionDocumentSchema,
  type FeedbackAttachmentIntentDocument,
  type FeedbackSessionDocument,
} from '../../../shared/student-feedback';

const app = getApps()[0] ?? initializeApp();
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
type FeedbackBucket = typeof bucket;

const CLEANUP_LEASE_MS = 10 * 60 * 1000;
const SESSION_BATCH_SIZE = 25;
const INTENT_BATCH_SIZE = 100;

const stagingPath = (uid: string, sessionId: string, attachmentId: string) =>
  `student-feedback/staging/${uid}/${sessionId}/${attachmentId}`;
const privatePath = (sessionId: string, attachmentId: string) =>
  `student-feedback/private/${sessionId}/${attachmentId}`;

function sessionRef(firestore: Firestore, sessionId: string) {
  return firestore.collection(STUDENT_FEEDBACK_SESSIONS_COLLECTION).doc(sessionId);
}

function parseSession(raw: unknown, id: string): FeedbackSessionDocument {
  const parsed = feedbackSessionDocumentSchema.safeParse(raw);
  if (!parsed.success || parsed.data.id !== id) throw new Error('Invalid feedback session');
  return parsed.data;
}

function parseIntent(raw: unknown, id: string): FeedbackAttachmentIntentDocument {
  const parsed = feedbackAttachmentIntentDocumentSchema.safeParse(raw);
  if (!parsed.success || parsed.data.id !== id) throw new Error('Invalid feedback attachment intent');
  return parsed.data;
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 404;
}

/** Never issue an unpinned delete; do not remove a replacement generation. */
async function deleteCurrentGeneration(storageBucket: FeedbackBucket, path: string, expectedGeneration?: string): Promise<void> {
  let metadata;
  try {
    [metadata] = await storageBucket.file(path).getMetadata();
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  const generation = String(metadata.generation ?? '');
  if (!/^\d+$/.test(generation)) throw new Error('Invalid object generation');
  if (expectedGeneration && generation !== expectedGeneration) return;
  try {
    await storageBucket.file(path, { generation }).delete({ ignoreNotFound: true });
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function claimExpiredSession(firestore: Firestore, id: string, nowMs: number): Promise<FeedbackSessionDocument | null> {
  const ref = sessionRef(firestore, id);
  return firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const session = parseSession(snapshot.data(), id);
    if (session.status === 'submitted' || session.status === 'cancelled' || session.status === 'expired') return null;
    if (session.expiresAtMs > nowMs) return null;
    if (session.status === 'cleanup' && session.cleanupLease && session.cleanupLease.expiresAtMs > nowMs) return null;
    const claimed = feedbackSessionDocumentSchema.parse({
      ...session,
      status: 'cleanup',
      cleanupLease: { id: randomUUID(), expiresAtMs: nowMs + CLEANUP_LEASE_MS },
      tombstoneUntilMs: session.tombstoneUntilMs ?? nowMs + FEEDBACK_TOMBSTONE_TTL_MS,
      updatedAt: new Date(nowMs).toISOString(),
    });
    transaction.update(ref, {
      status: claimed.status,
      cleanupLease: claimed.cleanupLease,
      tombstoneUntilMs: claimed.tombstoneUntilMs,
      updatedAt: claimed.updatedAt,
    });
    return claimed;
  });
}

export async function cleanupClaimedSession(
  firestore: Firestore,
  storageBucket: FeedbackBucket,
  session: FeedbackSessionDocument,
  nowMs: number
): Promise<void> {
  const report = await firestore.collection(STUDENT_FEEDBACK_COLLECTION).doc(session.id).get();
  if (report.exists) {
    // Preserve any potentially committed media even when the session is corrupt.
    throw new Error('Cleanup session unexpectedly has a report');
  }
  const collection = sessionRef(firestore, session.id).collection(STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION);
  let blockedByLease = false;
  const page = await collection.orderBy('__name__').limit(INTENT_BATCH_SIZE).get();
  if (!page.empty) {
    for (const doc of page.docs) {
      const intent = parseIntent(doc.data(), doc.id);
      if (intent.sessionId !== session.id || intent.ownerUid !== session.ownerUid) throw new Error('Invalid intent ownership');
      if (intent.status === 'finalizing' && intent.lease && intent.lease.expiresAtMs > nowMs) {
        blockedByLease = true;
        continue;
      }
      if (intent.status === 'cancelled' && intent.cleanupAfterMs !== null && intent.cleanupAfterMs > nowMs) {
        // Removal may have raced a copy. Preserve the intent's delayed retry
        // marker until the in-flight request can no longer create an object.
        blockedByLease = true;
        continue;
      }
      await deleteCurrentGeneration(storageBucket, stagingPath(session.ownerUid, session.id, intent.id));
      await deleteCurrentGeneration(storageBucket, privatePath(session.id, intent.id));
      await doc.ref.delete();
    }
  }
  if (blockedByLease) return;
  await firestore.runTransaction(async transaction => {
    const ref = sessionRef(firestore, session.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const current = parseSession(snapshot.data(), session.id);
    if (current.status !== 'cleanup' || current.cleanupLease?.id !== session.cleanupLease?.id) return;
    const remaining = await transaction.get(ref.collection(STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION).limit(1));
    if (!remaining.empty) return;
    transaction.update(ref, {
      status: 'expired',
      cleanupLease: null,
      updatedAt: new Date(nowMs).toISOString(),
    });
  });
}

async function clearCleanupMarker(firestore: Firestore, doc: QueryDocumentSnapshot, expectedStatus: string, expectedDueMs: number): Promise<void> {
  await firestore.runTransaction(async transaction => {
    const current = await transaction.get(doc.ref);
    if (!current.exists) return;
    const intent = parseIntent(current.data(), current.id);
    if (intent.status === expectedStatus && intent.cleanupPending && intent.cleanupAfterMs === expectedDueMs) {
      transaction.update(doc.ref, { cleanupPending: false, cleanupAfterMs: null, updatedAt: new Date().toISOString() });
    }
  });
}

export async function cleanupPendingIntent(firestore: Firestore, storageBucket: FeedbackBucket, doc: QueryDocumentSnapshot, nowMs = Date.now()): Promise<void> {
  if (!/^studentFeedbackSessions\/[^/]+\/attachments\/[^/]+$/.test(doc.ref.path)) return;
  const intent = parseIntent(doc.data(), doc.id);
  if (!intent.cleanupPending || intent.cleanupAfterMs === null || intent.cleanupAfterMs > nowMs) return;
  const sessionSnapshot = await sessionRef(firestore, intent.sessionId).get();
  const session = sessionSnapshot.exists ? parseSession(sessionSnapshot.data(), intent.sessionId) : null;
  if (session && session.ownerUid !== intent.ownerUid) throw new Error('Invalid intent owner');
  if (intent.status === 'ready') {
    await deleteCurrentGeneration(storageBucket, stagingPath(intent.ownerUid, intent.sessionId, intent.id));
    await clearCleanupMarker(firestore, doc, 'ready', intent.cleanupAfterMs);
  } else if (intent.status === 'cancelled') {
    const report = await firestore.collection(STUDENT_FEEDBACK_COLLECTION).doc(intent.sessionId).get();
    if (report.exists) {
      const parsed = feedbackReportDocumentSchema.safeParse(report.data());
      if (!parsed.success || parsed.data.id !== intent.sessionId) return;
      if (parsed.data.attachments.some(item => item.id === intent.id && item.storagePath === privatePath(intent.sessionId, intent.id))) return;
    }
    await deleteCurrentGeneration(storageBucket, stagingPath(intent.ownerUid, intent.sessionId, intent.id));
    await deleteCurrentGeneration(storageBucket, privatePath(intent.sessionId, intent.id));
    await clearCleanupMarker(firestore, doc, 'cancelled', intent.cleanupAfterMs);
  }
}

export async function runStudentFeedbackCleanup(
  firestore: Firestore = db,
  storageBucket: FeedbackBucket = bucket,
  nowMs = Date.now()
): Promise<void> {
  const expired = await firestore.collection(STUDENT_FEEDBACK_SESSIONS_COLLECTION)
    .where('status', 'in', ['open', 'cleanup'])
    .where('expiresAtMs', '<=', nowMs)
    .orderBy('expiresAtMs')
    .limit(SESSION_BATCH_SIZE).get();
  for (const document of expired.docs) {
    try {
      const claimed = await claimExpiredSession(firestore, document.id, nowMs);
      if (claimed) await cleanupClaimedSession(firestore, storageBucket, claimed, nowMs);
    } catch {
      console.error('[student-feedback] session cleanup failed', { sessionId: document.id });
    }
  }
  const pending = await firestore.collectionGroup(STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION)
    .where('cleanupPending', '==', true)
    .where('cleanupAfterMs', '<=', nowMs)
    .orderBy('cleanupAfterMs')
    .limit(INTENT_BATCH_SIZE).get();
  for (const document of pending.docs) {
    try {
      await cleanupPendingIntent(firestore, storageBucket, document, nowMs);
    } catch {
      console.error('[student-feedback] attachment cleanup failed', { attachmentId: document.id });
    }
  }
  // Keep minimal expired session tombstones permanently. Reusing a purged
  // client-chosen session ID could adopt a late canonical object generation.
}

export const cleanupStudentFeedback = onSchedule(
  { schedule: 'every 15 minutes', region: 'us-central1', timeZone: 'Etc/UTC', timeoutSeconds: 540, memory: '512MiB' },
  async () => runStudentFeedbackCleanup()
);

/** Idempotent object-finalized guard for late uploads/copies after cancellation or expiry. */
export async function guardStudentFeedbackObject(
  path: string,
  generation: string,
  firestore: Firestore = db,
  storageBucket: FeedbackBucket = bucket,
  nowMs = Date.now()
): Promise<void> {
  const staging = /^student-feedback\/staging\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
  const canonical = /^student-feedback\/private\/([^/]+)\/([^/]+)$/.exec(path);
  if (!staging && !canonical) return;
  if (!/^\d+$/.test(generation)) throw new Error('Invalid finalized object generation');
  const sessionId = staging ? staging[2] : canonical![1];
  const attachmentId = staging ? staging[3] : canonical![2];
  const state = await firestore.runTransaction(async transaction => {
    const [reportSnapshot, sessionSnapshot, intentSnapshot] = await Promise.all([
      transaction.get(firestore.collection(STUDENT_FEEDBACK_COLLECTION).doc(sessionId)),
      transaction.get(sessionRef(firestore, sessionId)),
      transaction.get(sessionRef(firestore, sessionId).collection(STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION).doc(attachmentId)),
    ]);
    const report = reportSnapshot.exists ? feedbackReportDocumentSchema.safeParse(reportSnapshot.data()) : null;
    return {
      reportExists: reportSnapshot.exists,
      report: report?.success ? report.data : null,
      session: sessionSnapshot.exists ? parseSession(sessionSnapshot.data(), sessionId) : null,
      intent: intentSnapshot.exists ? parseIntent(intentSnapshot.data(), attachmentId) : null,
    };
  });
  if (canonical && state.reportExists) {
    if (!state.report) return; // fail closed on corrupt committed report
    if (state.report.attachments.some(item =>
      item.id === attachmentId && item.generation === generation && item.storagePath === path)) return;
  }
  const { session, intent } = state;
  const validOwner = session && intent && intent.sessionId === sessionId && intent.ownerUid === session.ownerUid &&
    (!staging || staging[1] === session.ownerUid);
  const live = validOwner && session.status === 'open' && session.expiresAtMs > nowMs;
  const finalizing = live && intent.status === 'finalizing' && intent.lease && intent.lease.expiresAtMs > nowMs;
  if (staging) {
    if (live && (intent.status === 'reserved' || finalizing)) return;
  } else {
    // An OPEN session may still finish or submit. Closing it is a Firestore
    // transaction and makes canonical deletion safe on a later retry.
    if (session?.status === 'open' && (!intent || intent.status !== 'cancelled')) return;
    if (session?.status === 'submitted' && !state.reportExists) return;
  }
  await deleteCurrentGeneration(storageBucket, path, generation);
}

export const guardFinalizedStudentFeedbackObject = onObjectFinalized(
  { region: 'us-central1', timeoutSeconds: 120, memory: '256MiB', retry: true },
  async event => {
    const path = event.data.name;
    const generation = String(event.data.generation ?? '');
    if (path) await guardStudentFeedbackObject(path, generation);
  }
);
