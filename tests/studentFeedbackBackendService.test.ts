jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {}, adminStorage: {} }));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' } }));
jest.mock('@/src/lib/learning-units/student-dashboard-service', () => ({ studentDashboardService: { getDashboard: jest.fn() } }));

const mockStoreAttachments = jest.fn();
const mockDeleteUploads = jest.fn();
jest.mock('@/src/lib/student-feedback/attachments.server', () => ({
  storeFeedbackAttachments: (...args: unknown[]) => mockStoreAttachments(...args),
  deleteFeedbackUploads: (...args: unknown[]) => mockDeleteUploads(...args),
}));

import type { DecodedIdToken } from 'firebase-admin/auth';
import { submitFeedback } from '@/src/lib/student-feedback/service.server';
import {
  addFeedbackNote,
  feedbackListQuery,
  getFeedbackDetail,
  listFeedback,
  updateFeedbackState,
} from '@/src/lib/student-feedback/admin.server';
import { submitFeedbackRequestSchema, type FeedbackSubmitRequest } from '@/shared/student-feedback';

type Data = Record<string, unknown>;
const valueAt = (data: Data, path: string) =>
  path.split('.').reduce<unknown>((value, key) => (value as Data | null | undefined)?.[key], data);

class FakeQuery {
  constructor(
    readonly db: FakeDb,
    readonly path: string,
    readonly filters: Array<[string, string, unknown]> = [],
    readonly order: string | null = null,
    readonly max = Infinity
  ) {}
  where(field: string, op: string, value: unknown) {
    return new FakeQuery(this.db, this.path, [...this.filters, [field, op, value]], this.order, this.max);
  }
  orderBy(field: string) {
    return new FakeQuery(this.db, this.path, this.filters, field, this.max);
  }
  limit(max: number) {
    return new FakeQuery(this.db, this.path, this.filters, this.order, max);
  }
  count() {
    return { countOf: this };
  }
  matches() {
    const rows = this.db.children(this.path).filter(([, data]) =>
      this.filters.every(([field, op, value]) => {
        const actual = valueAt(data, field);
        if (op === '==') return actual === value;
        if (op === '>=') return String(actual) >= String(value);
        throw new Error(`Unsupported operator ${op}`);
      })
    );
    const order = this.order;
    if (order) rows.sort(([, a], [, b]) => String(valueAt(a, order)).localeCompare(String(valueAt(b, order))));
    return rows.slice(0, this.max);
  }
  async get() {
    const docs = this.matches().map(([path]) => this.db.snapshot(path));
    return { docs, size: docs.length };
  }
}

class FakeCollection extends FakeQuery {
  doc(id: string) {
    return new FakeRef(this.db, `${this.path}/${id}`);
  }
}

class FakeRef {
  constructor(
    readonly db: FakeDb,
    readonly path: string
  ) {}
  get id() {
    return this.path.split('/').at(-1)!;
  }
  collection(name: string) {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }
  async get() {
    return this.db.snapshot(this.path);
  }
}

class FakeDb {
  readonly documents = new Map<string, Data>();
  collection(name: string) {
    return new FakeCollection(this, name);
  }
  snapshot(path: string) {
    const data = this.documents.get(path);
    return { id: path.split('/').at(-1)!, exists: data !== undefined, data: () => data, ref: new FakeRef(this, path) };
  }
  children(path: string) {
    const prefix = `${path}/`;
    return [...this.documents.entries()].filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'));
  }
  async runTransaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
    const staged: Array<() => void> = [];
    const transaction = {
      get: async (target: FakeRef | { countOf: FakeQuery }) => {
        if (staged.length) throw new Error('Firestore read after write');
        if (target instanceof FakeRef) return this.snapshot(target.path);
        return { data: () => ({ count: target.countOf.matches().length }) };
      },
      create: (ref: FakeRef, data: Data) =>
        staged.push(() => {
          if (this.documents.has(ref.path)) throw new Error('Document already exists');
          this.documents.set(ref.path, data);
        }),
      update: (ref: FakeRef, data: Data) =>
        staged.push(() => {
          const current = this.documents.get(ref.path);
          if (!current) throw new Error('Document missing');
          this.documents.set(ref.path, { ...current, ...data });
        }),
    };
    const result = await callback(transaction);
    staged.forEach(apply => apply());
    return result;
  }
}

const draftId = '08814ab5-2712-49e9-9c54-7c7317fdd812';
const attachmentId = '1be84684-3cec-4dd5-87f7-f911fdd0bc96';
const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
const student = { uid: 'student-1', email: ' Student@Example.edu ', name: 'Token Name' } as unknown as DecodedIdToken;
const admin = { uid: 'admin-1', name: 'Admin Token' } as unknown as DecodedIdToken;
const verifiedAttachment = { id: attachmentId, name: 'screen.png', contentType: 'image/png', sizeBytes: 1024 };

const input = (overrides: Partial<FeedbackSubmitRequest> = {}): FeedbackSubmitRequest =>
  submitFeedbackRequestSchema.parse({
    draftId,
    type: 'bug_report',
    severity: 'major',
    areas: ['lessons'],
    description: 'Audio stops on page two',
    attachments: [{ id: attachmentId, name: 'screen.png' }],
    diagnostics: { entryPoint: 'lesson', route: '/lesson/lesson-1' },
    ...overrides,
  });

const lessonDocument = (overrides: Data = {}) => ({
  id: 'lesson-1',
  kind: 'lesson',
  title: '<strong>First lesson</strong>',
  description: '',
  type: 'normal',
  pages: [
    { id: 'page-1', title: 'Opening', items: [] },
    { id: 'page-2', title: 'Second page', items: [] },
  ],
  isLive: true,
  version: 3,
  ...overrides,
});

const seedReport = (db: FakeDb, overrides: Data = {}) =>
  db.documents.set(`studentFeedback/${draftId}`, {
    id: draftId,
    submitter: { uid: 'student-1', displayName: 'Ada Lovelace', email: 'student@example.edu', emailNormalized: 'student@example.edu' },
    type: 'general',
    areas: ['dashboard'],
    description: 'Existing report',
    lesson: null,
    attachments: [],
    diagnostics: { entryPoint: 'standalone' },
    createdAt: '2026-09-24T11:00:00.000Z',
    updatedAt: '2026-09-24T11:00:00.000Z',
    status: 'unresolved',
    resolvedBy: null,
    resolvedAt: null,
    resolutionReason: null,
    archived: false,
    archivedBy: null,
    archivedAt: null,
    ...overrides,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreAttachments.mockResolvedValue([verifiedAttachment]);
  mockDeleteUploads.mockResolvedValue(undefined);
});

describe('submitFeedback', () => {
  it('creates the report and submitted activity from the verified identity and verified uploads', async () => {
    const db = new FakeDb();
    db.documents.set('users/student-1', { firstName: ' Ada ', lastName: 'Lovelace', email: 'spoofed@example.edu' });

    const receipt = await submitFeedback(student, input(), db as never, nowMs);

    expect(receipt).toEqual({ feedbackId: draftId, submittedAt: '2026-09-24T12:00:00.000Z' });
    expect(mockStoreAttachments).toHaveBeenCalledWith('student-1', draftId, [{ id: attachmentId, name: 'screen.png' }]);
    expect(db.documents.get(`studentFeedback/${draftId}`)).toMatchObject({
      id: draftId,
      submitter: { uid: 'student-1', displayName: 'Ada Lovelace', email: 'Student@Example.edu', emailNormalized: 'student@example.edu' },
      type: 'bug_report',
      severity: 'major',
      attachments: [verifiedAttachment],
      lesson: null,
      status: 'unresolved',
      archived: false,
    });
    expect(db.documents.get(`studentFeedback/${draftId}/activity/submitted`)).toMatchObject({
      kind: 'submitted',
      actorUid: 'student-1',
      actorDisplayName: 'Ada Lovelace',
    });
    expect(mockDeleteUploads).toHaveBeenCalledWith('student-1', draftId, [{ id: attachmentId, name: 'screen.png' }]);
  });

  it('returns the original receipt for a retried draft without copying files or duplicating the report', async () => {
    const db = new FakeDb();
    seedReport(db);

    await expect(submitFeedback(student, input(), db as never, nowMs)).resolves.toEqual({
      feedbackId: draftId,
      submittedAt: '2026-09-24T11:00:00.000Z',
    });
    expect(mockStoreAttachments).not.toHaveBeenCalled();
    expect(db.documents.get(`studentFeedback/${draftId}`)).toMatchObject({ description: 'Existing report' });
  });

  it('rejects a draft ID that belongs to another student', async () => {
    const db = new FakeDb();
    seedReport(db, { submitter: { uid: 'student-2', displayName: null, email: null, emailNormalized: null } });

    await expect(submitFeedback(student, input(), db as never, nowMs)).rejects.toMatchObject({ code: 'FEEDBACK_FORBIDDEN' });
  });

  it('allows ten reports per student per rolling hour', async () => {
    const db = new FakeDb();
    for (let index = 0; index < 10; index += 1) {
      db.documents.set(`studentFeedback/recent-${index}`, {
        submitter: { uid: 'student-1' },
        createdAt: new Date(nowMs - 30 * 60 * 1000).toISOString(),
      });
    }
    db.documents.set('studentFeedback/other-student', { submitter: { uid: 'student-2' }, createdAt: '2026-09-24T11:59:00.000Z' });

    await expect(submitFeedback(student, input(), db as never, nowMs)).rejects.toMatchObject({ code: 'FEEDBACK_REPORT_QUOTA', status: 429 });
    await expect(submitFeedback(student, input(), db as never, nowMs + 31 * 60 * 1000)).resolves.toMatchObject({ feedbackId: draftId });
  });

  it('snapshots the lesson page and drops a page that no longer exists', async () => {
    const db = new FakeDb();
    db.documents.set('lessons/lesson-1', lessonDocument());

    await submitFeedback(student, input({ lessonId: 'lesson-1', pageId: 'page-2' }), db as never, nowMs);
    expect(db.documents.get(`studentFeedback/${draftId}`)?.lesson).toEqual({
      id: 'lesson-1',
      title: '<strong>First lesson</strong>',
      pageId: 'page-2',
      pageIndex: 1,
      pageTitle: 'Second page',
    });

    db.documents.clear();
    db.documents.set('lessons/lesson-1', lessonDocument());
    await submitFeedback(student, input({ lessonId: 'lesson-1', pageId: 'deleted-page' }), db as never, nowMs);
    expect(db.documents.get(`studentFeedback/${draftId}`)?.lesson).toMatchObject({ pageId: null, pageIndex: null, pageTitle: null });
  });

  it.each([
    ['missing', undefined],
    ['pending deletion', lessonDocument({ _deletionPending: true })],
    ['not a lesson', lessonDocument({ kind: 'test' })],
  ])('rejects a lesson that is %s', async (_label, document) => {
    const db = new FakeDb();
    if (document) db.documents.set('lessons/lesson-1', document);

    await expect(submitFeedback(student, input({ lessonId: 'lesson-1' }), db as never, nowMs)).rejects.toMatchObject({
      code: 'FEEDBACK_LESSON_UNAVAILABLE',
    });
    expect(db.documents.has(`studentFeedback/${draftId}`)).toBe(false);
  });
});

describe('admin review', () => {
  it('records state changes as toggles and ignores repeats', async () => {
    const db = new FakeDb();
    seedReport(db);
    db.documents.set('users/admin-1', { firstName: 'Grace', lastName: 'Hopper' });
    const activity = () => db.children(`studentFeedback/${draftId}/activity`).map(([, data]) => data);

    const resolved = await updateFeedbackState(draftId, admin, { action: 'resolve', reason: 'Fixed in 2.3' }, db as never, nowMs);
    expect(resolved).toMatchObject({ status: 'resolved', resolvedBy: 'admin-1', resolutionReason: 'Fixed in 2.3' });
    expect(db.documents.get(`studentFeedback/${draftId}`)).toMatchObject({ status: 'resolved', resolvedAt: '2026-09-24T12:00:00.000Z' });

    await updateFeedbackState(draftId, admin, { action: 'resolve' }, db as never, nowMs + 1000);
    expect(activity()).toHaveLength(1);

    await updateFeedbackState(draftId, admin, { action: 'reopen' }, db as never, nowMs + 2000);
    await updateFeedbackState(draftId, admin, { action: 'archive' }, db as never, nowMs + 3000);
    expect(db.documents.get(`studentFeedback/${draftId}`)).toMatchObject({
      status: 'unresolved',
      resolvedBy: null,
      resolutionReason: null,
      archived: true,
      archivedBy: 'admin-1',
    });
    expect(activity().map(item => [item.kind, item.actorDisplayName])).toEqual([
      ['resolved', 'Grace Hopper'],
      ['reopened', 'Grace Hopper'],
      ['archived', 'Grace Hopper'],
    ]);
  });

  it('adds notes only to existing reports', async () => {
    const db = new FakeDb();
    await expect(addFeedbackNote(draftId, admin, 'Investigating', db as never, nowMs)).rejects.toMatchObject({ code: 'FEEDBACK_NOT_FOUND' });

    seedReport(db);
    const note = await addFeedbackNote(draftId, admin, 'Investigating', db as never, nowMs);
    expect(note).toMatchObject({ kind: 'note', note: 'Investigating', actorUid: 'admin-1', actorDisplayName: 'Admin Token' });
    expect(db.documents.get(`studentFeedback/${draftId}/activity/${note.id}`)).toEqual(note);
  });

  it('returns chronological activity and the current lesson with the report', async () => {
    const db = new FakeDb();
    seedReport(db, { lesson: { id: 'lesson-1', title: 'Old title', pageId: null, pageIndex: null, pageTitle: null } });
    db.documents.set('lessons/lesson-1', lessonDocument({ title: 'New title' }));
    const entry = (id: string, createdAt: string) => ({ id, kind: 'note', actorUid: 'admin-1', actorDisplayName: null, createdAt, reason: null, note: id });
    db.documents.set(`studentFeedback/${draftId}/activity/later`, entry('later', '2026-09-24T12:30:00.000Z'));
    db.documents.set(`studentFeedback/${draftId}/activity/earlier`, entry('earlier', '2026-09-24T12:10:00.000Z'));

    const detail = await getFeedbackDetail(draftId, db as never);
    expect(detail.activity.map(item => item.id)).toEqual(['earlier', 'later']);
    expect(detail.currentLesson).toEqual({ id: 'lesson-1', title: 'New title' });
  });
});

describe('admin list query', () => {
  function recordingDb(docs: Array<{ id: string; data: Data }> = []) {
    const calls: unknown[][] = [];
    const query: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_target, method: string) =>
          method === 'get'
            ? async () => ({ docs: docs.map(doc => ({ id: doc.id, data: () => doc.data })), size: docs.length })
            : (...args: unknown[]) => {
                calls.push([method, ...args]);
                return query;
              },
      }
    );
    return { calls, db: { collection: (name: string) => (calls.push(['collection', name]), query) } };
  }

  it('translates filters and date bounds into one indexed query', () => {
    const { calls, db } = recordingDb();
    feedbackListQuery(db as never, {
      status: 'resolved',
      archived: 'false',
      sort: 'newest',
      area: 'lessons',
      submitterEmail: 'Student@Example.edu',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });
    expect(calls).toEqual([
      ['collection', 'studentFeedback'],
      ['where', 'archived', '==', false],
      ['where', 'status', '==', 'resolved'],
      ['where', 'areas', 'array-contains', 'lessons'],
      ['where', 'submitter.emailNormalized', '==', 'student@example.edu'],
      ['orderBy', 'createdAt', 'desc'],
      ['orderBy', '__name__', 'desc'],
      ['startAt', '2026-09-30T23:59:59.999Z'],
      ['endAt', '2026-09-01T00:00:00.000Z'],
    ]);
  });

  it('returns a cursor that resumes after the last report and rejects malformed cursors', async () => {
    const reports = Array.from({ length: 26 }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      const db = new FakeDb();
      seedReport(db);
      return { id, data: { ...db.documents.get(`studentFeedback/${draftId}`), id, createdAt: `2026-09-24T10:${String(index).padStart(2, '0')}:00.000Z` } };
    });
    const first = recordingDb(reports);
    const page = await listFeedback({ status: 'all', archived: 'false', sort: 'oldest' }, first.db as never);
    expect(page.items).toHaveLength(25);
    expect(page.items[0]).toMatchObject({ id: reports[0].id, excerpt: 'Existing report', attachmentCount: 0 });
    expect(page.nextCursor).toEqual(expect.any(String));

    const next = recordingDb();
    feedbackListQuery(next.db as never, { status: 'all', archived: 'false', sort: 'oldest', from: '2026-09-01T00:00:00.000Z', cursor: page.nextCursor! });
    expect(next.calls).toContainEqual(['startAfter', '2026-09-24T10:24:00.000Z', reports[24].id]);
    expect(next.calls.some(([method]) => method === 'startAt')).toBe(false);

    expect(() =>
      feedbackListQuery(recordingDb().db as never, { status: 'all', archived: 'false', sort: 'newest', cursor: 'not-a-cursor' })
    ).toThrow(expect.objectContaining({ code: 'FEEDBACK_INVALID_CURSOR' }));
  });
});
