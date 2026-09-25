import { randomUUID } from 'node:crypto';
import type { Bucket } from '@google-cloud/storage';
import type { Firestore } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/src/services/firebase-admin';
import {
  STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION,
  STUDENT_FEEDBACK_COLLECTION,
  STUDENT_FEEDBACK_SESSIONS_COLLECTION,
} from '@/shared/constants/firestore';
import {
  FEEDBACK_MAX_ATTACHMENTS,
  FEEDBACK_MAX_TOTAL_BYTES,
  FEEDBACK_SCHEMA_VERSION,
  feedbackAttachmentIntentDocumentSchema,
  feedbackReportDocumentSchema,
  type FeedbackAttachmentDescriptor,
  type FeedbackAttachmentIntentDocument,
  type FeedbackPublicAttachment,
} from '@/shared/student-feedback';
import { FeedbackError, invalidFeedbackDocument } from './http.server';
import {
  assertOpenFeedbackSession as assertOpenSession,
  parseFeedbackSession as parseSession,
} from '@/src/lib/student-feedback/session.server';
import {
  assertFeedbackPrivatePath,
  deleteFeedbackObjectGeneration,
  feedbackPrivatePath,
  feedbackStagingPath,
  inspectFeedbackStagingObject,
  isObjectNotFound,
  isPreconditionFailure,
} from './media.server';

const FINALIZE_LEASE_MS = 5 * 60 * 1000;
// Keep a cancelled in-flight copy discoverable beyond any single HTTP request.
const CANCELLED_COPY_CLEANUP_HOLD_MS = 24 * 60 * 60 * 1000;
const ADMIN_URL_TTL_MS = 5 * 60 * 1000;

export type FeedbackAttachmentPublic = FeedbackPublicAttachment;

export function publicFeedbackAttachment(intent: FeedbackAttachmentIntentDocument): FeedbackAttachmentPublic {
  return {
    id: intent.id,
    originalName: intent.originalName,
    contentType: intent.contentType,
    sizeBytes: intent.reservedBytes,
    status: intent.status,
  };
}

function sessionRef(db: Firestore, sessionId: string) {
  return db.collection(STUDENT_FEEDBACK_SESSIONS_COLLECTION).doc(sessionId);
}

function intentRef(db: Firestore, sessionId: string, attachmentId: string) {
  return sessionRef(db, sessionId).collection(STUDENT_FEEDBACK_ATTACHMENTS_SUBCOLLECTION).doc(attachmentId);
}

function parseIntent(raw: unknown, sessionId: string, attachmentId: string): FeedbackAttachmentIntentDocument {
  const result = feedbackAttachmentIntentDocumentSchema.safeParse(raw);
  if (!result.success || result.data.id !== attachmentId || result.data.sessionId !== sessionId) {
    invalidFeedbackDocument('Feedback attachment data is invalid');
  }
  return result.data;
}

function assertIntentOwner(intent: FeedbackAttachmentIntentDocument, uid: string): void {
  if (intent.ownerUid !== uid) throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Attachment not found', 404);
}

export async function reserveFeedbackAttachment(
  uid: string,
  sessionId: string,
  input: { attachmentId: string; originalName: string; contentType: FeedbackAttachmentIntentDocument['contentType']; sizeBytes: number },
  db: Firestore = adminDb,
  nowMs = Date.now()
): Promise<{ attachment: FeedbackAttachmentPublic; stagingPath: string }> {
  const sessionDocument = sessionRef(db, sessionId);
  const intentDocument = intentRef(db, sessionId, input.attachmentId);
  const intent = await db.runTransaction(async transaction => {
    const [sessionSnapshot, intentSnapshot] = await Promise.all([
      transaction.get(sessionDocument),
      transaction.get(intentDocument),
    ]);
    if (!sessionSnapshot.exists) throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Feedback session not found', 404);
    const session = parseSession(sessionSnapshot.data(), sessionId);
    assertOpenSession(session, uid, nowMs);
    if (intentSnapshot.exists) {
      const existing = parseIntent(intentSnapshot.data(), sessionId, input.attachmentId);
      assertIntentOwner(existing, uid);
      if (existing.status === 'cancelled' || existing.originalName !== input.originalName ||
        existing.contentType !== input.contentType || existing.reservedBytes !== input.sizeBytes) {
        throw new FeedbackError('FEEDBACK_REQUEST_CONFLICT', 'Attachment reservation ID was already used', 409);
      }
      return existing;
    }
    if (session.attachmentCount >= FEEDBACK_MAX_ATTACHMENTS ||
      session.totalReservedBytes + input.sizeBytes > FEEDBACK_MAX_TOTAL_BYTES) {
      throw new FeedbackError('FEEDBACK_ATTACHMENT_LIMIT', 'Attachment count or total size exceeds the report limit', 409);
    }
    const now = new Date(nowMs).toISOString();
    const created = feedbackAttachmentIntentDocumentSchema.parse({
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
      id: input.attachmentId,
      sessionId,
      ownerUid: uid,
      originalName: input.originalName,
      contentType: input.contentType,
      reservedBytes: input.sizeBytes,
      status: 'reserved',
      createdAt: now,
      updatedAt: now,
      lease: null,
      verified: null,
      cleanupPending: false,
      cleanupAfterMs: null,
    });
    transaction.create(intentDocument, created);
    transaction.update(sessionDocument, {
      attachmentCount: session.attachmentCount + 1,
      totalReservedBytes: session.totalReservedBytes + input.sizeBytes,
      updatedAt: now,
    });
    return created;
  });
  return { attachment: publicFeedbackAttachment(intent), stagingPath: feedbackStagingPath(uid, sessionId, input.attachmentId) };
}

async function claimFinalizeLease(
  uid: string,
  sessionId: string,
  attachmentId: string,
  db: Firestore,
  nowMs: number
): Promise<{ intent: FeedbackAttachmentIntentDocument; leaseId: string | null }> {
  return db.runTransaction(async transaction => {
    const [sessionSnapshot, intentSnapshot] = await Promise.all([
      transaction.get(sessionRef(db, sessionId)),
      transaction.get(intentRef(db, sessionId, attachmentId)),
    ]);
    if (!sessionSnapshot.exists || !intentSnapshot.exists) throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Attachment not found', 404);
    const session = parseSession(sessionSnapshot.data(), sessionId);
    const intent = parseIntent(intentSnapshot.data(), sessionId, attachmentId);
    assertOpenSession(session, uid, nowMs);
    assertIntentOwner(intent, uid);
    if (intent.status === 'ready') return { intent, leaseId: null };
    if (intent.status === 'cancelled') throw new FeedbackError('FEEDBACK_SESSION_CLOSED', 'Attachment was removed', 409);
    if (intent.status === 'finalizing' && intent.lease && intent.lease.expiresAtMs > nowMs) {
      throw new FeedbackError('FEEDBACK_ATTACHMENT_NOT_READY', 'Attachment is still processing', 409);
    }
    const leaseId = randomUUID();
    transaction.update(intentRef(db, sessionId, attachmentId), {
      status: 'finalizing',
      lease: { id: leaseId, expiresAtMs: nowMs + FINALIZE_LEASE_MS },
      updatedAt: new Date(nowMs).toISOString(),
    });
    return { intent, leaseId };
  });
}

async function copyVerifiedFeedbackObject(
  bucket: Bucket,
  uid: string,
  sessionId: string,
  intent: FeedbackAttachmentIntentDocument
): Promise<{ descriptor: FeedbackAttachmentDescriptor; sourceGeneration: string }> {
  const inspected = await inspectFeedbackStagingObject(bucket, uid, sessionId, intent.id, intent);
  const source = bucket.file(feedbackStagingPath(uid, sessionId, intent.id), { generation: inspected.sourceGeneration });
  const destinationPath = feedbackPrivatePath(sessionId, intent.id);
  const destination = bucket.file(destinationPath);
  try {
    await source.copy(destination, {
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {},
      contentType: intent.contentType,
      contentDisposition: 'attachment',
      cacheControl: 'private, no-store',
    });
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
    // The copy may have committed before a lost response. The private path is
    // server-only and session IDs are never reused; verify its content below.
  }
  const [copied] = await destination.getMetadata();
  if (copied.contentType !== intent.contentType || Number(copied.size) !== intent.reservedBytes ||
    (inspected.crc32c && copied.crc32c !== inspected.crc32c)) {
    invalidFeedbackDocument('Canonical attachment does not match verified staging object');
  }
  if (copied.metadata && Object.keys(copied.metadata).some(key => key.toLowerCase() === 'firebasestoragedownloadtokens')) {
    invalidFeedbackDocument('Canonical attachment contains a download token');
  }
  const generation = String(copied.generation ?? '');
  const descriptor = {
    ...inspected.descriptor,
    generation,
  };
  if (!/^\d+$/.test(generation)) invalidFeedbackDocument('Canonical attachment generation is invalid');
  assertFeedbackPrivatePath(descriptor, sessionId);
  return { descriptor, sourceGeneration: inspected.sourceGeneration };
}

async function deleteCurrentFeedbackObject(bucket: Bucket, path: string): Promise<void> {
  let metadata;
  try {
    [metadata] = await bucket.file(path).getMetadata();
  } catch (error) {
    if (isObjectNotFound(error)) return;
    throw error;
  }
  const generation = String(metadata.generation ?? '');
  if (!/^\d+$/.test(generation)) invalidFeedbackDocument('Attachment generation is invalid');
  await deleteFeedbackObjectGeneration(bucket, path, generation);
}

async function clearAttachmentCleanupPending(
  db: Firestore,
  sessionId: string,
  attachmentId: string,
  expectedStatus: 'ready' | 'cancelled'
): Promise<void> {
  const ref = intentRef(db, sessionId, attachmentId);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const intent = parseIntent(snapshot.data(), sessionId, attachmentId);
    if (intent.status === expectedStatus && intent.cleanupPending) {
      transaction.update(ref, { cleanupPending: false, cleanupAfterMs: null, updatedAt: new Date().toISOString() });
    }
  });
}

export async function finalizeFeedbackAttachment(
  uid: string,
  sessionId: string,
  attachmentId: string,
  db: Firestore = adminDb,
  bucket: Bucket = adminStorage.bucket(),
  nowMs = Date.now()
): Promise<FeedbackAttachmentPublic> {
  const claim = await claimFinalizeLease(uid, sessionId, attachmentId, db, nowMs);
  if (claim.leaseId === null) return publicFeedbackAttachment(claim.intent);
  let copied: Awaited<ReturnType<typeof copyVerifiedFeedbackObject>>;
  try {
    copied = await copyVerifiedFeedbackObject(bucket, uid, sessionId, claim.intent);
  } catch (error) {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(intentRef(db, sessionId, attachmentId));
      if (!snapshot.exists) return;
      const intent = parseIntent(snapshot.data(), sessionId, attachmentId);
      if (intent.status === 'finalizing' && intent.lease?.id === claim.leaseId) {
        transaction.update(intentRef(db, sessionId, attachmentId), {
          status: 'reserved', lease: null, updatedAt: new Date().toISOString(),
        });
      }
    });
    throw error;
  }
  const { descriptor } = copied;
  let committed: FeedbackAttachmentIntentDocument;
  try {
    committed = await db.runTransaction(async transaction => {
      const [sessionSnapshot, intentSnapshot] = await Promise.all([
        transaction.get(sessionRef(db, sessionId)),
        transaction.get(intentRef(db, sessionId, attachmentId)),
      ]);
      if (!sessionSnapshot.exists || !intentSnapshot.exists) throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Attachment not found', 404);
      const session = parseSession(sessionSnapshot.data(), sessionId);
      const intent = parseIntent(intentSnapshot.data(), sessionId, attachmentId);
      assertOpenSession(session, uid, Date.now());
      assertIntentOwner(intent, uid);
      if (intent.status !== 'finalizing' || intent.lease?.id !== claim.leaseId || intent.lease.expiresAtMs <= Date.now()) {
        throw new FeedbackError('FEEDBACK_ATTACHMENT_NOT_READY', 'Attachment processing lease changed', 409);
      }
      const now = new Date().toISOString();
      const ready = feedbackAttachmentIntentDocumentSchema.parse({
        ...intent, status: 'ready', lease: null, verified: descriptor, cleanupPending: true,
        cleanupAfterMs: Date.now(), updatedAt: now,
      });
      transaction.update(intentRef(db, sessionId, attachmentId), {
        status: ready.status, lease: null, verified: ready.verified, cleanupPending: true,
        cleanupAfterMs: ready.cleanupAfterMs, updatedAt: now,
      });
      return ready;
    });
  } catch (error) {
    // A copy can complete after removal's immediate delete. Re-arm the durable
    // marker even if a cleanup pass ran while the request was in flight.
    try {
      await db.runTransaction(async transaction => {
        const ref = intentRef(db, sessionId, attachmentId);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return;
        const current = parseIntent(snapshot.data(), sessionId, attachmentId);
        if (current.status === 'cancelled') {
          transaction.update(ref, {
            cleanupPending: true,
            cleanupAfterMs: Date.now() + CANCELLED_COPY_CLEANUP_HOLD_MS,
            updatedAt: new Date().toISOString(),
          });
        }
      });
    } catch {
      // The cancellation transaction already committed its retry marker.
    }
    throw error;
  }
  try {
    await deleteFeedbackObjectGeneration(bucket, feedbackStagingPath(uid, sessionId, attachmentId), copied.sourceGeneration);
    await clearAttachmentCleanupPending(db, sessionId, attachmentId, 'ready');
  } catch {
    // The durable cleanupPending marker remains for the scheduled worker.
  }
  return publicFeedbackAttachment(committed);
}

export async function removeFeedbackAttachment(
  uid: string,
  sessionId: string,
  attachmentId: string,
  db: Firestore = adminDb,
  bucket: Bucket = adminStorage.bucket(),
  nowMs = Date.now()
): Promise<FeedbackAttachmentPublic> {
  const result = await db.runTransaction(async transaction => {
    const [sessionSnapshot, intentSnapshot] = await Promise.all([
      transaction.get(sessionRef(db, sessionId)),
      transaction.get(intentRef(db, sessionId, attachmentId)),
    ]);
    if (!sessionSnapshot.exists || !intentSnapshot.exists) throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Attachment not found', 404);
    const session = parseSession(sessionSnapshot.data(), sessionId);
    const intent = parseIntent(intentSnapshot.data(), sessionId, attachmentId);
    assertOpenSession(session, uid, nowMs);
    assertIntentOwner(intent, uid);
    if (intent.status === 'cancelled') return { intent, verified: null, copyWasInFlight: intent.cleanupAfterMs !== null && intent.cleanupAfterMs > nowMs };
    if (session.attachmentCount < 1 || session.totalReservedBytes < intent.reservedBytes) {
      invalidFeedbackDocument('Attachment reservation totals are inconsistent');
    }
    const now = new Date(nowMs).toISOString();
    const copyWasInFlight = intent.status === 'finalizing';
    transaction.update(intentRef(db, sessionId, attachmentId), {
      status: 'cancelled', lease: null, verified: null, cleanupPending: true,
      cleanupAfterMs: copyWasInFlight ? nowMs + CANCELLED_COPY_CLEANUP_HOLD_MS : nowMs,
      updatedAt: now,
    });
    transaction.update(sessionRef(db, sessionId), {
      attachmentCount: session.attachmentCount - 1,
      totalReservedBytes: session.totalReservedBytes - intent.reservedBytes,
      updatedAt: now,
    });
    return { intent, verified: intent.verified, copyWasInFlight };
  });
  const staging = feedbackStagingPath(uid, sessionId, attachmentId);
  const canonical = feedbackPrivatePath(sessionId, attachmentId);
  try {
    await Promise.all([
      deleteCurrentFeedbackObject(bucket, staging),
      deleteCurrentFeedbackObject(bucket, canonical),
    ]);
    if (!result.copyWasInFlight) await clearAttachmentCleanupPending(db, sessionId, attachmentId, 'cancelled');
  } catch {
    // Keep cleanupPending for retry; removal still succeeds for the student.
  }
  return { ...publicFeedbackAttachment(result.intent), status: 'cancelled' };
}

export async function getAdminFeedbackAttachmentUrl(
  feedbackId: string,
  attachmentId: string,
  disposition: 'inline' | 'attachment' = 'attachment',
  db: Firestore = adminDb,
  bucket: Bucket = adminStorage.bucket(),
  nowMs = Date.now()
): Promise<{ url: string; expiresAt: string }> {
  const snapshot = await db.collection(STUDENT_FEEDBACK_COLLECTION).doc(feedbackId).get();
  if (!snapshot.exists) throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Feedback report not found', 404);
  const parsed = feedbackReportDocumentSchema.safeParse(snapshot.data());
  if (!parsed.success || parsed.data.id !== feedbackId || parsed.data.sessionId !== feedbackId) {
    invalidFeedbackDocument('Feedback report data is invalid');
  }
  const descriptor = parsed.data.attachments.find(item => item.id === attachmentId);
  if (!descriptor) throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Feedback attachment not found', 404);
  assertFeedbackPrivatePath(descriptor, feedbackId);
  const file = bucket.file(descriptor.storagePath, { generation: descriptor.generation });
  let metadata;
  try {
    [metadata] = await file.getMetadata();
  } catch (error) {
    if (isObjectNotFound(error)) throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Feedback attachment not found', 404);
    throw error;
  }
  if (String(metadata.generation) !== descriptor.generation || metadata.contentType !== descriptor.contentType ||
    Number(metadata.size) !== descriptor.sizeBytes) invalidFeedbackDocument('Feedback attachment metadata changed');
  if (metadata.metadata && Object.keys(metadata.metadata).some(key => key.toLowerCase() === 'firebasestoragedownloadtokens')) {
    invalidFeedbackDocument('Feedback attachment has a download token');
  }
  const extensionByMime: Record<FeedbackAttachmentDescriptor['contentType'], string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  const stem = descriptor.originalName.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100) || 'attachment';
  const safeName = `${stem}${extensionByMime[descriptor.contentType]}`;
  const safeDisposition = disposition === 'inline' && descriptor.contentType !== 'video/quicktime' ? 'inline' : 'attachment';
  const expiresAt = new Date(nowMs + ADMIN_URL_TTL_MS).toISOString();
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: nowMs + ADMIN_URL_TTL_MS,
    queryParams: { generation: descriptor.generation },
    responseDisposition: `${safeDisposition}; filename="${safeName}"`,
    responseType: descriptor.contentType,
  });
  return { url, expiresAt };
}
