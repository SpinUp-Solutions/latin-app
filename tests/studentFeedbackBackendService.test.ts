jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' } }));
jest.mock('@/src/lib/learning-units/student-dashboard-service', () => ({ studentDashboardService: { getDashboard: jest.fn() } }));
jest.mock('@/src/lib/learning-units/progression-access', () => ({ getLessonProgressAccessInTransaction: jest.fn() }));

import { getLessonProgressAccessInTransaction } from '@/src/lib/learning-units/progression-access';
import { createFeedbackSession, getPublicFeedbackSession, submitFeedback } from '@/src/lib/student-feedback/service.server';
import { addPrivateFeedbackNote, updateFeedbackState } from '@/src/lib/student-feedback/admin.server';
import { submitFeedbackRequestSchema } from '@/shared/student-feedback';

const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
const sessionId = '08814ab5-2712-49e9-9c54-7c7317fdd812';
const attachmentId = '1be84684-3cec-4dd5-87f7-f911fdd0bc96';

type Data = Record<string, unknown>;

class FakeRef {
  constructor(readonly path: string, private readonly db: FakeDb) {}
  get id() { return this.path.split('/').at(-1)!; }
  collection(name: string) { return new FakeCollection(`${this.path}/${name}`, this.db); }
  get() { return Promise.resolve(this.db.snapshot(this.path)); }
}

class FakeCollection {
  constructor(readonly path: string, private readonly db: FakeDb, readonly max = Infinity, readonly statuses: string[] | null = null) {}
  doc(id: string) { return new FakeRef(`${this.path}/${id}`, this.db); }
  limit(max: number) { return new FakeCollection(this.path, this.db, max, this.statuses); }
  where(field: string, op: string, values: string[]) {
    if (field !== 'status' || op !== 'in') throw new Error('Unexpected fake query');
    return new FakeCollection(this.path, this.db, this.max, values);
  }
  get() { return Promise.resolve(this.db.query(this)); }
}

class FakeDb {
  readonly documents = new Map<string, Data>();
  readonly writes: Array<{ operation: string; path: string }> = [];
  collection(name: string) { return new FakeCollection(name, this); }
  snapshot(path: string) {
    const data = this.documents.get(path);
    return { id: path.split('/').at(-1)!, ref: new FakeRef(path, this), exists: data !== undefined, data: () => data };
  }
  query(collection: FakeCollection) {
    const prefix = `${collection.path}/`;
    const docs = [...this.documents.keys()]
      .filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes('/') &&
        (!collection.statuses || collection.statuses.includes(String(this.documents.get(path)?.status))))
      .slice(0, collection.max)
      .map(path => this.snapshot(path));
    return { docs, size: docs.length };
  }
  async runTransaction<T>(callback: (transaction: {
    get(ref: FakeRef | FakeCollection): Promise<unknown>;
    create(ref: FakeRef, data: Data): void;
    set(ref: FakeRef, data: Data): void;
    update(ref: FakeRef, data: Data): void;
  }) => Promise<T>): Promise<T> {
    let wrote = false;
    const staged: Array<() => void> = [];
    const get = async (ref: FakeRef | FakeCollection) => {
      if (wrote) throw new Error('Firestore read after write');
      return ref instanceof FakeRef ? this.snapshot(ref.path) : this.query(ref);
    };
    const transaction = {
      get,
      create: (ref: FakeRef, data: Data) => {
        wrote = true;
        staged.push(() => {
          if (this.documents.has(ref.path)) throw new Error('Document already exists');
          this.documents.set(ref.path, data);
          this.writes.push({ operation: 'create', path: ref.path });
        });
      },
      set: (ref: FakeRef, data: Data) => {
        wrote = true;
        staged.push(() => {
          this.documents.set(ref.path, data);
          this.writes.push({ operation: 'set', path: ref.path });
        });
      },
      update: (ref: FakeRef, data: Data) => {
        wrote = true;
        staged.push(() => {
          const previous = this.documents.get(ref.path);
          if (!previous) throw new Error('Document missing');
          this.documents.set(ref.path, { ...previous, ...data });
          this.writes.push({ operation: 'update', path: ref.path });
        });
      },
    };
    const result = await callback(transaction);
    staged.forEach(apply => apply());
    return result;
  }
}

function lesson(overrides: Data = {}) {
  return {
    id: 'lesson-1', kind: 'lesson', title: '<b>Lesson One</b>', description: '', type: 'normal',
    pages: [{ id: 'page-1', title: 'Introduction', items: [] }],
    isLive: true, liveOrder: 0, publishedAt: null, publishedBy: null, version: 2,
    ...overrides,
  };
}

function submission(overrides: Data = {}) {
  return submitFeedbackRequestSchema.parse({
    sessionId, type: 'bug_report', severity: 'minor', areas: ['lessons'],
    description: 'The page would not advance.', lessonId: 'lesson-1',
    attachmentIds: [], diagnostics: { entryPoint: 'lesson', route: '/lesson/lesson-1' },
    ...overrides,
  });
}

const token = { uid: 'student-1', email: 'Verified@Example.edu', name: 'Auth Name' } as never;

describe('student feedback transaction boundaries', () => {
  beforeEach(() => {
    jest.mocked(getLessonProgressAccessInTransaction).mockResolvedValue('allowed');
  });

  it('recovers an idempotent owner session while rejecting another owner and exposing a safe DTO', async () => {
    const db = new FakeDb();
    const first = await createFeedbackSession('student-1', sessionId, db as never, nowMs);
    const second = await createFeedbackSession('student-1', sessionId, db as never, nowMs + 1);
    expect(second).toEqual(first);
    expect(db.writes).toHaveLength(1);
    await expect(createFeedbackSession('student-2', sessionId, db as never, nowMs)).rejects.toMatchObject({ status: 404 });
    const publicSession = await getPublicFeedbackSession('student-1', sessionId, db as never);
    expect(publicSession).toEqual({ id: sessionId, status: 'open', expiresAtMs: nowMs + 24 * 60 * 60 * 1000, receipt: null, attachments: [] });
    expect(publicSession).not.toHaveProperty('ownerUid');
    expect(publicSession).not.toHaveProperty('cleanupLease');
  });

  it('submits a generic lesson with historical snapshot, verified email, one quota entry, and replays without another write', async () => {
    const db = new FakeDb();
    await createFeedbackSession('student-1', sessionId, db as never, nowMs);
    db.documents.set('lessons/lesson-1', lesson());
    db.documents.set('users/student-1', { firstName: 'Profile', lastName: 'Name', email: 'spoofed@example.org' });
    const receipt = await submitFeedback(token, submission(), db as never, nowMs);
    const report = db.documents.get(`studentFeedback/${sessionId}`)!;
    expect(receipt.feedbackId).toBe(sessionId);
    expect(report.lesson).toEqual({ id: 'lesson-1', title: '<b>Lesson One</b>', pageId: null, pageIndex: null, pageTitle: null, revision: 2 });
    expect(report.submitter).toEqual({ uid: 'student-1', displayName: 'Profile Name', email: 'Verified@Example.edu', emailNormalized: 'verified@example.edu' });
    expect(db.documents.get('studentFeedbackThrottles/student-1')?.submittedAtMs).toEqual([nowMs]);
    const writes = db.writes.length;
    expect(await submitFeedback(token, submission({ description: 'Different retry body' }), db as never, nowMs + 1)).toEqual(receipt);
    expect(db.writes).toHaveLength(writes);
  });

  it('rejects stale page context and inaccessible, pending or missing lessons before any submission write', async () => {
    for (const variant of [
      { lesson: lesson(), access: 'allowed', context: { pageId: 'page-1', pageIndex: 0, revision: 1 }, code: 'FEEDBACK_STALE_LESSON_CONTEXT' },
      { lesson: lesson({ _deletionPending: true }), access: 'allowed', context: undefined, code: 'FEEDBACK_LESSON_INACCESSIBLE' },
      { lesson: undefined, access: 'allowed', context: undefined, code: 'FEEDBACK_LESSON_INACCESSIBLE' },
      { lesson: lesson(), access: 'locked', context: undefined, code: 'FEEDBACK_LESSON_INACCESSIBLE' },
    ]) {
      const db = new FakeDb();
      await createFeedbackSession('student-1', sessionId, db as never, nowMs);
      if (variant.lesson) db.documents.set('lessons/lesson-1', variant.lesson);
      jest.mocked(getLessonProgressAccessInTransaction).mockResolvedValue(variant.access as never);
      await expect(submitFeedback(token, submission({ pageContext: variant.context }), db as never, nowMs)).rejects.toMatchObject({ code: variant.code });
      expect(db.documents.has(`studentFeedback/${sessionId}`)).toBe(false);
      expect(db.documents.has('studentFeedbackThrottles/student-1')).toBe(false);
    }
  });

  it('requires every active intent ready and selected, and verifies its canonical storage path', async () => {
    const db = new FakeDb();
    await createFeedbackSession('student-1', sessionId, db as never, nowMs);
    db.documents.set('lessons/lesson-1', lesson());
    db.documents.set(`studentFeedbackSessions/${sessionId}`, {
      ...db.documents.get(`studentFeedbackSessions/${sessionId}`), attachmentCount: 1,
      totalReservedBytes: 12,
    });
    const path = `studentFeedbackSessions/${sessionId}/attachments/${attachmentId}`;
    const base = {
      schemaVersion: 1, id: attachmentId, sessionId, ownerUid: 'student-1',
      originalName: 'picture.png', contentType: 'image/png', reservedBytes: 12,
      createdAt: new Date(nowMs).toISOString(), updatedAt: new Date(nowMs).toISOString(),
      lease: null, verified: null, cleanupPending: false, cleanupAfterMs: null,
    };
    db.documents.set(path, { ...base, status: 'reserved' });
    await expect(submitFeedback(token, submission(), db as never, nowMs)).rejects.toMatchObject({ code: 'FEEDBACK_ATTACHMENT_NOT_READY' });
    db.documents.set(path, { ...base, status: 'ready', verified: {
      id: attachmentId, originalName: 'picture.png', contentType: 'image/png', sizeBytes: 12,
      storagePath: `student-feedback/private/${sessionId}/${attachmentId}`, generation: '1',
    } });
    await expect(submitFeedback(token, submission(), db as never, nowMs)).rejects.toMatchObject({ code: 'FEEDBACK_ATTACHMENT_NOT_READY' });
    const ready = db.documents.get(path)!;
    db.documents.set(path, { ...ready, verified: { ...(ready.verified as Data), storagePath: 'student-feedback/private/other/file' } });
    await expect(submitFeedback(token, submission({ attachmentIds: [attachmentId] }), db as never, nowMs)).rejects.toMatchObject({ code: 'FEEDBACK_INVALID_DOCUMENT' });
    db.documents.set(path, ready);
    await expect(submitFeedback(token, submission({ attachmentIds: [attachmentId] }), db as never, nowMs)).resolves.toMatchObject({ feedbackId: sessionId });
  });

  it('enforces a rolling 60-minute quota without consuming it on a failed request', async () => {
    const db = new FakeDb();
    await createFeedbackSession('student-1', sessionId, db as never, nowMs);
    db.documents.set('lessons/lesson-1', lesson());
    db.documents.set('studentFeedbackThrottles/student-1', {
      schemaVersion: 1, uid: 'student-1', submittedAtMs: Array.from({ length: 10 }, (_, i) => nowMs - 59 * 60 * 1000 + i),
      updatedAt: new Date(nowMs).toISOString(),
    });
    await expect(submitFeedback(token, submission(), db as never, nowMs)).rejects.toMatchObject({ code: 'FEEDBACK_REPORT_QUOTA', status: 429 });
    expect(db.documents.has(`studentFeedback/${sessionId}`)).toBe(false);
    await expect(submitFeedback(token, submission(), db as never, nowMs + 60 * 1000)).resolves.toMatchObject({ feedbackId: sessionId });
  });
});

describe('admin feedback transaction boundaries', () => {
  it('separates resolution from archive, rejects stale state, and deduplicates private notes', async () => {
    const db = new FakeDb();
    await createFeedbackSession('student-1', sessionId, db as never, nowMs);
    db.documents.set('lessons/lesson-1', lesson());
    jest.mocked(getLessonProgressAccessInTransaction).mockResolvedValue('allowed');
    await submitFeedback(token, submission(), db as never, nowMs);
    const admin = { uid: 'admin-1', name: 'Admin' } as never;
    const resolved = await updateFeedbackState(sessionId, admin, { action: 'resolve', expectedRevision: 0, reason: 'Fixed' }, db as never, nowMs + 1);
    expect(resolved.status).toBe('resolved');
    await expect(updateFeedbackState(sessionId, admin, { action: 'reopen', expectedRevision: 0 }, db as never, nowMs + 2)).rejects.toMatchObject({ code: 'FEEDBACK_REVISION_CONFLICT' });
    const archived = await updateFeedbackState(sessionId, admin, { action: 'archive', expectedRevision: 1 }, db as never, nowMs + 2);
    expect(archived.archived).toBe(true);
    expect(archived.status).toBe('resolved');
    const requestId = '1b950942-6190-40f7-bb3b-ed943a73feca';
    const first = await addPrivateFeedbackNote(sessionId, admin, { requestId, note: 'Check reproduction' }, db as never, nowMs + 3);
    const writes = db.writes.length;
    expect(await addPrivateFeedbackNote(sessionId, admin, { requestId, note: 'Check reproduction' }, db as never, nowMs + 4)).toEqual(first);
    expect(db.writes).toHaveLength(writes);
    await expect(addPrivateFeedbackNote(sessionId, admin, { requestId, note: 'Changed note' }, db as never, nowMs + 5)).rejects.toMatchObject({ code: 'FEEDBACK_REQUEST_CONFLICT' });
    expect(db.documents.get(`studentFeedback/${sessionId}`)?.stateRevision).toBe(2);
  });
});
