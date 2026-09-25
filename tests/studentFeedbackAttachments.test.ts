jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {}, adminStorage: { bucket: () => ({}) } }));

import type { Bucket } from '@google-cloud/storage';
import type { Firestore } from 'firebase-admin/firestore';
import { feedbackAreaFlags } from '@/shared/student-feedback';
import {
  finalizeFeedbackAttachment,
  getAdminFeedbackAttachmentUrl,
  removeFeedbackAttachment,
  reserveFeedbackAttachment,
} from '@/src/lib/student-feedback/attachments.server';
import { assertFeedbackMediaSignature } from '@/src/lib/student-feedback/media.server';

const sessionId = '11111111-1111-4111-8111-111111111111';
const attachmentId = '22222222-2222-4222-8222-222222222222';
const now = '2026-09-24T00:00:00.000Z';
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

class FakeSnapshot {
  constructor(public id: string, private value: Record<string, unknown> | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class FakeDoc {
  constructor(private db: FakeDb, public path: string) {}
  get id() { return this.path.split('/').pop()!; }
  collection(name: string) { return new FakeCollection(this.db, `${this.path}/${name}`); }
  async get() { return new FakeSnapshot(this.id, this.db.records.get(this.path)); }
}

class FakeCollection {
  constructor(private db: FakeDb, public path: string) {}
  doc(id: string) { return new FakeDoc(this.db, `${this.path}/${id}`); }
}

class FakeDb {
  records = new Map<string, Record<string, unknown>>();
  collection(name: string) { return new FakeCollection(this, name); }
  async runTransaction<T>(work: (transaction: {
    get: (ref: FakeDoc) => Promise<FakeSnapshot>;
    create: (ref: FakeDoc, value: Record<string, unknown>) => void;
    update: (ref: FakeDoc, patch: Record<string, unknown>) => void;
  }) => Promise<T>): Promise<T> {
    return work({
      get: ref => ref.get(),
      create: (ref, value) => this.records.set(ref.path, value),
      update: (ref, patch) => this.records.set(ref.path, { ...this.records.get(ref.path), ...patch }),
    });
  }
}

interface StoredObject {
  bytes: Buffer;
  metadata: Record<string, unknown>;
}

class FakeBucket {
  objects = new Map<string, StoredObject>();
  copies: Array<{ sourceGeneration: string | undefined; options: Record<string, unknown> }> = [];
  signed: Array<Record<string, unknown>> = [];
  failAfterCopy = false;
  failDeleteOnce = false;
  injectTokenOnCopy = false;
  copyStarted?: () => void;
  copyGate?: Promise<void>;
  file(path: string, options?: { generation?: string }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const bucket = this;
    const generation = options?.generation;
    return {
      path,
      generation,
      async getMetadata() {
        const stored = bucket.objects.get(path);
        if (!stored || (generation && stored.metadata.generation !== generation)) throw { code: 404 };
        return [stored.metadata];
      },
      async download() {
        const stored = bucket.objects.get(path);
        if (!stored) throw { code: 404 };
        return [stored.bytes.subarray(0, 64)];
      },
      async copy(destination: { path: string }, copyOptions: Record<string, unknown>) {
        bucket.copies.push({ sourceGeneration: generation, options: copyOptions });
        const source = bucket.objects.get(path);
        if (!source) throw { code: 404 };
        bucket.copyStarted?.();
        if (bucket.copyGate) await bucket.copyGate;
        if (bucket.objects.has(destination.path)) throw { code: 412 };
        bucket.objects.set(destination.path, {
          bytes: source.bytes,
          metadata: {
            generation: '2', contentType: copyOptions.contentType,
            size: String(source.bytes.byteLength), crc32c: source.metadata.crc32c,
            metadata: bucket.injectTokenOnCopy ? { firebaseStorageDownloadTokens: 'unsafe' } : copyOptions.metadata,
          },
        });
        if (bucket.failAfterCopy) {
          bucket.failAfterCopy = false;
          throw new Error('copy response lost');
        }
        return [];
      },
      async delete() {
        if (bucket.failDeleteOnce) {
          bucket.failDeleteOnce = false;
          throw new Error('temporary GCS delete failure');
        }
        const stored = bucket.objects.get(path);
        if (stored && (!generation || stored.metadata.generation === generation)) bucket.objects.delete(path);
      },
      async getSignedUrl(signOptions: Record<string, unknown>) {
        bucket.signed.push(signOptions);
        return ['https://example.test/signed'];
      },
    };
  }
}

function fixture() {
  const db = new FakeDb();
  const bucket = new FakeBucket();
  db.records.set(`studentFeedbackSessions/${sessionId}`, {
    schemaVersion: 1, id: sessionId, ownerUid: 'student-1', status: 'open', createdAt: now,
    updatedAt: now, expiresAtMs: Date.now() + 3_600_000, totalReservedBytes: 0,
    attachmentCount: 0, receipt: null, cleanupLease: null, tombstoneUntilMs: null,
  });
  const asDb = db as unknown as Firestore;
  const asBucket = bucket as unknown as Bucket;
  const input = { attachmentId, originalName: 'picture.exe', contentType: 'image/png' as const, sizeBytes: png.length };
  const staging = `student-feedback/staging/student-1/${sessionId}/${attachmentId}`;
  const canonical = `student-feedback/private/${sessionId}/${attachmentId}`;
  return { db, bucket, asDb, asBucket, input, staging, canonical };
}

describe('feedback attachment lifecycle', () => {
  it.each(['open', 'cleanup', 'expired'] as const)('returns recoverable expiry when reserving against a %s session', async status => {
    const f = fixture();
    const path = `studentFeedbackSessions/${sessionId}`;
    f.db.records.set(path, { ...f.db.records.get(path), status, expiresAtMs: Date.now() - 1 });
    await expect(reserveFeedbackAttachment('student-1', sessionId, f.input, f.asDb))
      .rejects.toMatchObject({ code: 'FEEDBACK_SESSION_EXPIRED' });
    await expect(reserveFeedbackAttachment('other', sessionId, f.input, f.asDb))
      .rejects.toMatchObject({ code: 'FEEDBACK_NOT_FOUND' });
    expect(f.db.records.get(path)?.attachmentCount).toBe(0);
  });

  it('reserves only for the owner and maintains bounded active totals idempotently', async () => {
    const f = fixture();
    await expect(reserveFeedbackAttachment('other', sessionId, f.input, f.asDb)).rejects.toMatchObject({ code: 'FEEDBACK_NOT_FOUND' });
    await reserveFeedbackAttachment('student-1', sessionId, f.input, f.asDb);
    await reserveFeedbackAttachment('student-1', sessionId, f.input, f.asDb);
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}`)).toMatchObject({ attachmentCount: 1, totalReservedBytes: png.length });
    await expect(reserveFeedbackAttachment('student-1', sessionId, { ...f.input, sizeBytes: png.length + 1 }, f.asDb))
      .rejects.toMatchObject({ code: 'FEEDBACK_REQUEST_CONFLICT' });
  });

  it('checks actual signature/metadata, copies pinned and token-free, then cleans staging durably', async () => {
    const f = fixture();
    await reserveFeedbackAttachment('student-1', sessionId, f.input, f.asDb);
    f.bucket.objects.set(f.staging, { bytes: png, metadata: {
      generation: '1', size: String(png.length), contentType: 'image/png', crc32c: 'checksum',
      metadata: { firebaseStorageDownloadTokens: 'exposed-on-staging' },
    } });
    await finalizeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket);
    const intent = f.db.records.get(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)!;
    expect(intent).toMatchObject({ status: 'ready', cleanupPending: false, verified: { storagePath: f.canonical, generation: '2' } });
    expect(f.bucket.copies[0]).toMatchObject({ sourceGeneration: '1', options: {
      preconditionOpts: { ifGenerationMatch: 0 }, metadata: {}, cacheControl: 'private, no-store',
    } });
    expect(f.bucket.objects.get(f.canonical)?.metadata.metadata).toEqual({});
    expect(f.bucket.objects.has(f.staging)).toBe(false);
  });

  it('recovers when copy committed but its response was lost', async () => {
    const f = fixture();
    await reserveFeedbackAttachment('student-1', sessionId, f.input, f.asDb);
    f.bucket.objects.set(f.staging, { bytes: png, metadata: {
      generation: '1', size: String(png.length), contentType: 'image/png', crc32c: 'checksum', metadata: {},
    } });
    f.bucket.failAfterCopy = true;
    await expect(finalizeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket))
      .rejects.toThrow('copy response lost');
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)?.status).toBe('reserved');
    expect(f.bucket.objects.has(f.canonical)).toBe(true);
    await finalizeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket);
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)?.status).toBe('ready');
  });

  it('keeps a durable cleanup marker when staging deletion fails', async () => {
    const f = fixture();
    await reserveFeedbackAttachment('student-1', sessionId, f.input, f.asDb);
    f.bucket.objects.set(f.staging, { bytes: png, metadata: {
      generation: '1', size: String(png.length), contentType: 'image/png', crc32c: 'checksum', metadata: {},
    } });
    f.bucket.failDeleteOnce = true;
    await finalizeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket);
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)).toMatchObject({
      status: 'ready', cleanupPending: true,
    });
    expect(f.bucket.objects.has(f.staging)).toBe(true);
  });

  it('retains delayed cleanup when removal wins before an in-flight copy creates canonical media', async () => {
    const f = fixture();
    await reserveFeedbackAttachment('student-1', sessionId, f.input, f.asDb);
    f.bucket.objects.set(f.staging, { bytes: png, metadata: {
      generation: '1', size: String(png.length), contentType: 'image/png', crc32c: 'checksum', metadata: {},
    } });
    let startCopy!: () => void;
    let releaseCopy!: () => void;
    const copyStarted = new Promise<void>(resolve => { startCopy = resolve; });
    f.bucket.copyStarted = startCopy;
    f.bucket.copyGate = new Promise<void>(resolve => { releaseCopy = resolve; });
    const finalizing = finalizeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket);
    await copyStarted;
    await removeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket);
    expect(f.bucket.objects.has(f.canonical)).toBe(false);
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)).toMatchObject({
      status: 'cancelled', cleanupPending: true,
    });
    releaseCopy();
    await expect(finalizing).rejects.toMatchObject({ code: 'FEEDBACK_ATTACHMENT_NOT_READY' });
    expect(f.bucket.objects.has(f.canonical)).toBe(true);
    const cancelled = f.db.records.get(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)!;
    expect(cancelled.cleanupPending).toBe(true);
    expect(cancelled.cleanupAfterMs).toEqual(expect.any(Number));
    expect(cancelled.cleanupAfterMs as number).toBeGreaterThan(Date.now());
  });

  it('rejects compressed uploads and token-bearing canonical copies before ready', async () => {
    const f = fixture();
    await reserveFeedbackAttachment('student-1', sessionId, f.input, f.asDb);
    f.bucket.objects.set(f.staging, { bytes: png, metadata: {
      generation: '1', size: String(png.length), contentType: 'image/png', contentEncoding: 'gzip', metadata: {},
    } });
    await expect(finalizeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket))
      .rejects.toMatchObject({ code: 'FEEDBACK_INVALID_MEDIA' });
    f.bucket.objects.set(f.staging, { bytes: png, metadata: {
      generation: '1', size: String(png.length), contentType: 'image/png', metadata: {},
    } });
    f.bucket.injectTokenOnCopy = true;
    await expect(finalizeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket))
      .rejects.toMatchObject({ code: 'FEEDBACK_INVALID_DOCUMENT' });
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)?.status).toBe('reserved');
  });

  it('rejects spoofed media and removes reservations without leaving active totals', async () => {
    const f = fixture();
    await reserveFeedbackAttachment('student-1', sessionId, f.input, f.asDb);
    f.bucket.objects.set(f.staging, { bytes: Buffer.from('not a PNG_____'), metadata: {
      generation: '1', size: String(png.length), contentType: 'image/png', metadata: {},
    } });
    await expect(finalizeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket))
      .rejects.toMatchObject({ code: 'FEEDBACK_INVALID_MEDIA' });
    await removeFeedbackAttachment('student-1', sessionId, attachmentId, f.asDb, f.asBucket);
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}`)).toMatchObject({ attachmentCount: 0, totalReservedBytes: 0 });
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)).toMatchObject({ status: 'cancelled', cleanupPending: false });
  });

  it('keeps ISO-BMFF image brands out of the video allowlist', () => {
    const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftyp'), Buffer.from(brand), Buffer.alloc(4)]);
    expect(() => assertFeedbackMediaSignature('video/mp4', ftyp('isom'))).not.toThrow();
    expect(() => assertFeedbackMediaSignature('video/mp4', ftyp('avif'))).toThrow();
    expect(() => assertFeedbackMediaSignature('video/mp4', ftyp('heic'))).toThrow();
    expect(() => assertFeedbackMediaSignature('video/quicktime', ftyp('qt  '))).not.toThrow();
  });

  it('signs only exact canonical generations with safe MIME-derived filenames', async () => {
    const f = fixture();
    f.db.records.set(`studentFeedback/${sessionId}`, {
      schemaVersion: 1, id: sessionId, sessionId,
      submitter: { uid: 'student-1', displayName: null, email: null, emailNormalized: null },
      type: 'general', areas: ['lessons'], areaFlags: feedbackAreaFlags(['lessons']),
      description: 'A note', lesson: null,
      attachments: [{ id: attachmentId, originalName: 'picture.exe', storagePath: f.canonical,
        contentType: 'image/png', sizeBytes: png.length, generation: '2' }],
      diagnostics: { entryPoint: 'standalone' }, createdAt: now, updatedAt: now,
      status: 'unresolved', resolvedBy: null, resolvedAt: null, resolutionReason: null,
      archived: false, archivedBy: null, archivedAt: null, stateRevision: 0,
    });
    f.bucket.objects.set(f.canonical, { bytes: png, metadata: {
      generation: '2', size: String(png.length), contentType: 'image/png', metadata: {},
    } });
    const result = await getAdminFeedbackAttachmentUrl(sessionId, attachmentId, 'inline', f.asDb, f.asBucket);
    expect(result.url).toBe('https://example.test/signed');
    expect(f.bucket.signed[0]).toMatchObject({ queryParams: { generation: '2' }, responseDisposition: 'inline; filename="picture.png"' });
    const report = f.db.records.get(`studentFeedback/${sessionId}`)!;
    const attachments = report.attachments as Array<Record<string, unknown>>;
    f.db.records.set(`studentFeedback/${sessionId}`, { ...report, attachments: [{ ...attachments[0], storagePath: 'lessons/x/content_audio/x.mp3' }] });
    await expect(getAdminFeedbackAttachmentUrl(sessionId, attachmentId, 'inline', f.asDb, f.asBucket))
      .rejects.toMatchObject({ code: 'FEEDBACK_INVALID_DOCUMENT' });
  });
});
