import { z } from 'zod';

/** Browser and server share these contracts. Field limits keep reports far below Firestore's size margin. */
export const FEEDBACK_MAX_DESCRIPTION_LENGTH = 10_000;
export const FEEDBACK_MAX_COMMENTS_LENGTH = 5_000;
export const FEEDBACK_MAX_OTHER_EXPLANATION_LENGTH = 500;
export const FEEDBACK_MAX_NOTE_LENGTH = 5_000;
export const FEEDBACK_MAX_REASON_LENGTH = 2_000;
export const FEEDBACK_MAX_ATTACHMENTS = 5;
export const FEEDBACK_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const FEEDBACK_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const FEEDBACK_MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const FEEDBACK_MAX_REPORTS_PER_HOUR = 10;
export const FEEDBACK_ADMIN_PAGE_SIZE = 25;
export const FEEDBACK_MAX_ACTIVITY_ITEMS = 200;

export const FEEDBACK_TYPES = ['bug_report', 'feature_suggestion', 'general'] as const;
export const FEEDBACK_SEVERITIES = ['blocking', 'major', 'minor'] as const;
export const FEEDBACK_AREAS = ['lessons', 'exercises', 'vocabulary', 'dashboard', 'account', 'performance', 'other'] as const;
const FEEDBACK_STATUSES = ['unresolved', 'resolved'] as const;
const FEEDBACK_ADMIN_ACTIONS = ['resolve', 'reopen', 'archive', 'unarchive'] as const;
const FEEDBACK_ACTIVITY_KINDS = ['submitted', 'resolved', 'reopened', 'archived', 'unarchived', 'note'] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];
export type FeedbackArea = (typeof FEEDBACK_AREAS)[number];
export type FeedbackAdminAction = (typeof FEEDBACK_ADMIN_ACTIONS)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug_report: 'Bug report',
  feature_suggestion: 'Suggestion',
  general: 'General feedback',
};

export const FEEDBACK_SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  blocking: 'Blocking',
  major: 'Major',
  minor: 'Minor',
};

export const FEEDBACK_AREA_LABELS: Record<FeedbackArea, string> = {
  lessons: 'Lessons',
  exercises: 'Exercises',
  vocabulary: 'Vocabulary',
  dashboard: 'Dashboard & progress',
  account: 'Account & login',
  performance: 'Speed & loading',
  other: 'Other',
};

const FEEDBACK_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const FEEDBACK_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export const FEEDBACK_MEDIA_TYPES = [...FEEDBACK_IMAGE_TYPES, ...FEEDBACK_VIDEO_TYPES] as const;
export type FeedbackMediaType = (typeof FEEDBACK_MEDIA_TYPES)[number];

/** Returns the per-file byte limit, or null for an unsupported type. */
export function feedbackMediaLimit(contentType: string): number | null {
  if ((FEEDBACK_IMAGE_TYPES as readonly string[]).includes(contentType)) return FEEDBACK_MAX_IMAGE_BYTES;
  if ((FEEDBACK_VIDEO_TYPES as readonly string[]).includes(contentType)) return FEEDBACK_MAX_VIDEO_BYTES;
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

/** Students upload here; Storage rules allow owner-only creates and a bucket lifecycle rule removes leftovers. */
export function feedbackUploadPath(uid: string, draftId: string, attachmentId: string): string {
  return `student-feedback/uploads/${uid}/${draftId}/${attachmentId}`;
}

const feedbackDocumentIdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(value => value !== '.' && value !== '..' && !value.includes('/'), 'Expected a document ID');
export const feedbackUuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime();

const feedbackFormFields = {
  type: z.enum(FEEDBACK_TYPES, { error: 'Choose what kind of feedback this is' }),
  severity: z.enum(FEEDBACK_SEVERITIES).optional(),
  areas: z.array(z.enum(FEEDBACK_AREAS)).min(1, 'Choose at least one area').max(FEEDBACK_AREAS.length),
  otherAreaExplanation: z.string().trim().min(1).max(FEEDBACK_MAX_OTHER_EXPLANATION_LENGTH).optional(),
  description: z.string().trim().min(1, 'Please describe your feedback').max(FEEDBACK_MAX_DESCRIPTION_LENGTH),
  rating: z.number().int().min(1).max(5).optional(),
  comments: z.string().trim().max(FEEDBACK_MAX_COMMENTS_LENGTH).optional(),
};

type FeedbackFormShape = {
  type: FeedbackType;
  severity?: FeedbackSeverity;
  areas: FeedbackArea[];
  otherAreaExplanation?: string;
};

function refineFeedbackForm(value: FeedbackFormShape, context: z.RefinementCtx) {
  if (new Set(value.areas).size !== value.areas.length) {
    context.addIssue({ code: 'custom', path: ['areas'], message: 'Choose each area once' });
  }
  if (value.type === 'bug_report' && !value.severity) {
    context.addIssue({ code: 'custom', path: ['severity'], message: 'Choose how much this affects you' });
  }
  if (value.type !== 'bug_report' && value.severity) {
    context.addIssue({ code: 'custom', path: ['severity'], message: 'Severity applies only to bug reports' });
  }
  if (value.areas.includes('other') && !value.otherAreaExplanation) {
    context.addIssue({ code: 'custom', path: ['otherAreaExplanation'], message: 'Tell us which area you mean' });
  }
  if (!value.areas.includes('other') && value.otherAreaExplanation) {
    context.addIssue({ code: 'custom', path: ['otherAreaExplanation'], message: 'Only explain the area when choosing Other' });
  }
}

export const feedbackFormSchema = z.object(feedbackFormFields).superRefine(refineFeedbackForm);

const feedbackDiagnosticsSchema = z.object({
  entryPoint: z.enum(['standalone', 'lesson']),
  appVersion: z.string().max(100).optional(),
  browser: z.string().max(300).optional(),
  viewport: z
    .object({ width: z.number().int().positive().max(100_000), height: z.number().int().positive().max(100_000) })
    .optional(),
  route: z.string().max(512).optional(),
});

export const submitFeedbackRequestSchema = z
  .object({
    /** Client-generated report ID. Resubmitting the same draft returns the original receipt. */
    draftId: feedbackUuidSchema,
    ...feedbackFormFields,
    lessonId: feedbackDocumentIdSchema.nullable().optional(),
    pageId: feedbackDocumentIdSchema.nullable().optional(),
    attachments: z
      .array(z.object({ id: feedbackUuidSchema, name: z.string().trim().min(1).max(255) }))
      .max(FEEDBACK_MAX_ATTACHMENTS)
      .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Duplicate attachments'),
    diagnostics: feedbackDiagnosticsSchema,
  })
  .superRefine((value, context) => {
    refineFeedbackForm(value, context);
    if (value.pageId && !value.lessonId) {
      context.addIssue({ code: 'custom', path: ['pageId'], message: 'A page requires a lesson' });
    }
  });

const feedbackAttachmentSchema = z.object({
  id: feedbackUuidSchema,
  name: z.string().min(1).max(255),
  contentType: z.enum(FEEDBACK_MEDIA_TYPES),
  sizeBytes: z.number().int().positive(),
});

const feedbackLessonSnapshotSchema = z.object({
  id: feedbackDocumentIdSchema,
  title: z.string().min(1).max(500),
  pageId: feedbackDocumentIdSchema.nullable(),
  pageIndex: z.number().int().nonnegative().nullable(),
  pageTitle: z.string().max(500).nullable(),
});

export const feedbackReportSchema = z.object({
  id: feedbackUuidSchema,
  submitter: z.object({
    uid: feedbackDocumentIdSchema,
    displayName: z.string().max(300).nullable(),
    email: z.string().max(320).nullable(),
    emailNormalized: z.string().max(320).nullable(),
  }),
  ...feedbackFormFields,
  lesson: feedbackLessonSnapshotSchema.nullable(),
  attachments: z.array(feedbackAttachmentSchema).max(FEEDBACK_MAX_ATTACHMENTS),
  diagnostics: feedbackDiagnosticsSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  status: z.enum(FEEDBACK_STATUSES),
  archived: z.boolean(),
});

export const feedbackActivitySchema = z.object({
  id: feedbackDocumentIdSchema,
  kind: z.enum(FEEDBACK_ACTIVITY_KINDS),
  actorUid: feedbackDocumentIdSchema,
  actorDisplayName: z.string().max(300).nullable(),
  createdAt: timestampSchema,
  reason: z.string().max(FEEDBACK_MAX_REASON_LENGTH).nullable(),
  note: z.string().max(FEEDBACK_MAX_NOTE_LENGTH).nullable(),
});

export const feedbackAdminListQuerySchema = z.object({
  status: z.enum(['unresolved', 'resolved', 'all']).default('unresolved'),
  archived: z.enum(['true', 'false']).default('false'),
  type: z.enum(FEEDBACK_TYPES).optional(),
  severity: z.enum(FEEDBACK_SEVERITIES).optional(),
  area: z.enum(FEEDBACK_AREAS).optional(),
  lessonId: feedbackDocumentIdSchema.optional(),
  submitterUid: feedbackDocumentIdSchema.optional(),
  submitterEmail: z.string().trim().min(1).max(320).optional(),
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  cursor: z.string().min(1).max(500).optional(),
});

export const feedbackAdminStateRequestSchema = z.object({
  action: z.enum(FEEDBACK_ADMIN_ACTIONS),
  reason: z.string().trim().min(1).max(FEEDBACK_MAX_REASON_LENGTH).optional(),
});

export const feedbackAdminNoteRequestSchema = z.object({
  note: z.string().trim().min(1).max(FEEDBACK_MAX_NOTE_LENGTH),
});

export type FeedbackErrorCode =
  | 'FEEDBACK_INVALID_DOCUMENT'
  | 'FEEDBACK_NOT_FOUND'
  | 'FEEDBACK_FORBIDDEN'
  | 'FEEDBACK_INVALID_ATTACHMENT'
  | 'FEEDBACK_LESSON_UNAVAILABLE'
  | 'FEEDBACK_REPORT_QUOTA'
  | 'FEEDBACK_INVALID_CURSOR';
export type FeedbackSubmitRequest = z.infer<typeof submitFeedbackRequestSchema>;
export type FeedbackReceipt = { feedbackId: string; submittedAt: string };
export type FeedbackAttachment = z.infer<typeof feedbackAttachmentSchema>;
export type FeedbackLessonSnapshot = z.infer<typeof feedbackLessonSnapshotSchema>;
export type FeedbackReport = z.infer<typeof feedbackReportSchema>;
export type FeedbackActivity = z.infer<typeof feedbackActivitySchema>;
export type FeedbackLessonOption = { id: string; title: string };
export type FeedbackAdminListQuery = z.infer<typeof feedbackAdminListQuerySchema>;

export type FeedbackAdminListItem = Pick<
  FeedbackReport,
  'id' | 'type' | 'severity' | 'areas' | 'submitter' | 'lesson' | 'createdAt' | 'status' | 'archived'
> & { excerpt: string; attachmentCount: number };

export interface FeedbackAdminListResponse {
  items: FeedbackAdminListItem[];
  nextCursor: string | null;
}

export interface FeedbackAdminDetailResponse {
  feedback: FeedbackReport;
  activity: FeedbackActivity[];
  currentLesson: { id: string; title: string } | null;
}

export interface FeedbackAttachmentLinksResponse {
  items: Array<{ id: string; viewUrl: string | null; downloadUrl: string }>;
  expiresAt: string;
}
