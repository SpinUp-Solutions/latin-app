import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import {
  STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION,
  STUDENT_FEEDBACK_COLLECTION,
  USERS_COLLECTION,
} from '@/shared/constants/firestore';
import {
  FEEDBACK_MAX_REPORTS_PER_HOUR,
  feedbackReportSchema,
  type FeedbackActivity,
  type FeedbackReceipt,
  type FeedbackReport,
  type FeedbackSubmitRequest,
} from '@/shared/student-feedback';
import { FeedbackError, invalidFeedbackDocument } from './http.server';
import { readFeedbackLessonInTransaction } from './lessons.server';
import { deleteFeedbackReportAttachments, deleteFeedbackUploads, storeFeedbackAttachments } from './attachments.server';

const HOUR_MS = 60 * 60 * 1000;

export function feedbackActorName(token: DecodedIdToken, rawProfile: unknown): string | null {
  const profile =
    rawProfile && typeof rawProfile === 'object' && !Array.isArray(rawProfile) ? (rawProfile as Record<string, unknown>) : {};
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const name =
    [text(profile.firstName), text(profile.lastName)].filter(Boolean).join(' ') ||
    text(profile.username) ||
    text(token.name);
  return name.slice(0, 300) || null;
}

export function parseFeedbackReport(data: unknown, id: string): FeedbackReport {
  const parsed = feedbackReportSchema.safeParse(data);
  if (!parsed.success || parsed.data.id !== id) invalidFeedbackDocument('Feedback report data is invalid');
  return parsed.data;
}

function receiptFor(data: unknown, id: string, uid: string): FeedbackReceipt {
  const report = parseFeedbackReport(data, id);
  // Draft IDs are random UUIDs, so another student's ID means a forged request.
  if (report.submitter.uid !== uid) throw new FeedbackError('FEEDBACK_FORBIDDEN', 'This feedback ID is already in use', 409);
  return { feedbackId: id, submittedAt: report.createdAt };
}

/** Reads what a submission needs and applies the quota and lesson checks, or returns the receipt of a saved report. */
async function readSubmission(transaction: Transaction, db: Firestore, uid: string, input: FeedbackSubmitRequest, nowMs: number) {
  const recentQuery = db
    .collection(STUDENT_FEEDBACK_COLLECTION)
    .where('submitter.uid', '==', uid)
    .where('createdAt', '>=', new Date(nowMs - HOUR_MS).toISOString());
  const [reportSnapshot, profileSnapshot, recent, lesson] = await Promise.all([
    transaction.get(db.collection(STUDENT_FEEDBACK_COLLECTION).doc(input.draftId)),
    transaction.get(db.collection(USERS_COLLECTION).doc(uid)),
    transaction.get(recentQuery.count()),
    input.lessonId ? readFeedbackLessonInTransaction(transaction, db, input.lessonId, input.pageId) : Promise.resolve(null),
  ]);
  if (reportSnapshot.exists) return { receipt: receiptFor(reportSnapshot.data(), input.draftId, uid) };
  if (recent.data().count >= FEEDBACK_MAX_REPORTS_PER_HOUR) {
    throw new FeedbackError(
      'FEEDBACK_REPORT_QUOTA',
      `You can send ${FEEDBACK_MAX_REPORTS_PER_HOUR} reports per hour. Please try again later.`,
      429
    );
  }
  return { profile: profileSnapshot.data(), lesson };
}

/** The draft ID is the report ID, so a retried submit returns the original receipt instead of a duplicate. */
export async function submitFeedback(
  token: DecodedIdToken,
  input: FeedbackSubmitRequest,
  db: Firestore = adminDb,
  nowMs?: number
): Promise<FeedbackReceipt> {
  const uid = token.uid;
  const reportRef = db.collection(STUDENT_FEEDBACK_COLLECTION).doc(input.draftId);
  const existing = await reportRef.get();
  if (existing.exists) return receiptFor(existing.data(), input.draftId, uid);

  // Check before copying so a rejected submission leaves no files behind. The write transaction checks again.
  const preflight = await db.runTransaction(
    transaction => readSubmission(transaction, db, uid, input, nowMs ?? Date.now()),
    { readOnly: true }
  );
  if (preflight.receipt) return preflight.receipt;

  const attachments = await storeFeedbackAttachments(uid, input.draftId, input.attachments);

  let receipt: FeedbackReceipt;
  try {
    receipt = await db.runTransaction(async transaction => {
      const attemptNowMs = nowMs ?? Date.now();
      const submission = await readSubmission(transaction, db, uid, input, attemptNowMs);
      if (submission.receipt) return submission.receipt;

      const now = new Date(attemptNowMs).toISOString();
      // Only verified Auth claims identify an email; the profile is client-editable.
      const email = (typeof token.email === 'string' ? token.email.trim().slice(0, 320) : '') || null;
      const displayName = feedbackActorName(token, submission.profile);
      const report: FeedbackReport = {
        id: input.draftId,
        submitter: { uid, displayName, email, emailNormalized: email?.toLowerCase() ?? null },
        type: input.type,
        ...(input.severity ? { severity: input.severity } : {}),
        areas: input.areas,
        ...(input.otherAreaExplanation ? { otherAreaExplanation: input.otherAreaExplanation } : {}),
        description: input.description,
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        ...(input.comments ? { comments: input.comments } : {}),
        lesson: submission.lesson,
        attachments,
        diagnostics: input.diagnostics,
        createdAt: now,
        updatedAt: now,
        status: 'unresolved',
        archived: false,
      };
      const activity: FeedbackActivity = {
        id: 'submitted',
        kind: 'submitted',
        actorUid: uid,
        actorDisplayName: displayName,
        createdAt: now,
        reason: null,
        note: null,
      };
      transaction.create(reportRef, report);
      transaction.create(reportRef.collection(STUDENT_FEEDBACK_ACTIVITY_SUBCOLLECTION).doc(activity.id), activity);
      return { feedbackId: input.draftId, submittedAt: now };
    });
  } catch (error) {
    // A check refused the report, so nothing was written. Keep the copies only if a
    // concurrent submit of this draft has since saved a report that uses them.
    if (error instanceof FeedbackError) {
      const saved = await reportRef.get().then(snapshot => snapshot.exists, () => true);
      if (!saved) await deleteFeedbackReportAttachments(input.draftId, attachments);
    }
    throw error;
  }

  await deleteFeedbackUploads(uid, input.draftId, input.attachments);
  return receipt;
}
