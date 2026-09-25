import {
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_REPORTS_PER_HOUR,
  FEEDBACK_MAX_VIDEO_BYTES,
  feedbackActivityDocumentSchema,
  feedbackAreaFlags,
  feedbackAttachmentIntentDocumentSchema,
  feedbackReportDocumentSchema,
  feedbackSessionDocumentSchema,
  feedbackThrottleDocumentSchema,
  reserveFeedbackAttachmentRequestSchema,
  submitFeedbackRequestSchema,
} from '@/shared/student-feedback';

const sessionId = '11111111-1111-4111-8111-111111111111';
const attachmentId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-09-24T00:00:00.000Z';

const submission = () => ({
  sessionId,
  type: 'bug_report' as const,
  severity: 'major' as const,
  areas: ['lessons', 'other'] as const,
  otherAreaExplanation: 'A navigation edge case',
  description: 'The next lesson did not open.',
  lessonId: 'lesson-a',
  pageContext: { pageId: 'page-1', pageIndex: 0, revision: 3 },
  attachmentIds: [attachmentId],
  diagnostics: { entryPoint: 'lesson' as const, route: '/lessons/lesson-a' },
});

const report = () => ({
  schemaVersion: 1,
  id: sessionId,
  sessionId,
  submitter: { uid: 'user-1', displayName: null, email: 'USER@example.com', emailNormalized: 'user@example.com' },
  type: 'bug_report',
  severity: 'major',
  areas: ['lessons', 'other'],
  areaFlags: feedbackAreaFlags(['lessons', 'other']),
  otherAreaExplanation: 'A navigation edge case',
  description: 'The next lesson did not open.',
  lesson: { id: 'lesson-a', title: 'Lesson A', pageId: 'page-1', pageIndex: 0, pageTitle: null, revision: 3 },
  attachments: [{
    id: attachmentId,
    originalName: 'example.png',
    storagePath: `student-feedback/private/${sessionId}/${attachmentId}`,
    contentType: 'image/png',
    sizeBytes: 100,
    generation: '12345678901234567890',
  }],
  diagnostics: { entryPoint: 'lesson', route: '/lessons/lesson-a' },
  createdAt: timestamp,
  updatedAt: timestamp,
  status: 'unresolved',
  resolvedBy: null,
  resolvedAt: null,
  resolutionReason: null,
  archived: false,
  archivedBy: null,
  archivedAt: null,
  stateRevision: 0,
});

describe('student feedback contracts', () => {
  it('accepts trimmed form fields and enforces conditional severity and Other explanation', () => {
    const parsed = submitFeedbackRequestSchema.parse({ ...submission(), description: '  Line one\nLine two  ' });
    expect(parsed.description).toBe('Line one\nLine two');
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), severity: undefined }).success).toBe(false);
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), type: 'general' }).success).toBe(false);
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), otherAreaExplanation: undefined }).success).toBe(false);
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), areas: ['lessons'] }).success).toBe(false);
  });

  it('rejects duplicate areas, spoofed actor fields, and unsafe route diagnostics', () => {
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), areas: ['lessons', 'lessons'] }).success).toBe(false);
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), ownerUid: 'attacker' }).success).toBe(false);
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), diagnostics: { entryPoint: 'lesson', route: '/lessons/a?token=x' } }).success).toBe(false);
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), lessonId: null }).success).toBe(false);
  });

  it('enforces text and media boundaries with binary MiB units', () => {
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), description: 'x'.repeat(10_000) }).success).toBe(true);
    expect(submitFeedbackRequestSchema.safeParse({ ...submission(), description: 'x'.repeat(10_001) }).success).toBe(false);
    expect(reserveFeedbackAttachmentRequestSchema.safeParse({ attachmentId, originalName: 'a.png', contentType: 'image/png', sizeBytes: FEEDBACK_MAX_IMAGE_BYTES }).success).toBe(true);
    expect(reserveFeedbackAttachmentRequestSchema.safeParse({ attachmentId, originalName: 'a.png', contentType: 'image/png', sizeBytes: FEEDBACK_MAX_IMAGE_BYTES + 1 }).success).toBe(false);
    expect(reserveFeedbackAttachmentRequestSchema.safeParse({ attachmentId, originalName: 'a.mov', contentType: 'video/quicktime', sizeBytes: FEEDBACK_MAX_VIDEO_BYTES }).success).toBe(true);
    expect(reserveFeedbackAttachmentRequestSchema.safeParse({ attachmentId, originalName: 'a.svg', contentType: 'image/svg+xml', sizeBytes: 1 }).success).toBe(false);
  });

  it('fails closed on malformed report state, flags, or signed-URL metadata', () => {
    const valid = report();
    expect(feedbackReportDocumentSchema.safeParse(valid).success).toBe(true);
    expect(feedbackReportDocumentSchema.safeParse({ ...valid, areaFlags: feedbackAreaFlags(['lessons']) }).success).toBe(false);
    expect(feedbackReportDocumentSchema.safeParse({ ...valid, status: 'resolved' }).success).toBe(false);
    expect(feedbackReportDocumentSchema.safeParse({ ...valid, resolvedBy: 'admin-1' }).success).toBe(false);
    expect(feedbackReportDocumentSchema.safeParse({ ...valid, archivedAt: timestamp }).success).toBe(false);
    expect(feedbackReportDocumentSchema.safeParse({ ...valid, attachments: [{ ...valid.attachments[0], downloadUrl: 'https://example.test/private' }] }).success).toBe(false);
  });

  it('requires an owner-bound submitted session receipt and valid intent lifecycle', () => {
    const baseSession = {
      schemaVersion: 1, id: sessionId, ownerUid: 'user-1', status: 'open', createdAt: timestamp,
      updatedAt: timestamp, expiresAtMs: 1_000_000, totalReservedBytes: 100,
      attachmentCount: 1, receipt: null, cleanupLease: null, tombstoneUntilMs: null,
    };
    expect(feedbackSessionDocumentSchema.safeParse(baseSession).success).toBe(true);
    expect(feedbackSessionDocumentSchema.safeParse({ ...baseSession, status: 'submitted' }).success).toBe(false);
    expect(feedbackSessionDocumentSchema.safeParse({ ...baseSession, status: 'submitted', receipt: { feedbackId: sessionId, submittedAt: timestamp } }).success).toBe(true);

    const intent = {
      schemaVersion: 1, id: attachmentId, sessionId, ownerUid: 'user-1', originalName: 'example.png',
      contentType: 'image/png', reservedBytes: 100, status: 'reserved', createdAt: timestamp,
      updatedAt: timestamp, lease: null, verified: null, cleanupPending: false, cleanupAfterMs: null,
    };
    expect(feedbackAttachmentIntentDocumentSchema.safeParse(intent).success).toBe(true);
    expect(feedbackAttachmentIntentDocumentSchema.safeParse({ ...intent, status: 'ready' }).success).toBe(false);
    expect(feedbackAttachmentIntentDocumentSchema.safeParse({ ...intent, status: 'finalizing', lease: { id: sessionId, expiresAtMs: 2_000_000 } }).success).toBe(true);
    expect(feedbackAttachmentIntentDocumentSchema.safeParse({ ...intent, cleanupPending: true }).success).toBe(false);
    expect(feedbackAttachmentIntentDocumentSchema.safeParse({ ...intent, cleanupPending: true, cleanupAfterMs: 2_000_000 }).success).toBe(true);
  });

  it('bounds rolling rate history and requires idempotent private notes', () => {
    const throttle = { schemaVersion: 1, uid: 'user-1', submittedAtMs: Array.from({ length: FEEDBACK_MAX_REPORTS_PER_HOUR }, (_, i) => i), updatedAt: timestamp };
    expect(feedbackThrottleDocumentSchema.safeParse(throttle).success).toBe(true);
    expect(feedbackThrottleDocumentSchema.safeParse({ ...throttle, submittedAtMs: [...throttle.submittedAtMs, 10] }).success).toBe(false);
    expect(feedbackThrottleDocumentSchema.safeParse({ ...throttle, submittedAtMs: [2, 1] }).success).toBe(false);
    const note = {
      schemaVersion: 1, id: attachmentId, feedbackId: sessionId, kind: 'note', actorUid: 'admin-1',
      actorDisplayName: null, createdAt: timestamp, reason: null, note: 'Review privately', requestId: sessionId,
    };
    expect(feedbackActivityDocumentSchema.safeParse(note).success).toBe(true);
    expect(feedbackActivityDocumentSchema.safeParse({ ...note, requestId: null }).success).toBe(false);
  });
});
