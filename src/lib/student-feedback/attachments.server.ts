import type { Bucket } from '@google-cloud/storage';
import { adminStorage } from '@/src/services/firebase-admin';
import {
  FEEDBACK_MAX_TOTAL_BYTES,
  formatFileSize,
  feedbackMediaLimit,
  feedbackUploadPath,
  type FeedbackAttachment,
  type FeedbackMediaType,
  type FeedbackReport,
  type FeedbackSubmitRequest,
} from '@/shared/student-feedback';
import { FeedbackError } from './http.server';

const LINK_TTL_MS = 15 * 60 * 1000;
const INLINE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
const EXTENSIONS: Record<FeedbackMediaType, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

/** Submitted files live in a folder no client can read or write. */
export function feedbackReportAttachmentPath(feedbackId: string, attachmentId: string): string {
  return `student-feedback/reports/${feedbackId}/${attachmentId}`;
}

/** Checks that a file's leading bytes match its declared type. This is not malware scanning. */
export function matchesFeedbackMediaSignature(contentType: string, bytes: Uint8Array): boolean {
  const has = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const ascii = (offset: number, text: string) =>
    [...text].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  switch (contentType) {
    case 'image/png':
      return has(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/jpeg':
      return has(0xff, 0xd8, 0xff);
    case 'image/webp':
      return ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'video/webm':
      return has(0x1a, 0x45, 0xdf, 0xa3);
    case 'video/mp4':
    case 'video/quicktime':
      return ascii(4, 'ftyp');
    default:
      return false;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 404;
}

function invalidAttachment(message: string): never {
  throw new FeedbackError('FEEDBACK_INVALID_ATTACHMENT', message, 409);
}

async function verifyUpload(bucket: Bucket, uid: string, draftId: string, input: { id: string; name: string }) {
  const path = feedbackUploadPath(uid, draftId, input.id);
  const [metadata] = await bucket
    .file(path)
    .getMetadata()
    .catch((error: unknown) => {
      if (isNotFound(error)) invalidAttachment(`"${input.name}" is no longer available. Remove it and attach it again.`);
      throw error;
    });
  const contentType = String(metadata.contentType ?? '');
  const sizeBytes = Number(metadata.size);
  const limit = feedbackMediaLimit(contentType);
  const encoded = metadata.contentEncoding && metadata.contentEncoding !== 'identity';
  if (!limit || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > limit || encoded) {
    invalidAttachment(`"${input.name}" is not a supported image or video, or it is too large.`);
  }
  // Pin the generation so the bytes we check are the bytes we copy.
  const source = bucket.file(path, { generation: metadata.generation });
  const [head] = await source.download({ start: 0, end: 63 });
  if (!matchesFeedbackMediaSignature(contentType, head)) {
    invalidAttachment(`"${input.name}" does not look like a valid ${EXTENSIONS[contentType as FeedbackMediaType]} file.`);
  }
  const attachment: FeedbackAttachment = {
    id: input.id,
    name: input.name,
    contentType: contentType as FeedbackMediaType,
    sizeBytes,
  };
  return { source, attachment };
}

/**
 * Verifies the student's uploads and copies them into the report's private folder.
 * Copying is repeatable, so a retried submit can safely run this again.
 */
export async function storeFeedbackAttachments(
  uid: string,
  draftId: string,
  inputs: FeedbackSubmitRequest['attachments'],
  bucket: Bucket = adminStorage.bucket()
): Promise<FeedbackAttachment[]> {
  const verified = await Promise.all(inputs.map(input => verifyUpload(bucket, uid, draftId, input)));
  if (verified.reduce((total, item) => total + item.attachment.sizeBytes, 0) > FEEDBACK_MAX_TOTAL_BYTES) {
    invalidAttachment(`Attachments can total at most ${formatFileSize(FEEDBACK_MAX_TOTAL_BYTES)}.`);
  }
  await Promise.all(
    verified.map(({ source, attachment }) =>
      source.copy(bucket.file(feedbackReportAttachmentPath(draftId, attachment.id)), {
        // Replacing the metadata drops the Firebase download token from the student's upload.
        metadata: {},
        contentType: attachment.contentType,
        cacheControl: 'private, no-store',
      })
    )
  );
  return verified.map(item => item.attachment);
}

/** Leftover uploads are also removed by the bucket lifecycle rule, so failures here are ignored. */
export async function deleteFeedbackUploads(
  uid: string,
  draftId: string,
  attachments: readonly { id: string }[],
  bucket: Bucket = adminStorage.bucket()
): Promise<void> {
  await Promise.allSettled(
    attachments.map(item => bucket.file(feedbackUploadPath(uid, draftId, item.id)).delete({ ignoreNotFound: true }))
  );
}

function downloadName(attachment: FeedbackAttachment): string {
  const stem = attachment.name.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100) || 'attachment';
  return `${stem}${EXTENSIONS[attachment.contentType]}`;
}

/** Short-lived signed links for admins. Treat them as temporary credentials. */
export async function getFeedbackAttachmentLinks(
  report: FeedbackReport,
  bucket: Bucket = adminStorage.bucket(),
  nowMs = Date.now()
) {
  const expires = nowMs + LINK_TTL_MS;
  const items = await Promise.all(
    report.attachments.map(async attachment => {
      const file = bucket.file(feedbackReportAttachmentPath(report.id, attachment.id));
      const sign = async (disposition: 'inline' | 'attachment') => {
        const [url] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires,
          responseDisposition: `${disposition}; filename="${downloadName(attachment)}"`,
          responseType: attachment.contentType,
        });
        return url;
      };
      const [viewUrl, downloadUrl] = await Promise.all([
        INLINE_TYPES.includes(attachment.contentType) ? sign('inline') : Promise.resolve(null),
        sign('attachment'),
      ]);
      return { id: attachment.id, viewUrl, downloadUrl };
    })
  );
  return { items, expiresAt: new Date(expires).toISOString() };
}
