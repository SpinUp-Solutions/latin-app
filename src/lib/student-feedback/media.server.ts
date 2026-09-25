import type { Bucket } from '@google-cloud/storage';
import {
  FEEDBACK_IMAGE_MIME_TYPES,
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_VIDEO_BYTES,
  feedbackAttachmentDescriptorSchema,
  type FeedbackAttachmentDescriptor,
} from '@/shared/student-feedback';
import { FeedbackError } from './http.server';

const STAGING_PREFIX = 'student-feedback/staging';
const PRIVATE_PREFIX = 'student-feedback/private';

export function feedbackStagingPath(uid: string, sessionId: string, attachmentId: string): string {
  return `${STAGING_PREFIX}/${uid}/${sessionId}/${attachmentId}`;
}

export function feedbackPrivatePath(sessionId: string, attachmentId: string): string {
  return `${PRIVATE_PREFIX}/${sessionId}/${attachmentId}`;
}

export function assertFeedbackPrivatePath(descriptor: FeedbackAttachmentDescriptor, sessionId: string): void {
  if (descriptor.storagePath !== feedbackPrivatePath(sessionId, descriptor.id)) {
    throw new FeedbackError('FEEDBACK_INVALID_DOCUMENT', 'Attachment storage path is invalid', 409);
  }
}

function invalidMedia(message: string): never {
  throw new FeedbackError('FEEDBACK_INVALID_MEDIA', message, 409);
}

/** Signature checks validate the claimed media format; they are not malware scanning. */
export function assertFeedbackMediaSignature(contentType: FeedbackAttachmentDescriptor['contentType'], bytes: Uint8Array): void {
  const has = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const ascii = (offset: number, text: string) =>
    [...text].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  const majorBrand = String.fromCharCode(...bytes.slice(8, 12));
  const isoBoxLength = (bytes[0] * 2 ** 24 + bytes[1] * 2 ** 16 + bytes[2] * 2 ** 8 + bytes[3]);
  const isoHeader = bytes.length >= 12 && ascii(4, 'ftyp') && isoBoxLength >= 12;
  const mp4Brands = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'MSNV', 'dash']);
  const valid = contentType === 'image/png'
    ? has(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    : contentType === 'image/jpeg'
      ? has(0xff, 0xd8, 0xff)
      : contentType === 'image/webp'
        ? ascii(0, 'RIFF') && ascii(8, 'WEBP')
        : contentType === 'video/webm'
          ? has(0x1a, 0x45, 0xdf, 0xa3)
          : contentType === 'video/mp4'
            ? isoHeader && mp4Brands.has(majorBrand)
            : isoHeader && majorBrand === 'qt  ';
  if (!valid) invalidMedia('Attachment file signature does not match its type');
}

export async function inspectFeedbackStagingObject(
  bucket: Bucket,
  uid: string,
  sessionId: string,
  attachmentId: string,
  expected: { contentType: FeedbackAttachmentDescriptor['contentType']; reservedBytes: number; originalName: string }
): Promise<{ descriptor: FeedbackAttachmentDescriptor; crc32c: string | null; sourceGeneration: string }> {
  const path = feedbackStagingPath(uid, sessionId, attachmentId);
  const source = bucket.file(path);
  let metadata;
  try {
    [metadata] = await source.getMetadata();
  } catch (error) {
    if (isObjectNotFound(error)) invalidMedia('Upload is missing; retry the file upload');
    throw error;
  }
  const generation = String(metadata.generation ?? '');
  const size = Number(metadata.size);
  if (!/^\d+$/.test(generation) || !Number.isSafeInteger(size) || size !== expected.reservedBytes || metadata.contentType !== expected.contentType) {
    invalidMedia('Uploaded attachment metadata does not match its reservation');
  }
  if (metadata.contentEncoding && metadata.contentEncoding !== 'identity') {
    invalidMedia('Compressed attachment uploads are not supported');
  }
  const max = FEEDBACK_IMAGE_MIME_TYPES.includes(expected.contentType) ? FEEDBACK_MAX_IMAGE_BYTES : FEEDBACK_MAX_VIDEO_BYTES;
  if (size <= 0 || size > max) invalidMedia('Uploaded attachment exceeds its type limit');
  const pinned = bucket.file(path, { generation });
  const [prefix] = await pinned.download({ start: 0, end: 63, decompress: false });
  assertFeedbackMediaSignature(expected.contentType, prefix);
  return {
    descriptor: feedbackAttachmentDescriptorSchema.parse({
      id: attachmentId,
      originalName: expected.originalName,
      storagePath: feedbackPrivatePath(sessionId, attachmentId),
      contentType: expected.contentType,
      sizeBytes: size,
      generation,
    }),
    crc32c: typeof metadata.crc32c === 'string' ? metadata.crc32c : null,
    sourceGeneration: generation,
  };
}

export function isObjectNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 404;
}

export function isPreconditionFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 412;
}

export async function deleteFeedbackObjectGeneration(
  bucket: Bucket,
  path: string,
  generation: string | null
): Promise<void> {
  try {
    const file = generation ? bucket.file(path, { generation }) : bucket.file(path);
    await file.delete({ ignoreNotFound: true });
  } catch (error) {
    if (!isObjectNotFound(error) && !isPreconditionFailure(error)) throw error;
  }
}
