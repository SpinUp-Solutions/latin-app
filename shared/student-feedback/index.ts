import { z } from 'zod';

/** Browser, Next server, and Firebase Functions share these contracts. */
export const FEEDBACK_SCHEMA_VERSION = 1 as const;
export const FEEDBACK_MAX_DESCRIPTION_LENGTH = 10_000;
export const FEEDBACK_MAX_COMMENTS_LENGTH = 5_000;
export const FEEDBACK_MAX_OTHER_EXPLANATION_LENGTH = 500;
export const FEEDBACK_MAX_ATTACHMENTS = 5;
export const FEEDBACK_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const FEEDBACK_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const FEEDBACK_MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const FEEDBACK_MAX_REPORTS_PER_HOUR = 10;
export const FEEDBACK_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const FEEDBACK_TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FEEDBACK_ADMIN_PAGE_SIZE = 25;

export const FEEDBACK_TYPES = ['bug_report', 'feature_suggestion', 'general'] as const;
export const FEEDBACK_SEVERITIES = ['blocking', 'major', 'minor'] as const;
export const FEEDBACK_AREAS = [
  'lessons',
  'exercises',
  'vocabulary',
  'dashboard',
  'account',
  'performance',
  'other',
] as const;
export const FEEDBACK_STATUSES = ['unresolved', 'resolved'] as const;
export const FEEDBACK_SESSION_STATUSES = ['open', 'submitted', 'cleanup', 'cancelled', 'expired'] as const;
export const FEEDBACK_ATTACHMENT_STATUSES = ['reserved', 'finalizing', 'ready', 'cancelled'] as const;
export const FEEDBACK_ACTIVITY_KINDS = ['submitted', 'resolved', 'reopened', 'archived', 'unarchived', 'note'] as const;

export const FEEDBACK_AREA_LABELS: Record<(typeof FEEDBACK_AREAS)[number], string> = {
  lessons: 'Lessons / lesson content',
  exercises: 'Exercises (multiple choice, translation, drag & drop, etc.)',
  vocabulary: 'Vocabulary viewer / dictionary',
  dashboard: 'Dashboard / progress tracking',
  account: 'Account / login',
  performance: 'Performance / loading speed',
  other: 'Other',
};

export const FEEDBACK_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'] as const;
export const FEEDBACK_IMAGE_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export const feedbackTypeSchema = z.enum(FEEDBACK_TYPES);
export const feedbackSeveritySchema = z.enum(FEEDBACK_SEVERITIES);
export const feedbackAreaSchema = z.enum(FEEDBACK_AREAS);
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
export const feedbackSessionStatusSchema = z.enum(FEEDBACK_SESSION_STATUSES);
export const feedbackAttachmentStatusSchema = z.enum(FEEDBACK_ATTACHMENT_STATUSES);
export const feedbackAreaFlagsSchema = z
  .object({
    lessons: z.boolean(),
    exercises: z.boolean(),
    vocabulary: z.boolean(),
    dashboard: z.boolean(),
    account: z.boolean(),
    performance: z.boolean(),
    other: z.boolean(),
  })
  .strict();

export function feedbackAreaFlags(areas: readonly z.infer<typeof feedbackAreaSchema>[]): z.infer<typeof feedbackAreaFlagsSchema> {
  const selected = new Set(areas);
  return {
    lessons: selected.has('lessons'),
    exercises: selected.has('exercises'),
    vocabulary: selected.has('vocabulary'),
    dashboard: selected.has('dashboard'),
    account: selected.has('account'),
    performance: selected.has('performance'),
    other: selected.has('other'),
  };
}

export const feedbackDocumentIdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(value => value !== '.' && value !== '..' && !value.includes('/'), 'Expected a document ID');

export const feedbackIsoTimestampSchema = z.string().refine(
  value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
  'Expected a canonical ISO-8601 timestamp'
);

export const feedbackUuidSchema = z.string().uuid();
const feedbackEpochMsSchema = z.number().int().nonnegative().safe();
const optionalReasonSchema = z.string().trim().min(1).max(2_000).optional();

export const feedbackPageContextSchema = z
  .object({
    pageId: feedbackDocumentIdSchema,
    pageIndex: z.number().int().nonnegative().safe(),
    revision: z.number().int().nonnegative().safe(),
  })
  .strict();

export const feedbackLessonOptionSchema = z
  .object({
    id: feedbackDocumentIdSchema,
    title: z.string().min(1).max(500),
    /** The lesson's version, using zero for legacy documents without one. */
    revision: z.number().int().nonnegative().safe(),
  })
  .strict();

export const feedbackDiagnosticsSchema = z
  .object({
    entryPoint: z.enum(['standalone', 'lesson']),
    appVersion: z.string().max(100).optional(),
    browser: z.string().max(300).optional(),
    viewport: z.object({ width: z.number().int().positive().max(100_000), height: z.number().int().positive().max(100_000) }).strict().optional(),
    route: z.string().max(512).refine(value => value.startsWith('/') && !/[?#]/.test(value), 'Expected a path without query or fragment').optional(),
  })
  .strict();

const feedbackFormFields = {
  type: feedbackTypeSchema,
  severity: feedbackSeveritySchema.optional(),
  areas: z.array(feedbackAreaSchema).min(1).max(FEEDBACK_AREAS.length),
  otherAreaExplanation: z.string().trim().min(1).max(FEEDBACK_MAX_OTHER_EXPLANATION_LENGTH).optional(),
  description: z.string().trim().min(1).max(FEEDBACK_MAX_DESCRIPTION_LENGTH),
  rating: z.number().int().min(1).max(5).optional(),
  comments: z.string().trim().max(FEEDBACK_MAX_COMMENTS_LENGTH).optional(),
};

function refineFeedbackForm(
  value: { type: z.infer<typeof feedbackTypeSchema>; severity?: z.infer<typeof feedbackSeveritySchema>; areas: z.infer<typeof feedbackAreaSchema>[]; otherAreaExplanation?: string },
  context: z.RefinementCtx
) {
  if (new Set(value.areas).size !== value.areas.length) {
    context.addIssue({ code: 'custom', path: ['areas'], message: 'Duplicate feedback areas are not allowed' });
  }
  if (value.type === 'bug_report' && !value.severity) {
    context.addIssue({ code: 'custom', path: ['severity'], message: 'Bug reports require severity' });
  }
  if (value.type !== 'bug_report' && value.severity) {
    context.addIssue({ code: 'custom', path: ['severity'], message: 'Severity applies only to bug reports' });
  }
  if (value.areas.includes('other') && !value.otherAreaExplanation) {
    context.addIssue({ code: 'custom', path: ['otherAreaExplanation'], message: 'Other requires an explanation' });
  }
  if (!value.areas.includes('other') && value.otherAreaExplanation) {
    context.addIssue({ code: 'custom', path: ['otherAreaExplanation'], message: 'Other explanation requires the Other area' });
  }
}

export const feedbackFormSchema = z.object(feedbackFormFields).strict().superRefine(refineFeedbackForm);

export const createFeedbackSessionRequestSchema = z.object({ sessionId: feedbackUuidSchema }).strict();

export const feedbackAttachmentMetadataSchema = z
  .object({
    originalName: z.string().trim().min(1).max(255),
    contentType: z.enum(FEEDBACK_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(FEEDBACK_MAX_VIDEO_BYTES),
  })
  .strict()
  .superRefine((value, context) => {
    if (FEEDBACK_IMAGE_MIME_TYPES.includes(value.contentType) && value.sizeBytes > FEEDBACK_MAX_IMAGE_BYTES) {
      context.addIssue({ code: 'custom', path: ['sizeBytes'], message: 'Image exceeds 10 MiB' });
    }
  });

export const reserveFeedbackAttachmentRequestSchema = feedbackAttachmentMetadataSchema.safeExtend({
  attachmentId: feedbackUuidSchema,
});

export const feedbackAttachmentDescriptorSchema = feedbackAttachmentMetadataSchema.safeExtend({
  id: feedbackUuidSchema,
  originalName: z.string().min(1).max(255),
  storagePath: z.string().min(1).max(1_000),
  generation: z.string().regex(/^\d+$/),
});

export const submitFeedbackRequestSchema = z
  .object({
    sessionId: feedbackUuidSchema,
    ...feedbackFormFields,
    lessonId: feedbackDocumentIdSchema.nullable().optional(),
    pageContext: feedbackPageContextSchema.nullable().optional(),
    attachmentIds: z.array(feedbackUuidSchema).max(FEEDBACK_MAX_ATTACHMENTS),
    diagnostics: feedbackDiagnosticsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    refineFeedbackForm(value, context);
    if (value.pageContext && !value.lessonId) {
      context.addIssue({ code: 'custom', path: ['pageContext'], message: 'Page context requires a lesson' });
    }
    if (new Set(value.attachmentIds).size !== value.attachmentIds.length) {
      context.addIssue({ code: 'custom', path: ['attachmentIds'], message: 'Duplicate attachments are not allowed' });
    }
  });

export const feedbackReceiptSchema = z
  .object({ feedbackId: feedbackDocumentIdSchema, submittedAt: feedbackIsoTimestampSchema })
  .strict();

export const feedbackSubmitterSchema = z
  .object({
    uid: feedbackDocumentIdSchema,
    displayName: z.string().max(300).nullable(),
    email: z.string().max(320).nullable(),
    emailNormalized: z.string().max(320).nullable(),
  })
  .strict();

export const feedbackLessonSnapshotSchema = z
  .object({
    id: feedbackDocumentIdSchema,
    title: z.string().min(1).max(500),
    pageId: feedbackDocumentIdSchema.nullable(),
    pageIndex: z.number().int().nonnegative().safe().nullable(),
    pageTitle: z.string().max(500).nullable(),
    revision: z.number().int().nonnegative().safe(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.pageId === null && (value.pageIndex !== null || value.pageTitle !== null)) {
      context.addIssue({ code: 'custom', path: ['pageId'], message: 'Page snapshot fields require a page ID' });
    }
    if (value.pageId !== null && value.pageIndex === null) {
      context.addIssue({ code: 'custom', path: ['pageId'], message: 'Page ID requires an index' });
    }
  });

export const feedbackReportDocumentSchema = z
  .object({
    schemaVersion: z.literal(FEEDBACK_SCHEMA_VERSION),
    id: feedbackDocumentIdSchema,
    sessionId: feedbackUuidSchema,
    submitter: feedbackSubmitterSchema,
    ...feedbackFormFields,
    areaFlags: feedbackAreaFlagsSchema,
    lesson: feedbackLessonSnapshotSchema.nullable(),
    attachments: z.array(feedbackAttachmentDescriptorSchema).max(FEEDBACK_MAX_ATTACHMENTS),
    diagnostics: feedbackDiagnosticsSchema,
    createdAt: feedbackIsoTimestampSchema,
    updatedAt: feedbackIsoTimestampSchema,
    status: feedbackStatusSchema,
    resolvedBy: feedbackDocumentIdSchema.nullable(),
    resolvedAt: feedbackIsoTimestampSchema.nullable(),
    resolutionReason: z.string().max(2_000).nullable(),
    archived: z.boolean(),
    archivedBy: feedbackDocumentIdSchema.nullable(),
    archivedAt: feedbackIsoTimestampSchema.nullable(),
    stateRevision: z.number().int().nonnegative().safe(),
  })
  .strict()
  .superRefine((value, context) => {
    refineFeedbackForm(value, context);
    if (FEEDBACK_AREAS.some(area => value.areaFlags[area] !== value.areas.includes(area))) {
      context.addIssue({ code: 'custom', path: ['areaFlags'], message: 'Area flags must match selected areas' });
    }
    if (value.status === 'resolved' ? (value.resolvedBy === null || value.resolvedAt === null) : (value.resolvedBy !== null || value.resolvedAt !== null)) {
      context.addIssue({ code: 'custom', path: ['status'], message: 'Resolution state is inconsistent' });
    }
    if (value.status !== 'resolved' && value.resolutionReason !== null) {
      context.addIssue({ code: 'custom', path: ['resolutionReason'], message: 'Unresolved reports cannot have a resolution reason' });
    }
    if (value.archived ? (value.archivedBy === null || value.archivedAt === null) : (value.archivedBy !== null || value.archivedAt !== null)) {
      context.addIssue({ code: 'custom', path: ['archived'], message: 'Archive state is inconsistent' });
    }
    if (new Set(value.attachments.map(item => item.id)).size !== value.attachments.length) {
      context.addIssue({ code: 'custom', path: ['attachments'], message: 'Duplicate attachments are not allowed' });
    }
    if (value.attachments.reduce((total, item) => total + item.sizeBytes, 0) > FEEDBACK_MAX_TOTAL_BYTES) {
      context.addIssue({ code: 'custom', path: ['attachments'], message: 'Attachments exceed 200 MiB' });
    }
  });

export const feedbackSessionDocumentSchema = z
  .object({
    schemaVersion: z.literal(FEEDBACK_SCHEMA_VERSION),
    id: feedbackUuidSchema,
    ownerUid: feedbackDocumentIdSchema,
    status: feedbackSessionStatusSchema,
    createdAt: feedbackIsoTimestampSchema,
    updatedAt: feedbackIsoTimestampSchema,
    expiresAtMs: feedbackEpochMsSchema,
    totalReservedBytes: z.number().int().nonnegative().max(FEEDBACK_MAX_TOTAL_BYTES),
    attachmentCount: z.number().int().nonnegative().max(FEEDBACK_MAX_ATTACHMENTS),
    receipt: feedbackReceiptSchema.nullable(),
    cleanupLease: z.object({ id: feedbackUuidSchema, expiresAtMs: feedbackEpochMsSchema }).strict().nullable(),
    tombstoneUntilMs: feedbackEpochMsSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === 'submitted') !== (value.receipt !== null)) {
      context.addIssue({ code: 'custom', path: ['receipt'], message: 'Only submitted sessions contain a receipt' });
    }
    if (value.status !== 'cleanup' && value.cleanupLease !== null) {
      context.addIssue({ code: 'custom', path: ['cleanupLease'], message: 'Only cleanup sessions hold a cleanup lease' });
    }
  });

export const feedbackAttachmentIntentDocumentSchema = z
  .object({
    schemaVersion: z.literal(FEEDBACK_SCHEMA_VERSION),
    id: feedbackUuidSchema,
    sessionId: feedbackUuidSchema,
    ownerUid: feedbackDocumentIdSchema,
    originalName: z.string().min(1).max(255),
    contentType: z.enum(FEEDBACK_MIME_TYPES),
    reservedBytes: z.number().int().positive().max(FEEDBACK_MAX_VIDEO_BYTES),
    status: feedbackAttachmentStatusSchema,
    createdAt: feedbackIsoTimestampSchema,
    updatedAt: feedbackIsoTimestampSchema,
    lease: z.object({ id: feedbackUuidSchema, expiresAtMs: feedbackEpochMsSchema }).strict().nullable(),
    verified: feedbackAttachmentDescriptorSchema.nullable(),
    cleanupPending: z.boolean(),
    cleanupAfterMs: feedbackEpochMsSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (FEEDBACK_IMAGE_MIME_TYPES.includes(value.contentType) && value.reservedBytes > FEEDBACK_MAX_IMAGE_BYTES) {
      context.addIssue({ code: 'custom', path: ['reservedBytes'], message: 'Image exceeds 10 MiB' });
    }
    if ((value.status === 'finalizing') !== (value.lease !== null)) {
      context.addIssue({ code: 'custom', path: ['lease'], message: 'Only finalizing attachments hold a lease' });
    }
    if ((value.status === 'ready') !== (value.verified !== null)) {
      context.addIssue({ code: 'custom', path: ['verified'], message: 'Only ready attachments have verified metadata' });
    }
    if (value.cleanupPending !== (value.cleanupAfterMs !== null)) {
      context.addIssue({ code: 'custom', path: ['cleanupAfterMs'], message: 'Pending cleanup requires a due time' });
    }
    if (value.verified && (value.verified.id !== value.id || value.verified.contentType !== value.contentType || value.verified.sizeBytes !== value.reservedBytes)) {
      context.addIssue({ code: 'custom', path: ['verified'], message: 'Verified metadata does not match reservation' });
    }
  });

export const feedbackActivityDocumentSchema = z
  .object({
    schemaVersion: z.literal(FEEDBACK_SCHEMA_VERSION),
    id: feedbackDocumentIdSchema,
    feedbackId: feedbackDocumentIdSchema,
    kind: z.enum(FEEDBACK_ACTIVITY_KINDS),
    actorUid: feedbackDocumentIdSchema,
    actorDisplayName: z.string().max(300).nullable(),
    createdAt: feedbackIsoTimestampSchema,
    reason: z.string().min(1).max(2_000).nullable(),
    note: z.string().min(1).max(5_000).nullable(),
    requestId: feedbackUuidSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.kind === 'note') !== (value.note !== null)) {
      context.addIssue({ code: 'custom', path: ['note'], message: 'Only note activity contains note text' });
    }
    if (value.kind === 'note' && value.requestId === null) {
      context.addIssue({ code: 'custom', path: ['requestId'], message: 'Notes require an idempotency ID' });
    }
  });

export const feedbackThrottleDocumentSchema = z
  .object({
    schemaVersion: z.literal(FEEDBACK_SCHEMA_VERSION),
    uid: feedbackDocumentIdSchema,
    submittedAtMs: z.array(feedbackEpochMsSchema).max(FEEDBACK_MAX_REPORTS_PER_HOUR),
    updatedAt: feedbackIsoTimestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.submittedAtMs.some((timestamp, index) => index > 0 && timestamp < value.submittedAtMs[index - 1])) {
      context.addIssue({ code: 'custom', path: ['submittedAtMs'], message: 'Submission timestamps must be sorted' });
    }
  });

export const feedbackPublicAttachmentSchema = z
  .object({
    id: feedbackUuidSchema,
    originalName: z.string().min(1).max(255),
    contentType: z.enum(FEEDBACK_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(FEEDBACK_MAX_VIDEO_BYTES),
    status: feedbackAttachmentStatusSchema,
  })
  .strict();
export const feedbackPublicSessionSchema = z
  .object({
    id: feedbackUuidSchema,
    status: feedbackSessionStatusSchema,
    expiresAtMs: feedbackEpochMsSchema,
    receipt: feedbackReceiptSchema.nullable(),
    attachments: z.array(feedbackPublicAttachmentSchema).max(FEEDBACK_MAX_ATTACHMENTS),
  })
  .strict();
export const feedbackReserveAttachmentResponseSchema = z
  .object({ attachment: feedbackPublicAttachmentSchema, stagingPath: z.string().min(1).max(1_000) })
  .strict();
export const feedbackFinalizeAttachmentResponseSchema = z.object({ attachment: feedbackPublicAttachmentSchema }).strict();

export const feedbackAdminListQuerySchema = z
  .object({
    status: z.enum(['unresolved', 'resolved', 'all']).default('unresolved'),
    archived: z.enum(['true', 'false']).default('false'),
    type: feedbackTypeSchema.optional(),
    severity: feedbackSeveritySchema.optional(),
    area: feedbackAreaSchema.optional(),
    lessonId: feedbackDocumentIdSchema.optional(),
    from: feedbackIsoTimestampSchema.optional(),
    to: feedbackIsoTimestampSchema.optional(),
    submitterUid: feedbackDocumentIdSchema.optional(),
    submitterEmail: z.string().trim().min(1).max(320).optional(),
    feedbackId: feedbackDocumentIdSchema.optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
    cursor: z.string().min(1).max(4_096).optional(),
  })
  .strict();

export const feedbackAdminListItemSchema = z
  .object({
    id: feedbackDocumentIdSchema,
    type: feedbackTypeSchema,
    severity: feedbackSeveritySchema.optional(),
    areas: z.array(feedbackAreaSchema).min(1).max(FEEDBACK_AREAS.length),
    description: z.string().max(FEEDBACK_MAX_DESCRIPTION_LENGTH),
    submitter: feedbackSubmitterSchema,
    lesson: feedbackLessonSnapshotSchema.nullable(),
    createdAt: feedbackIsoTimestampSchema,
    status: feedbackStatusSchema,
    archived: z.boolean(),
    stateRevision: z.number().int().nonnegative().safe(),
    attachments: z.array(feedbackAttachmentDescriptorSchema).max(FEEDBACK_MAX_ATTACHMENTS),
  })
  .strict();
export const feedbackAdminListResponseSchema = z.object({ items: z.array(feedbackAdminListItemSchema).max(FEEDBACK_ADMIN_PAGE_SIZE), nextCursor: z.string().nullable() }).strict();

export const feedbackAdminStateRequestSchema = z
  .object({
    action: z.enum(['resolve', 'reopen', 'archive', 'unarchive']),
    expectedRevision: z.number().int().nonnegative().safe(),
    reason: optionalReasonSchema,
  })
  .strict();
export const feedbackAdminNoteRequestSchema = z.object({ requestId: feedbackUuidSchema, note: z.string().trim().min(1).max(5_000) }).strict();
export const feedbackActivityListQuerySchema = z.object({ cursor: z.string().min(1).max(4_096).optional() }).strict();
export const feedbackActivityListResponseSchema = z.object({ items: z.array(feedbackActivityDocumentSchema).max(FEEDBACK_ADMIN_PAGE_SIZE), nextCursor: z.string().nullable() }).strict();

export const FEEDBACK_ERROR_CODES = [
  'FEEDBACK_INVALID_DOCUMENT',
  'FEEDBACK_NOT_FOUND',
  'FEEDBACK_FORBIDDEN',
  'FEEDBACK_SESSION_EXPIRED',
  'FEEDBACK_SESSION_CLOSED',
  'FEEDBACK_ATTACHMENT_NOT_READY',
  'FEEDBACK_INVALID_MEDIA',
  'FEEDBACK_ATTACHMENT_LIMIT',
  'FEEDBACK_STALE_LESSON_CONTEXT',
  'FEEDBACK_LESSON_INACCESSIBLE',
  'FEEDBACK_REPORT_QUOTA',
  'FEEDBACK_REVISION_CONFLICT',
  'FEEDBACK_REQUEST_CONFLICT',
] as const;

export type FeedbackType = z.infer<typeof feedbackTypeSchema>;
export type FeedbackSeverity = z.infer<typeof feedbackSeveritySchema>;
export type FeedbackArea = z.infer<typeof feedbackAreaSchema>;
export type FeedbackSubmitRequest = z.infer<typeof submitFeedbackRequestSchema>;
export type FeedbackReportDocument = z.infer<typeof feedbackReportDocumentSchema>;
export type FeedbackSessionDocument = z.infer<typeof feedbackSessionDocumentSchema>;
export type FeedbackPublicSession = z.infer<typeof feedbackPublicSessionSchema>;
export type FeedbackPublicAttachment = z.infer<typeof feedbackPublicAttachmentSchema>;
export type FeedbackLessonOption = z.infer<typeof feedbackLessonOptionSchema>;
export type FeedbackAdminListItem = z.infer<typeof feedbackAdminListItemSchema>;
export type FeedbackAdminListResponse = z.infer<typeof feedbackAdminListResponseSchema>;
export type FeedbackActivityListResponse = z.infer<typeof feedbackActivityListResponseSchema>;
export type FeedbackAttachmentIntentDocument = z.infer<typeof feedbackAttachmentIntentDocumentSchema>;
export type FeedbackAttachmentDescriptor = z.infer<typeof feedbackAttachmentDescriptorSchema>;
export type FeedbackActivityDocument = z.infer<typeof feedbackActivityDocumentSchema>;
export type FeedbackReceipt = z.infer<typeof feedbackReceiptSchema>;
export type FeedbackAdminListQuery = z.infer<typeof feedbackAdminListQuerySchema>;
export type FeedbackErrorCode = (typeof FEEDBACK_ERROR_CODES)[number];
