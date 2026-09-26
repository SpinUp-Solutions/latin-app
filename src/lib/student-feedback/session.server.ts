import type { DecodedIdToken } from 'firebase-admin/auth';
import { feedbackSessionDocumentSchema, type FeedbackSessionDocument } from '@/shared/student-feedback';
import { FeedbackError, invalidFeedbackDocument } from '@/src/lib/student-feedback/http.server';

export function feedbackSessionNotFound(): never {
  throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Feedback session not found', 404);
}

export function parseFeedbackSession(data: unknown, id: string): FeedbackSessionDocument {
  const parsed = feedbackSessionDocumentSchema.safeParse(data);
  if (!parsed.success || parsed.data.id !== id || (parsed.data.receipt && parsed.data.receipt.feedbackId !== id)) {
    invalidFeedbackDocument('Feedback session data is invalid');
  }
  return parsed.data;
}

export function assertFeedbackSessionOwner(session: FeedbackSessionDocument, uid: string): void {
  if (session.ownerUid !== uid) feedbackSessionNotFound();
}

export function assertOpenFeedbackSession(session: FeedbackSessionDocument, uid: string, nowMs: number): void {
  assertFeedbackSessionOwner(session, uid);
  // Cleanup changes the persisted status, but clients still need expiry recovery.
  if (session.status === 'cleanup' || session.status === 'expired' ||
    (session.status === 'open' && nowMs >= session.expiresAtMs)) {
    throw new FeedbackError('FEEDBACK_SESSION_EXPIRED', 'Feedback session expired', 409);
  }
  if (session.status !== 'open') {
    throw new FeedbackError('FEEDBACK_SESSION_CLOSED', 'Feedback session is closed', 409);
  }
}

export function feedbackActorName(token: DecodedIdToken, rawProfile: unknown): string | null {
  const profile = rawProfile && typeof rawProfile === 'object' && !Array.isArray(rawProfile)
    ? rawProfile as Record<string, unknown>
    : {};
  const first = typeof profile.firstName === 'string' ? profile.firstName.trim() : '';
  const last = typeof profile.lastName === 'string' ? profile.lastName.trim() : '';
  const name = [first, last].filter(Boolean).join(' ') ||
    (typeof profile.username === 'string' ? profile.username.trim() : '') ||
    (typeof token.name === 'string' ? token.name.trim() : '');
  return name.slice(0, 300) || null;
}
