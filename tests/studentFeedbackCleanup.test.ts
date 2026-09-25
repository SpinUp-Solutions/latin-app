jest.mock('../functions/node_modules/firebase-admin/lib/app/index.js', () => ({ getApps: () => [{}], initializeApp: () => ({}) }));
jest.mock('../functions/node_modules/firebase-admin/lib/firestore/index.js', () => ({ getFirestore: () => ({}) }));
jest.mock('../functions/node_modules/firebase-admin/lib/storage/index.js', () => ({ getStorage: () => ({ bucket: () => ({}) }) }));
jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_options: unknown, handler: unknown) => handler }), { virtual: true });
jest.mock('firebase-functions/v2/storage', () => ({ onObjectFinalized: (_options: unknown, handler: unknown) => handler }), { virtual: true });

import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { feedbackAreaFlags } from '@/shared/student-feedback';
import {
  cleanupClaimedSession,
  cleanupPendingIntent,
  guardStudentFeedbackObject,
} from '@/functions/src/student-feedback/cleanup';

const sessionId = '11111111-1111-4111-8111-111111111111';
const attachmentId = '22222222-2222-4222-8222-222222222222';
const otherAttachmentId = '33333333-3333-4333-8333-333333333333';
const timestamp = '2026-09-24T00:00:00.000Z';

class FakeSnapshot {
  constructor(public ref: FakeDoc, private value: Record<string, unknown> | undefined) {}
  get id() { return this.ref.id; }
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class FakeDoc {
  constructor(private db: FakeDb, public path: string) {}
  get id() { return this.path.split('/').pop()!; }
  collection(name: string) { return new FakeQuery(this.db, `${this.path}/${name}`); }
  async get() { return new FakeSnapshot(this, this.db.records.get(this.path)); }
  async delete() { this.db.records.delete(this.path); }
}

class FakeQuery {
  constructor(private db: FakeDb, public path: string, private cap = Infinity) {}
  doc(id: string) { return new FakeDoc(this.db, `${this.path}/${id}`); }
  orderBy() { return this; }
  limit(size: number) { return new FakeQuery(this.db, this.path, size); }
  async get() {
    const depth = this.path.split('/').length + 1;
    const docs = [...this.db.records.entries()]
      .filter(([path]) => path.startsWith(`${this.path}/`) && path.split('/').length === depth)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, this.cap)
      .map(([path, value]) => new FakeSnapshot(new FakeDoc(this.db, path), value));
    return { docs, empty: docs.length === 0 };
  }
}

class FakeDb {
  records = new Map<string, Record<string, unknown>>();
  afterTransaction?: () => void;
  collection(name: string) { return new FakeQuery(this, name); }
  async runTransaction<T>(work: (transaction: {
    get: (ref: FakeDoc | FakeQuery) => ReturnType<FakeDoc['get']> | ReturnType<FakeQuery['get']>;
    update: (ref: FakeDoc, patch: Record<string, unknown>) => void;
  }) => Promise<T>) {
    const result = await work({
      get: ref => ref.get(),
      update: (ref, patch) => this.records.set(ref.path, { ...this.records.get(ref.path), ...patch }),
    });
    this.afterTransaction?.();
    this.afterTransaction = undefined;
    return result;
  }
}

class FakeBucket {
  objects = new Map<string, { generation: string }>();
  deleted: Array<{ path: string; generation: string | undefined }> = [];
  file(path: string, options?: { generation?: string }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const bucket = this;
    return {
      async getMetadata() {
        const current = bucket.objects.get(path);
        if (!current) throw { code: 404 };
        return [current];
      },
      async delete() {
        bucket.deleted.push({ path, generation: options?.generation });
        if (bucket.objects.get(path)?.generation === options?.generation) bucket.objects.delete(path);
      },
    };
  }
}

function session(status: 'open' | 'submitted' | 'cleanup' = 'open') {
  return {
    schemaVersion: 1, id: sessionId, ownerUid: 'student-1', status, createdAt: timestamp,
    updatedAt: timestamp, expiresAtMs: Date.now() + 3_600_000, totalReservedBytes: 0,
    attachmentCount: 0,
    receipt: status === 'submitted' ? { feedbackId: sessionId, submittedAt: timestamp } : null,
    cleanupLease: status === 'cleanup' ? { id: attachmentId, expiresAtMs: Date.now() + 600_000 } : null,
    tombstoneUntilMs: status === 'cleanup' ? Date.now() + 604_800_000 : null,
  };
}

function intent(id = attachmentId, status: 'ready' | 'cancelled' = 'ready') {
  return {
    schemaVersion: 1, id, sessionId, ownerUid: 'student-1', originalName: 'proof.png',
    contentType: 'image/png', reservedBytes: 12, status, createdAt: timestamp, updatedAt: timestamp,
    lease: null,
    verified: status === 'ready' ? {
      id, originalName: 'proof.png', storagePath: `student-feedback/private/${sessionId}/${id}`,
      contentType: 'image/png', sizeBytes: 12, generation: '7',
    } : null,
    cleanupPending: status === 'cancelled', cleanupAfterMs: status === 'cancelled' ? Date.now() - 1_000 : null,
  };
}

function report() {
  return {
    schemaVersion: 1, id: sessionId, sessionId,
    submitter: { uid: 'student-1', displayName: null, email: null, emailNormalized: null },
    type: 'general', areas: ['lessons'], areaFlags: feedbackAreaFlags(['lessons']),
    description: 'Feedback', lesson: null,
    attachments: [{ id: otherAttachmentId, originalName: 'other.png',
      storagePath: `student-feedback/private/${sessionId}/${otherAttachmentId}`,
      contentType: 'image/png', sizeBytes: 12, generation: '8' }],
    diagnostics: { entryPoint: 'standalone' }, createdAt: timestamp, updatedAt: timestamp,
    status: 'unresolved', resolvedBy: null, resolvedAt: null, resolutionReason: null,
    archived: false, archivedBy: null, archivedAt: null, stateRevision: 0,
  };
}

function fixtures() {
  const db = new FakeDb();
  const bucket = new FakeBucket();
  db.records.set(`studentFeedbackSessions/${sessionId}`, session());
  db.records.set(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`, intent());
  const canonical = `student-feedback/private/${sessionId}/${attachmentId}`;
  bucket.objects.set(canonical, { generation: '7' });
  return { db, bucket, canonical, asDb: db as unknown as Firestore, asBucket: bucket as never };
}

describe('feedback cleanup and finalized guard', () => {
  it('preserves an open canonical object even if submission commits after its snapshot read', async () => {
    const f = fixtures();
    f.db.afterTransaction = () => {
      f.db.records.set(`studentFeedbackSessions/${sessionId}`, session('submitted'));
      f.db.records.set(`studentFeedback/${sessionId}`, { ...report(), attachments: [{ ...report().attachments[0], id: attachmentId,
        storagePath: f.canonical, generation: '7' }] });
    };
    await guardStudentFeedbackObject(f.canonical, '7', f.asDb, f.asBucket);
    expect(f.bucket.objects.has(f.canonical)).toBe(true);
    expect(f.bucket.deleted).toHaveLength(0);
  });

  it('preserves exactly referenced committed generations and deletes cancelled unreferenced media', async () => {
    const f = fixtures();
    f.db.records.set(`studentFeedbackSessions/${sessionId}`, session('submitted'));
    f.db.records.set(`studentFeedback/${sessionId}`, report());
    f.db.records.set(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`, intent(attachmentId, 'cancelled'));
    const doc = await f.db.collection('studentFeedbackSessions').doc(sessionId).collection('attachments').doc(attachmentId).get();
    await cleanupPendingIntent(f.asDb, f.asBucket, doc as unknown as QueryDocumentSnapshot);
    expect(f.bucket.objects.has(f.canonical)).toBe(false);
    expect(f.db.records.get(doc.ref.path)?.cleanupPending).toBe(false);

    const committed = `student-feedback/private/${sessionId}/${otherAttachmentId}`;
    f.bucket.objects.set(committed, { generation: '8' });
    await guardStudentFeedbackObject(committed, '8', f.asDb, f.asBucket);
    expect(f.bucket.objects.has(committed)).toBe(true);
  });

  it('defers cleanup of a cancelled in-flight copy, then removes late canonical media', async () => {
    const f = fixtures();
    const dueMs = Date.now() + 60_000;
    f.db.records.set(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`, {
      ...intent(attachmentId, 'cancelled'), cleanupAfterMs: dueMs,
    });
    const doc = await f.db.collection('studentFeedbackSessions').doc(sessionId).collection('attachments').doc(attachmentId).get();
    await cleanupPendingIntent(f.asDb, f.asBucket, doc as unknown as QueryDocumentSnapshot, dueMs - 1);
    expect(f.bucket.objects.has(f.canonical)).toBe(true);
    expect(f.db.records.get(doc.ref.path)?.cleanupPending).toBe(true);
    await cleanupPendingIntent(f.asDb, f.asBucket, doc as unknown as QueryDocumentSnapshot, dueMs);
    expect(f.bucket.objects.has(f.canonical)).toBe(false);
    expect(f.db.records.get(doc.ref.path)).toMatchObject({ cleanupPending: false, cleanupAfterMs: null });
  });

  it('retries submitted-session staging cleanup without touching committed canonical media', async () => {
    const f = fixtures();
    const staging = `student-feedback/staging/student-1/${sessionId}/${attachmentId}`;
    f.bucket.objects.set(staging, { generation: '5' });
    f.db.records.set(`studentFeedbackSessions/${sessionId}`, session('submitted'));
    f.db.records.set(`studentFeedback/${sessionId}`, { ...report(), attachments: [{
      ...report().attachments[0], id: attachmentId, storagePath: f.canonical, generation: '7',
    }] });
    f.db.records.set(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`, {
      ...intent(), cleanupPending: true, cleanupAfterMs: Date.now() - 1_000,
    });
    const doc = await f.db.collection('studentFeedbackSessions').doc(sessionId).collection('attachments').doc(attachmentId).get();
    await cleanupPendingIntent(f.asDb, f.asBucket, doc as unknown as QueryDocumentSnapshot);
    expect(f.bucket.objects.has(staging)).toBe(false);
    expect(f.bucket.objects.has(f.canonical)).toBe(true);
    expect(f.db.records.get(doc.ref.path)?.cleanupPending).toBe(false);
  });

  it('pins deletion to the finalized generation after session is terminal', async () => {
    const f = fixtures();
    f.db.records.set(`studentFeedbackSessions/${sessionId}`, { ...session('open'), status: 'expired' });
    await guardStudentFeedbackObject(f.canonical, '7', f.asDb, f.asBucket);
    expect(f.bucket.deleted).toContainEqual({ path: f.canonical, generation: '7' });
  });

  it('does not delete while an open-session finalize lease is renewed after the guard read', async () => {
    const f = fixtures();
    const base = intent();
    f.db.records.set(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`, {
      ...base, status: 'finalizing', verified: null,
      lease: { id: otherAttachmentId, expiresAtMs: Date.now() - 1_000 },
    });
    f.db.afterTransaction = () => {
      f.db.records.set(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`, {
        ...base, status: 'finalizing', verified: null,
        lease: { id: otherAttachmentId, expiresAtMs: Date.now() + 60_000 },
      });
    };
    await guardStudentFeedbackObject(f.canonical, '7', f.asDb, f.asBucket);
    expect(f.bucket.objects.has(f.canonical)).toBe(true);
    expect(f.bucket.deleted).toHaveLength(0);
  });

  it('cleans at most one bounded page per claimed session run', async () => {
    const f = fixtures();
    const claimed = session('cleanup');
    f.db.records.set(`studentFeedbackSessions/${sessionId}`, claimed);
    f.db.records.delete(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`);
    for (let index = 0; index < 101; index += 1) {
      const id = `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`;
      f.db.records.set(`studentFeedbackSessions/${sessionId}/attachments/${id}`, intent(id, 'cancelled'));
    }
    await cleanupClaimedSession(f.asDb, f.asBucket, claimed as never, Date.now());
    const remaining = [...f.db.records.keys()].filter(path => path.startsWith(`studentFeedbackSessions/${sessionId}/attachments/`));
    expect(remaining).toHaveLength(1);
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}`)?.status).toBe('cleanup');
  });

  it('keeps an expired session tombstone and cancelled intent through its copy hold', async () => {
    const f = fixtures();
    const claimed = session('cleanup');
    const dueMs = Date.now() + 60_000;
    f.db.records.set(`studentFeedbackSessions/${sessionId}`, claimed);
    f.db.records.set(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`, {
      ...intent(attachmentId, 'cancelled'), cleanupAfterMs: dueMs,
    });
    await cleanupClaimedSession(f.asDb, f.asBucket, claimed as never, dueMs - 1);
    expect(f.db.records.has(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)).toBe(true);
    expect(f.bucket.objects.has(f.canonical)).toBe(true);
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}`)?.status).toBe('cleanup');

    await cleanupClaimedSession(f.asDb, f.asBucket, claimed as never, dueMs);
    expect(f.db.records.has(`studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`)).toBe(false);
    expect(f.bucket.objects.has(f.canonical)).toBe(false);
    expect(f.db.records.get(`studentFeedbackSessions/${sessionId}`)?.status).toBe('expired');
  });
});
