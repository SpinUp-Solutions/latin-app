import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import {
  STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION,
  STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION,
  STUDENT_FEEDBACK_COLLECTION,
  STUDENT_FEEDBACK_SESSIONS_COLLECTION,
  STUDENT_FEEDBACK_THROTTLES_COLLECTION,
  USERS_COLLECTION,
} from '@/shared/constants/firestore';
import {
  FEEDBACK_MAX_REPORTS_PER_HOUR,
  FEEDBACK_MAX_TOTAL_BYTES,
  FEEDBACK_SCHEMA_VERSION,
  FEEDBACK_SESSION_TTL_MS,
  feedbackActivityDocumentSchema,
  feedbackAreaFlags,
  feedbackAttachmentIntentDocumentSchema,
  feedbackReportDocumentSchema,
  feedbackPublicSessionSchema,
  feedbackSessionDocumentSchema,
  feedbackThrottleDocumentSchema,
  type FeedbackAttachmentDescriptor,
  type FeedbackReceipt,
  type FeedbackSessionDocument,
  type FeedbackSubmitRequest,
} from '@/shared/student-feedback';
import { FeedbackError, invalidFeedbackDocument } from './http.server';
import { validateFeedbackLessonInTransaction } from './lessons.server';
import { estimateFirestoreDocumentBytes } from '@/src/lib/tests/firestore-size';
import {
  assertFeedbackSessionOwner as assertSessionOwner,
  assertOpenFeedbackSession,
  feedbackSessionNotFound as sessionNotFound,
  parseFeedbackSession as parseSession,
} from '@/src/lib/student-feedback/session.server';

const HOUR_MS = 60 * 60 * 1000;
const ACTIVE_ATTACHMENT_STATUSES = ['reserved', 'finalizing', 'ready'] as const;

export async function createFeedbackSession(
  uid: string,
  sessionId: string,
  db: Firestore = adminDb,
  nowMs = Date.now()
): Promise<FeedbackSessionDocument> {
  const ref = db.collection(STUDENT_FEEDBACK_SESSIONS_COLLECTION).doc(sessionId);
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const session = parseSession(existing.data(), sessionId);
      assertSessionOwner(session, uid);
      return session;
    }
    const now = new Date(nowMs).toISOString();
    const session = feedbackSessionDocumentSchema.parse({
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
      id: sessionId,
      ownerUid: uid,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      expiresAtMs: nowMs + FEEDBACK_SESSION_TTL_MS,
      totalReservedBytes: 0,
      attachmentCount: 0,
      receipt: null,
      cleanupLease: null,
      tombstoneUntilMs: null,
    });
    transaction.create(ref, session);
    return session;
  });
}

export async function getFeedbackSession(
  uid: string,
  sessionId: string,
  db: Firestore = adminDb
): Promise<FeedbackSessionDocument> {
  const snapshot = await db.collection(STUDENT_FEEDBACK_SESSIONS_COLLECTION).doc(sessionId).get();
  if (!snapshot.exists) sessionNotFound();
  const session = parseSession(snapshot.data(), sessionId);
  assertSessionOwner(session, uid);
  return session;
}

export async function getPublicFeedbackSession(uid: string, sessionId: string, db: Firestore = adminDb) {
  const session = await getFeedbackSession(uid, sessionId, db);
  if (session.status !== 'open') {
    return feedbackPublicSessionSchema.parse({
      id: session.id,
      status: session.status,
      expiresAtMs: session.expiresAtMs,
      receipt: session.receipt,
      attachments: [],
    });
  }
  const snapshot = await db.collection(STUDENT_FEEDBACK_SESSIONS_COLLECTION).doc(sessionId)
    .collection(STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION)
    .where('status', 'in', [...ACTIVE_ATTACHMENT_STATUSES]).limit(6).get();
  if (snapshot.size > 5) invalidFeedbackDocument('Feedback session has too many active attachments');
  const attachments = snapshot.docs.map(document => {
    const parsed = feedbackAttachmentIntentDocumentSchema.safeParse(document.data());
    if (!parsed.success || parsed.data.id !== document.id || parsed.data.sessionId !== sessionId || parsed.data.ownerUid !== uid) {
      invalidFeedbackDocument('Attachment reservation data is invalid');
    }
    const item = parsed.data;
    return {
      id: item.id,
      originalName: item.originalName,
      contentType: item.contentType,
      sizeBytes: item.reservedBytes,
      status: item.status,
    };
  });
  return feedbackPublicSessionSchema.parse({
    id: session.id,
    status: session.status,
    expiresAtMs: session.expiresAtMs,
    receipt: session.receipt,
    attachments,
  });
}

function identitySnapshot(uid: string, token: DecodedIdToken, rawProfile: unknown) {
  const profile = rawProfile && typeof rawProfile === 'object' && !Array.isArray(rawProfile)
    ? rawProfile as Record<string, unknown>
    : {};
  const first = typeof profile.firstName === 'string' ? profile.firstName.trim() : '';
  const last = typeof profile.lastName === 'string' ? profile.lastName.trim() : '';
  const username = typeof profile.username === 'string' ? profile.username.trim() : '';
  const tokenEmail = typeof token.email === 'string' ? token.email.trim() : '';
  // The profile is client-editable; only verified Auth claims may identify an email.
  const email = tokenEmail.slice(0, 320) || null;
  const displayName = ([first, last].filter(Boolean).join(' ') || username ||
    (typeof token.name === 'string' ? token.name.trim() : '')).slice(0, 300) || null;
  return { uid, displayName, email, emailNormalized: email?.toLowerCase() ?? null };
}

function selectedReadyAttachments(
  documents: Array<{ id: string; data(): unknown }>,
  session: FeedbackSessionDocument,
  selectedIds: string[]
): FeedbackAttachmentDescriptor[] {
  const selected = new Set(selectedIds);
  const active = new Map<string, FeedbackAttachmentDescriptor>();
  let activeBytes = 0;
  for (const document of documents) {
    const parsed = feedbackAttachmentIntentDocumentSchema.safeParse(document.data());
    if (!parsed.success || parsed.data.id !== document.id) invalidFeedbackDocument('Attachment reservation data is invalid');
    const intent = parsed.data;
    if (intent.sessionId !== session.id || intent.ownerUid !== session.ownerUid) {
      invalidFeedbackDocument('Attachment reservation ownership is invalid');
    }
    if (intent.status === 'cancelled') invalidFeedbackDocument('Active attachment query returned a cancelled intent');
    activeBytes += intent.reservedBytes;
    if (intent.status !== 'ready' || !intent.verified) {
      throw new FeedbackError('FEEDBACK_ATTACHMENT_NOT_READY', 'Finish or remove every upload before submitting', 409);
    }
    if (intent.verified.storagePath !== `student-feedback/private/${session.id}/${intent.id}`) {
      invalidFeedbackDocument('Verified attachment storage path is invalid');
    }
    active.set(intent.id, intent.verified);
  }
  if (active.size !== session.attachmentCount || activeBytes !== session.totalReservedBytes) {
    invalidFeedbackDocument('Attachment reservation totals are inconsistent');
  }
  if (active.size !== selected.size || [...active.keys()].some(id => !selected.has(id))) {
    throw new FeedbackError('FEEDBACK_ATTACHMENT_NOT_READY', 'Finish or remove every upload before submitting', 409);
  }
  const descriptors = selectedIds.map(id => {
    const descriptor = active.get(id);
    if (!descriptor) throw new FeedbackError('FEEDBACK_ATTACHMENT_NOT_READY', 'Attachment is not ready', 409);
    return descriptor;
  });
  if (descriptors.reduce((sum, item) => sum + item.sizeBytes, 0) > FEEDBACK_MAX_TOTAL_BYTES) {
    throw new FeedbackError('FEEDBACK_ATTACHMENT_LIMIT', 'Attachments exceed 200 MiB', 409);
  }
  return descriptors;
}

/** Session receipt is the idempotency record, even if the original HTTP response was lost. */
export async function submitFeedback(
  token: DecodedIdToken,
  input: FeedbackSubmitRequest,
  db: Firestore = adminDb,
  nowMs?: number
): Promise<FeedbackReceipt> {
  const uid = token.uid;
  const sessionRef = db.collection(STUDENT_FEEDBACK_SESSIONS_COLLECTION).doc(input.sessionId);
  const reportRef = db.collection(STUDENT_FEEDBACK_COLLECTION).doc(input.sessionId);
  const throttleRef = db.collection(STUDENT_FEEDBACK_THROTTLES_COLLECTION).doc(uid);
  const profileRef = db.collection(USERS_COLLECTION).doc(uid);

  return db.runTransaction(async transaction => {
    // A retried transaction must re-check expiry and the rolling quota at its own time.
    const attemptNowMs = nowMs ?? Date.now();
    const sessionSnapshot = await transaction.get(sessionRef);
    if (!sessionSnapshot.exists) sessionNotFound();
    const session = parseSession(sessionSnapshot.data(), input.sessionId);
    assertSessionOwner(session, uid);
    if (session.status === 'submitted' && session.receipt) {
      const existingReport = await transaction.get(reportRef);
      const parsed = feedbackReportDocumentSchema.safeParse(existingReport.data());
      if (
        !existingReport.exists || !parsed.success || parsed.data.id !== session.id ||
        parsed.data.sessionId !== session.id || parsed.data.submitter.uid !== uid ||
        parsed.data.createdAt !== session.receipt.submittedAt
      ) invalidFeedbackDocument('Feedback receipt has no matching report');
      return session.receipt;
    }
    assertOpenFeedbackSession(session, uid, attemptNowMs);

    const [reportSnapshot, intentSnapshot, profileSnapshot, throttleSnapshot] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(sessionRef.collection(STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION)
        .where('status', 'in', [...ACTIVE_ATTACHMENT_STATUSES]).limit(6)),
      transaction.get(profileRef),
      transaction.get(throttleRef),
    ]);
    if (reportSnapshot.exists) invalidFeedbackDocument('Feedback report exists without a submitted receipt');
    if (intentSnapshot.size > 5) invalidFeedbackDocument('Feedback session has too many active attachments');
    const attachments = selectedReadyAttachments(intentSnapshot.docs, session, input.attachmentIds);
    const lesson = input.lessonId
      ? await validateFeedbackLessonInTransaction(transaction, db, uid, input.lessonId, input.pageContext)
      : null;

    const recentSubmissions = throttleSnapshot.exists
      ? (() => {
          const parsed = feedbackThrottleDocumentSchema.safeParse(throttleSnapshot.data());
          if (!parsed.success || parsed.data.uid !== uid) invalidFeedbackDocument('Feedback quota data is invalid');
          return parsed.data.submittedAtMs.filter(timestamp => timestamp > attemptNowMs - HOUR_MS);
        })()
      : [];
    if (recentSubmissions.length >= FEEDBACK_MAX_REPORTS_PER_HOUR) {
      throw new FeedbackError('FEEDBACK_REPORT_QUOTA', 'You have submitted 10 reports in the last hour', 429);
    }

    const now = new Date(attemptNowMs).toISOString();
    const receipt = { feedbackId: input.sessionId, submittedAt: now };
    const report = feedbackReportDocumentSchema.parse({
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
      id: input.sessionId,
      sessionId: input.sessionId,
      submitter: identitySnapshot(uid, token, profileSnapshot.data()),
      type: input.type,
      ...(input.severity ? { severity: input.severity } : {}),
      areas: input.areas,
      ...(input.otherAreaExplanation ? { otherAreaExplanation: input.otherAreaExplanation } : {}),
      description: input.description,
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.comments !== undefined ? { comments: input.comments } : {}),
      areaFlags: feedbackAreaFlags(input.areas),
      lesson,
      attachments,
      diagnostics: input.diagnostics,
      createdAt: now,
      updatedAt: now,
      status: 'unresolved',
      resolvedBy: null,
      resolvedAt: null,
      resolutionReason: null,
      archived: false,
      archivedBy: null,
      archivedAt: null,
      stateRevision: 0,
    });
    const activity = feedbackActivityDocumentSchema.parse({
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
      id: 'submitted',
      feedbackId: input.sessionId,
      kind: 'submitted',
      actorUid: uid,
      actorDisplayName: report.submitter.displayName,
      createdAt: now,
      reason: null,
      note: null,
      requestId: null,
    });
    const nextThrottle = feedbackThrottleDocumentSchema.parse({
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
      uid,
      submittedAtMs: [...recentSubmissions, attemptNowMs].sort((a, b) => a - b),
      updatedAt: now,
    });
    if (estimateFirestoreDocumentBytes(report) > 900 * 1024) {
      throw new FeedbackError('FEEDBACK_INVALID_DOCUMENT', 'Feedback report is too large', 413);
    }

    transaction.create(reportRef, report);
    transaction.create(reportRef.collection(STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION).doc(activity.id), activity);
    transaction.set(throttleRef, nextThrottle);
    transaction.update(sessionRef, { status: 'submitted', receipt, updatedAt: now });
    return receipt;
  });
}
