import {
  getTestAttemptSessionId,
  getStudentMockResultId,
  MAX_TRANSLATION_GRADING_REQUESTS_PER_WINDOW,
  TestAttemptService,
  TRANSLATION_GRADING_REQUEST_WINDOW_MS,
} from '@/src/lib/tests/attempt-service';
import { MockTestService } from '@/src/lib/tests/mock-service';
import type { TestAttemptOrigin } from '@/src/types/test';
import { AIRequestThrottleError } from '@/src/lib/openai/request-throttle';

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn() } }));

const timestamp = '2026-07-20T12:00:00.000Z';

type StoredDocument = Record<string, unknown>;
type DocumentRef = { kind: 'document'; collection: string; id: string; get: () => Promise<DocumentSnapshot> };
type QueryState = {
  collection: string;
  filters: Array<[string, unknown]>;
  selectedFields?: string[];
  orderings: Array<[string, 'asc' | 'desc']>;
  limitCount?: number;
};
type QueryRef = QueryState & {
  kind: 'query';
  where: (field: string, operator: string, value: unknown) => QueryRef;
  select: (...fields: string[]) => QueryRef;
  orderBy: (field: string, direction?: 'asc' | 'desc') => QueryRef;
  limit: (count: number) => QueryRef;
  count: () => { get: () => Promise<{ data: () => { count: number } }> };
  get: () => Promise<{ docs: DocumentSnapshot[] }>;
};
type DocumentSnapshot = {
  id: string;
  exists: boolean;
  data: () => StoredDocument | undefined;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fieldValue = (document: StoredDocument, path: string) =>
  path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as StoredDocument)[key];
  }, document);

class FakeFirestore {
  private readonly documents = new Map<string, Map<string, StoredDocument>>();
  private readonly documentVersions = new Map<string, number>();
  private autoId = 0;
  transactionCallbackCount = 0;
  readonly queryLog: Array<{ collection: string; selectedFields?: string[]; limitUsed: boolean }> = [];
  readonly writeLog: string[] = [];

  constructor() {
    this.seed('learningPaths', 'default', {
      id: 'default',
      revision: 1,
      unitIds: ['test-1'],
      updatedAt: timestamp,
      updatedBy: 'admin-1',
    });
  }

  private documentKey(collection: string, id: string) {
    return `${collection}/${id}`;
  }

  private version(collection: string, id: string) {
    return this.documentVersions.get(this.documentKey(collection, id)) ?? 0;
  }

  private incrementVersion(collection: string, id: string) {
    const key = this.documentKey(collection, id);
    this.documentVersions.set(key, (this.documentVersions.get(key) ?? 0) + 1);
  }

  seed(collection: string, id: string, data: StoredDocument) {
    const documents = this.documents.get(collection) ?? new Map<string, StoredDocument>();
    documents.set(id, clone(data));
    this.documents.set(collection, documents);
    this.incrementVersion(collection, id);
  }

  read(collection: string, id: string) {
    const value = this.documents.get(collection)?.get(id);
    return value ? clone(value) : undefined;
  }

  readAll(collection: string) {
    return [...(this.documents.get(collection)?.values() ?? [])].map(clone);
  }

  private snapshot(collection: string, id: string, selectedFields?: string[]): DocumentSnapshot {
    const stored = this.documents.get(collection)?.get(id);
    const projected =
      stored && selectedFields
        ? Object.fromEntries(selectedFields.map(field => [field, fieldValue(stored, field)]))
        : stored;
    return {
      id,
      exists: Boolean(stored),
      data: () => (projected ? clone(projected) : undefined),
    };
  }

  private executeQuery(state: QueryState) {
    const documents = this.documents.get(state.collection) ?? new Map<string, StoredDocument>();
    let entries = [...documents.entries()].filter(([, document]) =>
      state.filters.every(([field, expected]) => fieldValue(document, field) === expected)
    );
    for (const [field, direction] of [...state.orderings].reverse()) {
      entries = entries.sort((left, right) => {
        const leftValue = fieldValue(left[1], field) as string | number;
        const rightValue = fieldValue(right[1], field) as string | number;
        const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
        return direction === 'desc' ? -comparison : comparison;
      });
    }
    if (state.limitCount !== undefined) entries = entries.slice(0, state.limitCount);
    return { docs: entries.map(([id]) => this.snapshot(state.collection, id, state.selectedFields)) };
  }

  private query(
    state: QueryState,
    logEntry?: { collection: string; selectedFields?: string[]; limitUsed: boolean }
  ): QueryRef {
    const make = (changes: Partial<QueryState>) => this.query({ ...state, ...changes }, logEntry);
    return {
      kind: 'query',
      ...state,
      where: (field, operator, value) => {
        if (operator !== '==') throw new Error(`Unsupported fake query operator ${operator}`);
        return make({ filters: [...state.filters, [field, value]] });
      },
      select: (...fields) => {
        const entry = { collection: state.collection, selectedFields: fields, limitUsed: false };
        this.queryLog.push(entry);
        return this.query({ ...state, selectedFields: fields }, entry);
      },
      orderBy: (field, direction = 'asc') => make({ orderings: [...state.orderings, [field, direction]] }),
      limit: count => {
        if (logEntry) logEntry.limitUsed = true;
        else
          this.queryLog.push({ collection: state.collection, selectedFields: state.selectedFields, limitUsed: true });
        return make({ limitCount: count });
      },
      count: () => ({
        get: async () => ({
          data: () => ({
            count: this.executeQuery({ ...state, selectedFields: undefined, limitCount: undefined }).docs.length,
          }),
        }),
      }),
      get: async () => this.executeQuery(state),
    };
  }

  collection = (collection: string) => {
    const query = this.query({ collection, filters: [], orderings: [] });
    return Object.assign(query, {
      doc: (id?: string): DocumentRef => {
        const documentId = id ?? `attempt-${++this.autoId}`;
        return {
          kind: 'document',
          collection,
          id: documentId,
          get: async () => this.snapshot(collection, documentId),
        };
      },
    });
  };

  runTransaction = <T>(callback: (transaction: unknown) => Promise<T>): Promise<T> => {
    const execute = async (retryCount = 0): Promise<T> => {
      if (retryCount > 5) throw new Error('Fake transaction retry limit exceeded');
      this.transactionCallbackCount += 1;
      const readVersions = new Map<string, number>();
      const writes: Array<{ mode: 'create' | 'set' | 'delete'; ref: DocumentRef; value?: StoredDocument }> = [];
      const assertReadsPrecedeWrites = () => {
        if (writes.length > 0) throw new Error('Fake transaction read after a write was queued');
      };
      const transaction = {
        get: async (target: DocumentRef | QueryRef) => {
          assertReadsPrecedeWrites();
          if (target.kind === 'document') {
            const key = this.documentKey(target.collection, target.id);
            if (!readVersions.has(key)) readVersions.set(key, this.version(target.collection, target.id));
            return this.snapshot(target.collection, target.id);
          }
          return this.executeQuery(target);
        },
        getAll: async (...args: Array<DocumentRef | { fieldMask?: string[] }>) => {
          assertReadsPrecedeWrites();
          const refs = args.filter((arg): arg is DocumentRef => (arg as DocumentRef).kind === 'document');
          const options = args.find(
            (arg): arg is { fieldMask?: string[] } => (arg as { fieldMask?: string[] }).fieldMask !== undefined
          );
          return refs.map(ref => {
            const key = this.documentKey(ref.collection, ref.id);
            if (!readVersions.has(key)) readVersions.set(key, this.version(ref.collection, ref.id));
            return this.snapshot(ref.collection, ref.id, options?.fieldMask);
          });
        },
        create: (ref: DocumentRef, value: StoredDocument) => writes.push({ mode: 'create', ref, value: clone(value) }),
        set: (ref: DocumentRef, value: StoredDocument) => writes.push({ mode: 'set', ref, value: clone(value) }),
        delete: (ref: DocumentRef) => writes.push({ mode: 'delete', ref }),
      };

      const result = await callback(transaction);
      const hasConflict = [...readVersions.entries()].some(
        ([key, version]) => (this.documentVersions.get(key) ?? 0) !== version
      );
      if (hasConflict) return execute(retryCount + 1);

      for (const write of writes) {
        const documents = this.documents.get(write.ref.collection) ?? new Map<string, StoredDocument>();
        if (write.mode === 'create' && documents.has(write.ref.id)) throw new Error('Document already exists');
        if (write.mode === 'delete') documents.delete(write.ref.id);
        else documents.set(write.ref.id, clone(write.value!));
        this.documents.set(write.ref.collection, documents);
        this.incrementVersion(write.ref.collection, write.ref.id);
        this.writeLog.push(`${write.mode}:${write.ref.collection}/${write.ref.id}`);
      }
      return result;
    };

    return execute();
  };
}

const fillExercise = {
  id: 'fill.with.punctuation',
  type: 'fill',
  title: 'Fill',
  instructions: '',
  maxPoints: 3,
  feedbackConfig: { escalationLevels: [] },
  data: { items: [{ text: 'amo', answer: 'love', hint: 'private' }] },
};

const versionDocument = (id: string, exercise: StoredDocument = fillExercise) => ({
  id,
  name: id,
  pages: [{ id: `${id}-page`, items: [exercise] }],
  totalPages: 1,
  totalItems: 1,
  totalExercises: 1,
  totalPoints: 3,
});

const readableLegacyInvalidVersionDocument = (id: string) =>
  versionDocument(id, { id: 'legacy-question', type: 'multiple-choice', maxPoints: 3 });

const testDocument = (rotationVersions = ['version-a', 'version-b']) => ({
  id: 'test-1',
  kind: 'test',
  title: 'Chapter test',
  description: '',
  passingPercentage: 70,
  rotationVersions: rotationVersions.map(versionId => ({ versionId })),
  createdAt: timestamp,
  createdBy: 'admin-1',
  updatedAt: timestamp,
  updatedBy: 'admin-1',
});

const lessonDocument = () => ({
  kind: 'lesson',
  title: 'Lesson',
  description: '',
  type: 'normal',
  pages: [{ id: 'lesson-page', items: [] }],
  isLive: false,
  liveOrder: null,
  publishedAt: null,
  publishedBy: null,
});

const seedNormalTest = (db: FakeFirestore, versions = ['version-a', 'version-b']) => {
  db.seed('lessons', 'test-1', testDocument(versions));
  versions.forEach(versionId => db.seed('testVersions', versionId, versionDocument(versionId)));
};

describe('test attempt persistence service', () => {
  it('converges concurrent starts on one resumable attempt and freezes assignment settings', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db);
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });
    const input = { origin: { kind: 'normal-test' as const, testId: 'test-1' } };

    const [first, second] = await Promise.all([
      service.startAttempt(input, 'student-1'),
      service.startAttempt(input, 'student-1'),
    ]);

    expect(first.attempt.id).toBe(second.attempt.id);
    expect([first.resumed, second.resumed].sort()).toEqual([false, true]);
    expect(db.transactionCallbackCount).toBeGreaterThanOrEqual(3);
    expect(db.readAll('testAttempts')).toHaveLength(1);
    expect(db.readAll('testAttemptSessions')).toHaveLength(1);
    expect(first.attempt).not.toHaveProperty('studentId');
    expect(first.attempt).not.toHaveProperty('deliveryState');
    expect(first.attempt).not.toHaveProperty('translationGradeReservations');
    expect(first.attempt).not.toHaveProperty('translationGradeRequestWindows');
    expect(first.attempt.passingPercentage).toBe(70);
    expect(
      (first.attempt.delivery.pages[0] as { items: Array<{ data: { items: StoredDocument[] } }> }).items[0].data
        .items[0]
    ).not.toHaveProperty('answer');

    db.seed('lessons', 'test-1', { ...testDocument(['version-b']), passingPercentage: 90 });
    const resumed = await service.startAttempt(input, 'student-1');

    expect(resumed).toMatchObject({ resumed: true, attempt: { id: first.attempt.id, versionId: 'version-a' } });
    expect(resumed.attempt.passingPercentage).toBe(70);
  });

  it('projects the complete submitted history without a limit and selects the least-used version', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db);
    db.seed('testAttempts', 'submitted-1', {
      studentId: 'student-1',
      origin: { kind: 'normal-test', testId: 'test-1' },
      status: 'submitted',
      versionId: 'version-a',
      submittedAt: '2026-01-01T00:00:00.000Z',
    });
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });

    const result = await service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1');

    expect(result.attempt.versionId).toBe('version-b');
    expect(db.queryLog).toContainEqual({
      collection: 'testAttempts',
      selectedFields: ['versionId', 'submittedAt'],
      limitUsed: false,
    });
  });

  it('rejects a normal test when any referenced rotation version is unavailable', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a', 'missing-version']));
    db.seed('testVersions', 'version-a', versionDocument('version-a'));
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).rejects.toMatchObject({ code: 'TEST_CONFIGURATION_ERROR', status: 409 });
    expect(db.readAll('testAttempts')).toHaveLength(0);
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('rejects a fresh attempt for a readable legacy-invalid version without writing session state', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', readableLegacyInvalidVersionDocument('version-a'));
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).rejects.toMatchObject({ code: 'TEST_CONFIGURATION_ERROR', status: 409 });
    expect(db.readAll('testAttempts')).toHaveLength(0);
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('fails closed when the active ownership graph includes a malformed kind:test document', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    db.seed('lessons', 'corrupt-test-owner', { kind: 'test', title: 'Broken owner' });
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).rejects.toMatchObject({ code: 'TEST_CONFIGURATION_ERROR', status: 409 });
    expect(db.readAll('testAttempts')).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('uses active Learning Path membership as the sole normal-test placement authority', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a', 'version-b']);
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    const service = new TestAttemptService(db as never, () => timestamp, {
      random: () => 0,
    });

    await expect(
      service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).resolves.toMatchObject({ resumed: false });

    const unavailableDb = new FakeFirestore();
    seedNormalTest(unavailableDb, ['version-a']);
    unavailableDb.seed('learningPaths', 'default', {
      id: 'default',
      revision: 2,
      unitIds: [],
      updatedAt: timestamp,
      updatedBy: 'admin-1',
    });
    const unavailableService = new TestAttemptService(unavailableDb as never, () => timestamp, { random: () => 0 });

    await expect(
      unavailableService.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).rejects.toMatchObject({ code: 'TEST_NOT_AVAILABLE', status: 404 });
    expect(unavailableDb.readAll('testAttempts')).toHaveLength(0);
  });

  it('enforces Learning Path gates before starting a normal test', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a', 'version-b']);
    db.seed('lessons', 'lesson-1', lessonDocument());
    db.seed('learningPaths', 'default', {
      id: 'default',
      revision: 2,
      unitIds: ['lesson-1', 'test-1'],
      updatedAt: timestamp,
      updatedBy: 'admin-1',
    });
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });

    await expect(
      service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).rejects.toMatchObject({ code: 'TEST_NOT_AVAILABLE', status: 404 });
    expect(db.readAll('testAttempts')).toHaveLength(0);
    expect(db.queryLog).toContainEqual({
      collection: 'testAttempts',
      selectedFields: ['origin', 'status'],
      limitUsed: false,
    });

    db.seed('userProgress', 'student-1_lesson-1', {
      userId: 'student-1',
      lessonId: 'lesson-1',
      status: 'completed',
    });
    await expect(
      service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).resolves.toMatchObject({ resumed: false });
  });

  it('matches dashboard gating after dangling path references are skipped', async () => {
    const firstDb = new FakeFirestore();
    seedNormalTest(firstDb, ['version-a']);
    firstDb.seed('learningPaths', 'default', {
      id: 'default',
      revision: 2,
      unitIds: ['missing-unit', 'test-1'],
      updatedAt: timestamp,
      updatedBy: 'admin-1',
    });
    const firstService = new TestAttemptService(firstDb as never, () => timestamp, { random: () => 0 });
    await expect(
      firstService.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).resolves.toMatchObject({ resumed: false });

    const precededDb = new FakeFirestore();
    seedNormalTest(precededDb, ['version-a']);
    precededDb.seed('lessons', 'lesson-1', lessonDocument());
    precededDb.seed('learningPaths', 'default', {
      id: 'default',
      revision: 2,
      unitIds: ['lesson-1', 'missing-unit', 'test-1'],
      updatedAt: timestamp,
      updatedBy: 'admin-1',
    });
    precededDb.seed('userProgress', 'legacy-noncanonical-id', {
      userId: 'student-1',
      lessonId: 'lesson-1',
      status: 'completed',
    });
    const precededService = new TestAttemptService(precededDb as never, () => timestamp, { random: () => 0 });
    await expect(
      precededService.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).resolves.toMatchObject({ resumed: false });
  });

  it('uses attempts on every path test as sticky-frontier evidence', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    db.seed('learningPaths', 'default', {
      id: 'default',
      revision: 2,
      unitIds: ['lesson-1', 'test-1', 'later-test'],
      updatedAt: timestamp,
      updatedBy: 'admin-1',
    });
    db.seed('lessons', 'lesson-1', lessonDocument());
    db.seed('lessons', 'later-test', testDocument(['later-version']));
    db.seed('testVersions', 'later-version', versionDocument('later-version'));
    db.seed('testAttempts', 'later-failed-attempt', {
      studentId: 'student-1',
      origin: { kind: 'normal-test', testId: 'later-test' },
      status: 'submitted',
      versionId: 'later-version',
      submittedAt: timestamp,
    });
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });

    await expect(
      service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).resolves.toMatchObject({ resumed: false });
  });

  it('blocks every in-progress lifecycle operation after a normal test leaves the active path', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });
    const input = { origin: { kind: 'normal-test' as const, testId: 'test-1' } };
    const started = await service.startAttempt(input, 'student-1');

    db.seed('learningPaths', 'default', {
      id: 'default',
      revision: 2,
      unitIds: [],
      updatedAt: timestamp,
      updatedBy: 'admin-1',
    });

    await expect(service.startAttempt(input, 'student-1')).rejects.toMatchObject({
      code: 'TEST_NOT_AVAILABLE',
      status: 404,
    });
    await expect(
      service.saveAttemptAnswers(
        started.attempt.id,
        {
          answers: {
            'fill.with.punctuation': { type: 'fill', answers: ['love'] },
          },
        },
        'student-1'
      )
    ).rejects.toMatchObject({ code: 'TEST_NOT_AVAILABLE', status: 404 });
    await expect(service.submitAttempt(started.attempt.id, 'student-1')).rejects.toMatchObject({
      code: 'TEST_NOT_AVAILABLE',
      status: 404,
    });
  });

  it('always starts a live mock card owned version', async () => {
    const db = new FakeFirestore();
    db.seed('testVersions', 'mock-version', versionDocument('mock-version'));
    db.seed('mockTests', 'mock-1', {
      id: 'mock-1',
      versionId: 'mock-version',
      parent: { kind: 'standalone' },
      title: 'Mock test',
      description: '',
      passingPercentage: 80,
      status: 'active',
      isLive: true,
      mockOrder: 0,
    });
    const service = new TestAttemptService(db as never, () => timestamp);

    const result = await service.startAttempt({ origin: { kind: 'mock-test', mockTestId: 'mock-1' } }, 'student-1');

    expect(result.attempt).toMatchObject({ versionId: 'mock-version', passingPercentage: 80 });
  });

  it('allows only the owning frozen mock session to resume after the card becomes unavailable', async () => {
    const db = new FakeFirestore();
    db.seed('testVersions', 'mock-version', versionDocument('mock-version'));
    db.seed('mockTests', 'mock-1', {
      id: 'mock-1',
      versionId: 'mock-version',
      parent: { kind: 'standalone' },
      title: 'Mock test',
      description: '',
      passingPercentage: null,
      status: 'active',
      isLive: true,
      mockOrder: 0,
    });
    const service = new TestAttemptService(db as never, () => timestamp);
    const mocks = new MockTestService(db as never, () => timestamp, service);
    const origin = { kind: 'mock-test' as const, mockTestId: 'mock-1' };
    const started = await service.startAttempt({ origin }, 'student-1');
    db.seed('mockTests', 'mock-1', {
      id: 'mock-1',
      versionId: 'mock-version',
      parent: { kind: 'standalone' },
      title: 'Mock test',
      description: '',
      passingPercentage: null,
      status: 'archived',
      isLive: false,
      mockOrder: null,
    });

    const detail = await mocks.getStudentMockDetail('mock-1', 'student-1');
    expect(detail).toMatchObject({ mock: { status: 'archived', isLive: false }, attempt: { id: started.attempt.id } });
    expect(JSON.stringify(detail)).not.toContain('answer');
    await expect(mocks.getStudentMockDetail('mock-1', 'student-2')).rejects.toMatchObject({
      code: 'MOCK_TEST_NOT_AVAILABLE',
    });
    await expect(service.startAttempt({ origin }, 'student-2')).rejects.toMatchObject({
      code: 'MOCK_TEST_NOT_AVAILABLE',
    });
    await expect(
      service.saveAttemptAnswers(
        started.attempt.id,
        { answers: { 'fill.with.punctuation': { type: 'fill', answers: ['love'] } } },
        'student-1'
      )
    ).resolves.toMatchObject({ id: started.attempt.id });
    await expect(service.submitAttempt(started.attempt.id, 'student-1')).resolves.toMatchObject({
      attempt: { status: 'submitted' },
    });
    await expect(mocks.getStudentMockDetail('mock-1', 'student-1')).rejects.toMatchObject({
      code: 'MOCK_TEST_NOT_AVAILABLE',
    });
  });

  it('persists and explicitly clears canonical answers by whole-map writes', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestAttemptService(db as never, () => timestamp);
    const started = await service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1');

    const answered = await service.saveAttemptAnswers(
      started.attempt.id,
      {
        answers: {
          'fill.with.punctuation': { type: 'fill', answers: ['love'] },
        },
      },
      'student-1'
    );
    expect(answered.answers['fill.with.punctuation']).toEqual({ type: 'fill', answers: ['love'] });
    await expect(
      service.saveAttemptAnswers(started.attempt.id, { answers: { 'fill.with.punctuation': null } }, 'student-2')
    ).rejects.toMatchObject({
      code: 'ATTEMPT_NOT_FOUND',
    });

    const cleared = await service.saveAttemptAnswers(
      started.attempt.id,
      { answers: { 'fill.with.punctuation': null } },
      'student-1'
    );
    expect(cleared.answers).toEqual({});
  });

  it('coalesces multiple committed answers into one transactional save', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', {
      id: 'version-a',
      name: 'Version A',
      pages: [
        {
          id: 'page-a',
          items: [fillExercise, { ...fillExercise, id: 'fill.second', title: 'Second fill' }],
        },
      ],
      totalPages: 1,
      totalItems: 2,
      totalExercises: 2,
      totalPoints: 6,
    });
    const service = new TestAttemptService(db as never, () => timestamp, {
      random: () => 0,
    });
    const started = await service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1');
    const transactionsBeforeSave = db.transactionCallbackCount;

    const saved = await service.saveAttemptAnswers(
      started.attempt.id,
      {
        answers: {
          'fill.with.punctuation': { type: 'fill', answers: ['love'] },
          'fill.second': { type: 'fill', answers: ['love'] },
        },
      },
      'student-1'
    );

    expect(db.transactionCallbackCount).toBe(transactionsBeforeSave + 1);
    expect(Object.keys(saved.answers)).toEqual(['fill.with.punctuation', 'fill.second']);
  });

  it('resumes the same frozen generated questions without resolving them again', async () => {
    const db = new FakeFirestore();
    const generatedExercise = {
      id: 'translation',
      type: 'generated-translation',
      title: 'Translation',
      instructions: '',
      maxPoints: 3,
      feedbackConfig: { escalationLevels: [] },
      data: {
        generatorConfig: { collection: 'words', wordSource: 'filters', count: 1 },
        posConfigs: { verb: { enabled: true, filters: {} } },
      },
    };
    db.seed('lessons', 'test-1', testDocument(['generated-version']));
    db.seed('testVersions', 'generated-version', versionDocument('generated-version', generatedExercise));
    const loadGeneratedWords = jest.fn(async () => [
      {
        id: 'word-1',
        root_word: 'amo',
        word: 'amo',
        selected_form: 'amo',
        dictionary_entry: 'amo, amare',
        translation: 'love',
        part_of_speech: 'verb',
      },
    ]);
    const service = new TestAttemptService(db as never, () => timestamp, {
      loadGeneratedWords: loadGeneratedWords as never,
    });

    const first = await service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1');
    const second = await service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1');

    expect(loadGeneratedWords).toHaveBeenCalledTimes(1);
    expect(second.attempt.delivery).toEqual(first.attempt.delivery);
    expect(second.attempt.delivery.resolvedExercises.translation.items[0]).toMatchObject({ text: 'amo, amare' });
    expect(second.attempt.delivery.resolvedExercises.translation.items[0]).not.toHaveProperty('acceptedAnswers');
  });

  it('rejects an oversized frozen attempt before either document is written', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new TestAttemptService(db as never, () => timestamp, { maxAttemptDocumentBytes: 100 });

    await expect(
      service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).rejects.toMatchObject({ code: 'ATTEMPT_TOO_LARGE', status: 422 });
    expect(db.readAll('testAttempts')).toHaveLength(0);
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('uses collision-safe, origin-specific deterministic session IDs', () => {
    const normal: TestAttemptOrigin = { kind: 'normal-test', testId: 'a:b' };
    const mock: TestAttemptOrigin = { kind: 'mock-test', mockTestId: 'a:b' };

    expect(getTestAttemptSessionId('student', normal)).toHaveLength(64);
    expect(getTestAttemptSessionId('student', normal)).toBe(getTestAttemptSessionId('student', normal));
    expect(getTestAttemptSessionId('student', normal)).not.toBe(getTestAttemptSessionId('student', mock));
  });
});

describe('mock ownership mutations', () => {
  it('creates a standalone mock and preserves the deterministic parent mock ID across assignment retries', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a', 'version-b']);
    const service = new MockTestService(db as never, () => timestamp);
    const standalone = await service.createStandaloneMock(
      {
        mock: { id: 'standalone-1', title: 'Standalone', description: '', passingPercentage: null, isLive: false },
        version: { id: 'standalone-version', name: 'Standalone version', pages: versionDocument('x').pages as never },
      },
      'admin-1'
    );
    expect(standalone.mock.parent).toEqual({ kind: 'standalone' });
    const input = {
      testId: 'test-1',
      versionId: 'version-a',
      title: 'Assigned',
      description: '',
      passingPercentage: 70,
      isLive: false,
    };
    const first = await service.assignVersionToMock(input, 'admin-1');
    const second = await service.assignVersionToMock(input, 'admin-1');
    expect(second.id).toBe(first.id);
    expect(db.readAll('mockTests')).toHaveLength(2);
    expect(db.read('lessons', 'test-1')?.rotationVersions).toEqual([{ versionId: 'version-b' }]);
  });

  it('rejects making a placed parent test mock-only and requires complete live reorder scope', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new MockTestService(db as never, () => timestamp);
    await expect(
      service.assignVersionToMock(
        {
          testId: 'test-1',
          versionId: 'version-a',
          title: 'Assigned',
          description: '',
          passingPercentage: 70,
          isLive: false,
        },
        'admin-1'
      )
    ).rejects.toMatchObject({ code: 'PLACED_TEST_REQUIRES_ROTATION_VERSION' });
    await service.createStandaloneMock(
      {
        mock: { id: 'mock-a', title: 'A', description: '', passingPercentage: null, isLive: true },
        version: { id: 'mock-version-a', name: 'A', pages: versionDocument('a').pages as never },
      },
      'admin-1'
    );
    await service.createStandaloneMock(
      {
        mock: { id: 'mock-b', title: 'B', description: '', passingPercentage: null, isLive: true },
        version: { id: 'mock-version-b', name: 'B', pages: versionDocument('b').pages as never },
      },
      'admin-1'
    );
    await expect(service.reorderMocks({ mockIds: ['mock-a'] }, 'admin-1')).rejects.toMatchObject({
      code: 'MOCK_TEST_INVALID_OPERATION',
    });
    expect(
      (await service.reorderMocks({ mockIds: ['mock-b', 'mock-a'] }, 'admin-1')).map(mock => mock.mockOrder)
    ).toEqual([0, 1]);
  });
});

const fillExerciseWith = (id: string, items: Array<{ text: string; answer: string }>, maxPoints: number) => ({
  id,
  type: 'fill',
  title: 'Fill',
  instructions: '',
  maxPoints,
  feedbackConfig: { escalationLevels: [] },
  data: { items },
});

const translationGradingExercise = {
  id: 'translation-assessment',
  type: 'translation-grading',
  title: 'Translate',
  instructions: '',
  maxPoints: 8,
  feedbackConfig: { escalationLevels: [] },
  translationDirection: 'latin-to-english',
  data: {
    items: [{ latinText: '<p>Puella cantat.</p>' }, { latinText: 'Pueri currunt.' }],
  },
};

const versionDocumentWith = (id: string, exercise: StoredDocument, totalPoints: number) => ({
  ...versionDocument(id, exercise),
  totalPoints,
});

const submittedAttemptDocument = (id: string, overrides: StoredDocument = {}) => ({
  id,
  studentId: 'student-1',
  versionId: 'version-a',
  passingPercentage: 70,
  origin: { kind: 'normal-test', testId: 'test-1' },
  status: 'submitted',
  startedAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  exerciseResults: {},
  score: 0,
  maxScore: 5,
  percentage: 0,
  outcome: 'not-passed',
  submittedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

const inProgressAttemptDocument = (id: string, overrides: StoredDocument = {}) => ({
  id,
  studentId: 'student-1',
  versionId: 'version-a',
  passingPercentage: 70,
  origin: { kind: 'normal-test', testId: 'test-1' },
  status: 'in-progress',
  answers: {},
  deliveryState: {
    versionId: 'version-a',
    pages: [{ id: 'page', items: [] }],
    resolvedExercises: {},
  },
  startedAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const sessionDocument = (id: string, studentId: string, origin: TestAttemptOrigin, attemptId: string) => ({
  id,
  studentId,
  origin,
  attemptId,
  createdAt: timestamp,
  updatedAt: timestamp,
});

describe('test attempt submission and sticky completion', () => {
  const normalOrigin: TestAttemptOrigin = { kind: 'normal-test', testId: 'test-1' };
  const startInput = { origin: normalOrigin };

  it('resumes legacy in-progress attempts that predate translation grading leases and budgets', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    db.seed('testVersions', 'version-a', readableLegacyInvalidVersionDocument('version-a'));
    const attemptId = 'legacy-in-progress';
    const sessionId = getTestAttemptSessionId('student-1', normalOrigin);
    db.seed('testAttempts', attemptId, inProgressAttemptDocument(attemptId));
    db.seed('testAttemptSessions', sessionId, sessionDocument(sessionId, 'student-1', normalOrigin, attemptId));
    const service = new TestAttemptService(db as never, () => timestamp);

    const resumed = await service.startAttempt(startInput, 'student-1');

    expect(resumed).toMatchObject({ resumed: true, attempt: { id: attemptId } });
    expect(resumed.attempt).not.toHaveProperty('translationGradeReservations');
    expect(resumed.attempt).not.toHaveProperty('translationGradeRequestWindows');
  });

  const startAnswerSubmit = async (
    service: TestAttemptService,
    db: FakeFirestore,
    answer: { type: 'fill'; answers: string[] } | null,
    exerciseId = 'fill.with.punctuation'
  ) => {
    const started = await service.startAttempt(startInput, 'student-1');
    if (answer) {
      await service.saveAttemptAnswers(started.attempt.id, { answers: { [exerciseId]: answer } }, 'student-1');
    }
    return service.submitAttempt(started.attempt.id, 'student-1');
  };

  it('passes at the exact threshold, freezes full-precision statistics, and purges temporary state', async () => {
    const db = new FakeFirestore();
    const items = Array.from({ length: 10 }, (_, index) => ({ text: `Q${index + 1}`, answer: `a${index + 1}` }));
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', fillExerciseWith('fill-ten', items, 5), 5));
    const service = new TestAttemptService(db as never, () => timestamp);
    const started = await service.startAttempt(startInput, 'student-1');
    await service.saveAttemptAnswers(
      started.attempt.id,
      {
        answers: {
          'fill-ten': {
            type: 'fill',
            answers: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'x', 'y', 'z'],
          },
        },
      },
      'student-1'
    );

    const result = await service.submitAttempt(started.attempt.id, 'student-1');

    expect(result.completionGranted).toBe(true);
    expect(result.attempt).toMatchObject({
      status: 'submitted',
      score: 3.5,
      maxScore: 5,
      percentage: 70,
      outcome: 'passed',
      submittedAt: timestamp,
    });
    expect(result.attempt).not.toHaveProperty('studentId');
    expect(result.attempt).not.toHaveProperty('answers');
    expect(result.attempt).not.toHaveProperty('translationGrades');
    expect(result.attempt).not.toHaveProperty('delivery');
    expect(result.attempt.exerciseResults['fill-ten']).toEqual({ title: 'Fill', awardedPoints: 3.5, maxPoints: 5 });

    const stored = db.read('testAttempts', started.attempt.id)!;
    expect(stored.status).toBe('submitted');
    expect(stored).not.toHaveProperty('answers');
    expect(stored).not.toHaveProperty('translationGrades');
    expect(stored).not.toHaveProperty('deliveryState');
    expect(db.read('testResultReviews', started.attempt.id)).toMatchObject({
      content: {
        pages: [
          {
            items: [
              expect.objectContaining({
                id: 'fill-ten',
                studentAnswer: {
                  type: 'fill',
                  answers: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'x', 'y', 'z'],
                },
              }),
            ],
          },
        ],
      },
    });
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);

    expect(db.read('userProgress', 'student-1_test-1')).toEqual({
      userId: 'student-1',
      lessonId: 'test-1',
      status: 'completed',
      exerciseProgress: [],
      completedAt: timestamp,
      lastAccessedAt: timestamp,
      updatedAt: timestamp,
      progressSchemaVersion: 2,
    });
  });

  it('grades and saves test translations immediately, then normalizes saved /10 scores to maxPoints', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', translationGradingExercise, 8));
    const gradeTestTranslation = jest.fn(async ({ sourceText }: { sourceText: string }) => ({
      score: sourceText === 'Puella cantat.' ? 9 : 6,
      feedback: sourceText === 'Puella cantat.' ? 'Accurate and idiomatic.' : 'Check the subject and verb.',
    }));
    const service = new TestAttemptService(db as never, () => timestamp, { gradeTestTranslation });
    const started = await service.startAttempt(startInput, 'student-1');
    const firstGradedAttempt = await service.gradeTranslationItem(
      started.attempt.id,
      {
        exerciseId: 'translation-assessment',
        itemIndex: 0,
        userTranslation: 'The girl sings.',
      },
      'student-1'
    );
    await service.gradeTranslationItem(
      started.attempt.id,
      {
        exerciseId: 'translation-assessment',
        itemIndex: 1,
        userTranslation: 'The boys run.',
      },
      'student-1'
    );

    const result = await service.submitAttempt(started.attempt.id, 'student-1');

    expect(firstGradedAttempt.translationGrades['translation-assessment']['0']).toEqual({
      translation: 'The girl sings.',
      score: 9,
      feedback: 'Accurate and idiomatic.',
    });
    expect(firstGradedAttempt.answers['translation-assessment']).toEqual({
      type: 'translation-grading',
      translations: ['The girl sings.', ''],
    });
    expect(gradeTestTranslation).toHaveBeenCalledTimes(2);
    expect(result.attempt).toMatchObject({ score: 6, maxScore: 8, percentage: 75, outcome: 'passed' });
    expect(result.attempt.exerciseResults['translation-assessment']).toEqual({
      title: 'Translate',
      awardedPoints: 6,
      maxPoints: 8,
    });
  });

  it('returns an existing translation grade idempotently and rejects grade fishing or reset attempts', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', translationGradingExercise, 8));
    const gradeTestTranslation = jest.fn(async () => ({ score: 9, feedback: 'Accurate and idiomatic.' }));
    const service = new TestAttemptService(db as never, () => timestamp, { gradeTestTranslation });
    const started = await service.startAttempt(startInput, 'student-1');
    const input = {
      exerciseId: 'translation-assessment',
      itemIndex: 0,
      userTranslation: 'The girl sings.',
    };

    const first = await service.gradeTranslationItem(started.attempt.id, input, 'student-1');
    const retry = await service.gradeTranslationItem(started.attempt.id, input, 'student-1');

    expect(retry.translationGrades).toEqual(first.translationGrades);
    expect(gradeTestTranslation).toHaveBeenCalledTimes(1);
    await expect(
      service.gradeTranslationItem(started.attempt.id, { ...input, userTranslation: 'A girl is singing.' }, 'student-1')
    ).rejects.toMatchObject({ code: 'ATTEMPT_TRANSLATION_ALREADY_GRADED', status: 409 });
    await expect(
      service.saveAttemptAnswers(started.attempt.id, { answers: { 'translation-assessment': null } }, 'student-1')
    ).rejects.toMatchObject({ code: 'ATTEMPT_TRANSLATION_ALREADY_GRADED', status: 409 });
    expect(gradeTestTranslation).toHaveBeenCalledTimes(1);
    expect(db.read('testAttempts', started.attempt.id)?.translationGradeRequestWindows).toMatchObject({
      'translation-assessment': { '0': { count: 1 } },
    });
    for (const studentAttempt of [started.attempt, first, retry]) {
      expect(studentAttempt).not.toHaveProperty('translationGradeReservations');
      expect(studentAttempt).not.toHaveProperty('translationGradeRequestWindows');
    }
  });

  it('reserves translation items so concurrent requests cannot invoke the provider twice', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', translationGradingExercise, 8));
    let providerStarted!: () => void;
    let finishProvider!: (output: { score: number; feedback: string }) => void;
    const startedProvider = new Promise<void>(resolve => {
      providerStarted = resolve;
    });
    const providerOutput = new Promise<{ score: number; feedback: string }>(resolve => {
      finishProvider = resolve;
    });
    const gradeTestTranslation = jest.fn(() => {
      providerStarted();
      return providerOutput;
    });
    const service = new TestAttemptService(db as never, () => timestamp, { gradeTestTranslation });
    const started = await service.startAttempt(startInput, 'student-1');
    const input = {
      exerciseId: 'translation-assessment',
      itemIndex: 0,
      userTranslation: 'The girl sings.',
    };

    const firstRequest = service.gradeTranslationItem(started.attempt.id, input, 'student-1');
    await startedProvider;

    await expect(service.gradeTranslationItem(started.attempt.id, input, 'student-1')).rejects.toMatchObject({
      code: 'ATTEMPT_TRANSLATION_GRADING_IN_PROGRESS',
      status: 409,
    });
    await expect(service.submitAttempt(started.attempt.id, 'student-1')).rejects.toMatchObject({
      code: 'ATTEMPT_TRANSLATION_GRADING_IN_PROGRESS',
      status: 409,
    });
    expect(gradeTestTranslation).toHaveBeenCalledTimes(1);
    expect(db.read('testAttempts', started.attempt.id)?.translationGradeRequestWindows).toMatchObject({
      'translation-assessment': { '0': { count: 1 } },
    });

    finishProvider({ score: 9, feedback: 'Accurate and idiomatic.' });
    await expect(firstRequest).resolves.toMatchObject({
      translationGrades: {
        'translation-assessment': {
          '0': { translation: input.userTranslation, score: 9 },
        },
      },
    });
    expect(db.read('testAttempts', started.attempt.id)?.translationGradeReservations).toEqual({});
  });

  it('reclaims an expired translation reservation left by an interrupted request', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', translationGradingExercise, 8));
    const gradeTestTranslation = jest.fn(async () => ({ score: 9, feedback: 'Accurate and idiomatic.' }));
    const service = new TestAttemptService(db as never, () => timestamp, { gradeTestTranslation });
    const started = await service.startAttempt(startInput, 'student-1');
    const storedAttempt = db.read('testAttempts', started.attempt.id)!;
    db.seed('testAttempts', started.attempt.id, {
      ...storedAttempt,
      translationGradeReservations: {
        'translation-assessment': {
          '0': {
            token: '00000000-0000-4000-8000-000000000001',
            expiresAt: '2026-07-20T11:59:59.000Z',
          },
        },
      },
    });

    await expect(
      service.gradeTranslationItem(
        started.attempt.id,
        {
          exerciseId: 'translation-assessment',
          itemIndex: 0,
          userTranslation: 'The girl sings.',
        },
        'student-1'
      )
    ).resolves.toMatchObject({
      translationGrades: {
        'translation-assessment': {
          '0': { translation: 'The girl sings.', score: 9 },
        },
      },
    });
    expect(gradeTestTranslation).toHaveBeenCalledTimes(1);
  });

  it('releases the reservation and keeps a translation item retryable when AI grading is unavailable', async () => {
    const db = new FakeFirestore();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', translationGradingExercise, 8));
    const gradeTestTranslation = jest
      .fn()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({ score: 9, feedback: 'Accurate and idiomatic.' });
    const service = new TestAttemptService(db as never, () => timestamp, {
      gradeTestTranslation,
    });
    const started = await service.startAttempt(startInput, 'student-1');
    const input = {
      exerciseId: 'translation-assessment',
      itemIndex: 0,
      userTranslation: 'The girl sings.',
    };
    await expect(service.gradeTranslationItem(started.attempt.id, input, 'student-1')).rejects.toMatchObject({
      code: 'ATTEMPT_GRADING_UNAVAILABLE',
      status: 503,
    });
    expect(db.read('testAttempts', started.attempt.id)).toMatchObject({
      status: 'in-progress',
      answers: {},
      translationGrades: {},
      translationGradeReservations: {},
    });
    await expect(service.gradeTranslationItem(started.attempt.id, input, 'student-1')).resolves.toMatchObject({
      translationGrades: {
        'translation-assessment': {
          '0': { translation: input.userTranslation, score: 9 },
        },
      },
    });
    expect(gradeTestTranslation).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('enforces a durable provider request budget across failures and generic answer saves', async () => {
    const db = new FakeFirestore();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', translationGradingExercise, 8));
    const gradeTestTranslation = jest.fn(async () => ({ score: Number.NaN, feedback: 'Malformed score.' }));
    const service = new TestAttemptService(db as never, () => timestamp, { gradeTestTranslation });
    const started = await service.startAttempt(startInput, 'student-1');
    const input = {
      exerciseId: 'translation-assessment',
      itemIndex: 0,
      userTranslation: 'The girl sings.',
    };

    for (let index = 0; index < MAX_TRANSLATION_GRADING_REQUESTS_PER_WINDOW - 1; index += 1) {
      await expect(service.gradeTranslationItem(started.attempt.id, input, 'student-1')).rejects.toMatchObject({
        code: 'ATTEMPT_GRADING_UNAVAILABLE',
        status: 503,
      });
    }

    // The generic answer endpoint must preserve the server-owned request window.
    await service.saveAttemptAnswers(started.attempt.id, { answers: { 'translation-assessment': null } }, 'student-1');
    await expect(service.gradeTranslationItem(started.attempt.id, input, 'student-1')).rejects.toMatchObject({
      code: 'ATTEMPT_GRADING_UNAVAILABLE',
      status: 503,
    });
    await expect(service.gradeTranslationItem(started.attempt.id, input, 'student-1')).rejects.toMatchObject({
      code: 'ATTEMPT_TRANSLATION_GRADING_RATE_LIMITED',
      status: 429,
    });

    expect(gradeTestTranslation).toHaveBeenCalledTimes(MAX_TRANSLATION_GRADING_REQUESTS_PER_WINDOW);
    expect(db.read('testAttempts', started.attempt.id)?.translationGradeRequestWindows).toEqual({
      'translation-assessment': {
        '0': { windowStartedAt: timestamp, count: MAX_TRANSLATION_GRADING_REQUESTS_PER_WINDOW },
      },
    });
    expect(await service.getActiveAttempt(startInput.origin, 'student-1')).not.toHaveProperty(
      'translationGradeRequestWindows'
    );
    consoleError.mockRestore();
  });

  it('stops before provider grading when the service-wide AI quota is exhausted', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', translationGradingExercise, 8));
    const gradeTestTranslation = jest.fn(async () => ({ score: 9, feedback: 'Accurate and idiomatic.' }));
    const consumeGlobalAIQuota = jest.fn(async () => {
      throw new AIRequestThrottleError(60_000);
    });
    const service = new TestAttemptService(db as never, () => timestamp, {
      gradeTestTranslation,
      consumeGlobalAIQuota,
    });
    const started = await service.startAttempt(startInput, 'student-1');

    await expect(
      service.gradeTranslationItem(
        started.attempt.id,
        {
          exerciseId: 'translation-assessment',
          itemIndex: 0,
          userTranslation: 'The girl sings.',
        },
        'student-1'
      )
    ).rejects.toMatchObject({ code: 'ATTEMPT_TRANSLATION_GRADING_RATE_LIMITED', status: 429 });

    expect(consumeGlobalAIQuota).toHaveBeenCalledWith(1);
    expect(gradeTestTranslation).not.toHaveBeenCalled();
    expect(db.read('testAttempts', started.attempt.id)?.translationGradeReservations).toEqual({});
  });

  it('resets the provider request budget after the fixed window elapses', async () => {
    const db = new FakeFirestore();
    let now = timestamp;
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', translationGradingExercise, 8));
    const gradeTestTranslation = jest.fn(async () => ({ score: 9, feedback: 'Accurate and idiomatic.' }));
    const service = new TestAttemptService(db as never, () => now, { gradeTestTranslation });
    const started = await service.startAttempt(startInput, 'student-1');
    const storedAttempt = db.read('testAttempts', started.attempt.id)!;
    db.seed('testAttempts', started.attempt.id, {
      ...storedAttempt,
      translationGradeRequestWindows: {
        'translation-assessment': {
          '0': { windowStartedAt: timestamp, count: MAX_TRANSLATION_GRADING_REQUESTS_PER_WINDOW },
        },
      },
    });
    now = new Date(Date.parse(timestamp) + TRANSLATION_GRADING_REQUEST_WINDOW_MS).toISOString();

    await expect(
      service.gradeTranslationItem(
        started.attempt.id,
        {
          exerciseId: 'translation-assessment',
          itemIndex: 0,
          userTranslation: 'The girl sings.',
        },
        'student-1'
      )
    ).resolves.toMatchObject({
      translationGrades: { 'translation-assessment': { '0': { score: 9 } } },
    });
    expect(gradeTestTranslation).toHaveBeenCalledTimes(1);
    expect(db.read('testAttempts', started.attempt.id)?.translationGradeRequestWindows).toEqual({
      'translation-assessment': { '0': { windowStartedAt: now, count: 1 } },
    });
  });

  it('completes a score-only test on submission regardless of score', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', { ...testDocument(['version-a']), passingPercentage: null });
    db.seed('testVersions', 'version-a', versionDocument('version-a'));
    const service = new TestAttemptService(db as never, () => timestamp);

    const result = await startAnswerSubmit(service, db, null);

    expect(result.attempt).toMatchObject({ outcome: 'score-only', score: 0, percentage: 0 });
    expect(result.completionGranted).toBe(true);
    expect(db.read('userProgress', 'student-1_test-1')).toMatchObject({ status: 'completed' });
  });

  it('does not grant completion after a failed submission', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestAttemptService(db as never, () => timestamp);

    const result = await startAnswerSubmit(service, db, { type: 'fill', answers: ['wrong'] });

    expect(result.attempt).toMatchObject({ outcome: 'not-passed', score: 0, percentage: 0 });
    expect(result.completionGranted).toBe(false);
    expect(db.read('userProgress', 'student-1_test-1')).toBeUndefined();
    const stored = db.read('testAttempts', result.attempt.id)!;
    expect(stored).not.toHaveProperty('answers');
    expect(stored).not.toHaveProperty('deliveryState');
    expect(db.read('testResultReviews', result.attempt.id)).toMatchObject({
      content: {
        pages: [{ items: [expect.objectContaining({ studentAnswer: { type: 'fill', answers: ['wrong'] } })] }],
      },
    });
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
  });

  it('keeps completion permanent across later failing and passing retakes', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    let now = '2026-07-20T12:00:00.000Z';
    const service = new TestAttemptService(db as never, () => now);

    const passed = await startAnswerSubmit(service, db, { type: 'fill', answers: ['love'] });
    expect(passed.completionGranted).toBe(true);

    now = '2026-07-21T12:00:00.000Z';
    const failed = await startAnswerSubmit(service, db, { type: 'fill', answers: ['wrong'] });
    expect(failed.attempt.outcome).toBe('not-passed');
    expect(db.read('userProgress', 'student-1_test-1')).toMatchObject({
      status: 'completed',
      completedAt: '2026-07-20T12:00:00.000Z',
    });

    now = '2026-07-22T12:00:00.000Z';
    const passedAgain = await startAnswerSubmit(service, db, { type: 'fill', answers: ['love'] });
    expect(passedAgain.attempt.outcome).toBe('passed');
    expect(passedAgain.completionGranted).toBe(false);
    expect(db.read('userProgress', 'student-1_test-1')).toMatchObject({
      status: 'completed',
      completedAt: '2026-07-20T12:00:00.000Z',
    });
  });

  it('returns the stored result idempotently for duplicate submissions', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestAttemptService(db as never, () => timestamp);
    const started = await service.startAttempt(startInput, 'student-1');
    await service.saveAttemptAnswers(
      started.attempt.id,
      { answers: { 'fill.with.punctuation': { type: 'fill', answers: ['love'] } } },
      'student-1'
    );

    const first = await service.submitAttempt(started.attempt.id, 'student-1');
    const writesBefore = db.writeLog.length;
    const duplicate = await service.submitAttempt(started.attempt.id, 'student-1');

    expect(duplicate.attempt).toEqual(first.attempt);
    expect(duplicate.completionGranted).toBe(false);
    expect(db.writeLog).toHaveLength(writesBefore);
  });

  it('loads a separately frozen review without exposing its grading inputs in the attempt DTO', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestAttemptService(db as never, () => timestamp);
    const submitted = await startAnswerSubmit(service, db, { type: 'fill', answers: ['love'] });

    const result = await service.getSubmittedResult(submitted.attempt.id, 'student-1');

    expect(result.attempt).not.toHaveProperty('answers');
    expect(result.attempt).not.toHaveProperty('translationGrades');
    expect(result.attempt).not.toHaveProperty('delivery');
    expect(result.review?.content.pages[0].items[0]).toMatchObject({
      studentAnswer: { type: 'fill', answers: ['love'] },
    });
  });

  it('rejects review documents that do not match the submitted attempt identity', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new TestAttemptService(db as never, () => timestamp);
    const submitted = await startAnswerSubmit(service, db, { type: 'fill', answers: ['love'] });
    const attemptId = submitted.attempt.id;
    const review = db.read('testResultReviews', attemptId)!;

    for (const mismatch of [
      { studentId: 'student-2' },
      { versionId: 'version-b' },
      { origin: { kind: 'normal-test', testId: 'test-2' } },
    ]) {
      db.seed('testResultReviews', attemptId, { ...review, ...mismatch });
      await expect(service.getSubmittedResult(attemptId, 'student-1')).resolves.toMatchObject({ review: null });
    }

    errors.mockRestore();
  });

  it('rebuilds legacy embedded reviews while keeping summary-only attempts readable', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestAttemptService(db as never, () => timestamp);
    const started = await service.startAttempt(startInput, 'student-1');
    await service.saveAttemptAnswers(
      started.attempt.id,
      { answers: { 'fill.with.punctuation': { type: 'fill', answers: ['love'] } } },
      'student-1'
    );
    const working = db.read('testAttempts', started.attempt.id)!;
    await service.submitAttempt(started.attempt.id, 'student-1');
    const summary = db.read('testAttempts', started.attempt.id)!;

    db.seed('testAttempts', 'legacy-detailed', {
      ...summary,
      id: 'legacy-detailed',
      answers: working.answers,
      translationGrades: working.translationGrades,
      deliveryState: working.deliveryState,
    });
    db.seed('testAttempts', 'legacy-summary', { ...summary, id: 'legacy-summary' });

    await expect(service.getSubmittedResult('legacy-detailed', 'student-1')).resolves.toMatchObject({
      review: {
        content: {
          pages: [{ items: [expect.objectContaining({ studentAnswer: { type: 'fill', answers: ['love'] } })] }],
        },
      },
    });
    await expect(service.getSubmittedResult('legacy-summary', 'student-1')).resolves.toMatchObject({ review: null });
  });

  it('does not clear a session pointer that belongs to a newer active attempt', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestAttemptService(db as never, () => timestamp);
    const active = await service.startAttempt(startInput, 'student-1');
    const activeDocument = db.read('testAttempts', active.attempt.id)!;
    db.seed('testAttempts', 'orphan-attempt', { ...activeDocument, id: 'orphan-attempt' });

    await service.submitAttempt('orphan-attempt', 'student-1');

    const sessionId = getTestAttemptSessionId('student-1', normalOrigin);
    expect(db.read('testAttemptSessions', sessionId)).toMatchObject({ attemptId: active.attempt.id });
    await expect(service.startAttempt(startInput, 'student-1')).resolves.toMatchObject({
      resumed: true,
      attempt: { id: active.attempt.id },
    });
  });

  it('passes when floating-point representation lands just below an exactly-earned threshold', async () => {
    // 9 of 10 correct on a 9-point exercise awards 8.1 points; (8.1/9)*100 is
    // 89.99999999999999 in IEEE 754 although the true score is exactly 90%.
    const db = new FakeFirestore();
    const items = Array.from({ length: 10 }, (_, index) => ({ text: `Q${index + 1}`, answer: `a${index + 1}` }));
    db.seed('lessons', 'test-1', { ...testDocument(['version-a']), passingPercentage: 90 });
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', fillExerciseWith('fill-ten', items, 9), 9));
    const service = new TestAttemptService(db as never, () => timestamp);
    const started = await service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1');
    await service.saveAttemptAnswers(
      started.attempt.id,
      {
        answers: {
          'fill-ten': {
            type: 'fill',
            answers: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'x'],
          },
        },
      },
      'student-1'
    );

    const result = await service.submitAttempt(started.attempt.id, 'student-1');

    expect(result.attempt.score).toBeCloseTo(8.1);
    expect(result.attempt.percentage).toBeLessThan(90);
    expect(result.attempt.outcome).toBe('passed');
    expect(result.completionGranted).toBe(true);
  });

  it('never writes learning-path completion for a mock-test submission', async () => {
    const db = new FakeFirestore();
    db.seed('testVersions', 'mock-version', versionDocument('mock-version'));
    db.seed('mockTests', 'mock-1', {
      id: 'mock-1',
      versionId: 'mock-version',
      parent: { kind: 'standalone' },
      title: 'Mock test',
      description: '',
      passingPercentage: 70,
      status: 'active',
      isLive: true,
      mockOrder: 0,
    });
    const service = new TestAttemptService(db as never, () => timestamp);
    const started = await service.startAttempt({ origin: { kind: 'mock-test', mockTestId: 'mock-1' } }, 'student-1');
    await service.saveAttemptAnswers(
      started.attempt.id,
      { answers: { 'fill.with.punctuation': { type: 'fill', answers: ['love'] } } },
      'student-1'
    );

    const result = await service.submitAttempt(started.attempt.id, 'student-1');

    expect(result.attempt).toMatchObject({ outcome: 'passed', percentage: 100 });
    expect(result.completionGranted).toBe(false);
    expect(db.readAll('userProgress')).toHaveLength(0);
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
    expect(db.read('studentMockResults', getStudentMockResultId('student-1', 'mock-1'))).toMatchObject({
      studentId: 'student-1',
      mockTestId: 'mock-1',
      latest: { attemptId: started.attempt.id, percentage: 100, submittedAt: timestamp },
    });
  });

  it('keeps the in-progress attempt intact when frozen grading fails', async () => {
    const db = new FakeFirestore();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.seed('testAttempts', 'attempt-corrupt', {
      id: 'attempt-corrupt',
      studentId: 'student-1',
      versionId: 'version-a',
      passingPercentage: 70,
      origin: normalOrigin,
      status: 'in-progress',
      answers: {},
      startedAt: timestamp,
      updatedAt: timestamp,
      deliveryState: {
        versionId: 'version-a',
        pages: [
          {
            id: 'page',
            items: [
              {
                id: 'unscored',
                type: 'fill',
                title: 'Fill',
                instructions: '',
                feedbackConfig: { escalationLevels: [] },
                data: { items: [{ text: 'Q', answer: 'a' }] },
              },
            ],
          },
        ],
        resolvedExercises: {},
      },
    });
    db.seed(
      'testAttemptSessions',
      getTestAttemptSessionId('student-1', normalOrigin),
      sessionDocument(getTestAttemptSessionId('student-1', normalOrigin), 'student-1', normalOrigin, 'attempt-corrupt')
    );
    const service = new TestAttemptService(db as never, () => timestamp);

    await expect(service.submitAttempt('attempt-corrupt', 'student-1')).rejects.toMatchObject({
      code: 'TEST_CONFIGURATION_ERROR',
    });
    const stored = db.read('testAttempts', 'attempt-corrupt')!;
    expect(stored.status).toBe('in-progress');
    expect(stored).toHaveProperty('deliveryState');
    expect(db.readAll('testAttemptSessions')).toHaveLength(1);
    consoleError.mockRestore();
  });
});

describe('test attempt summaries', () => {
  const normalOrigin: TestAttemptOrigin = { kind: 'normal-test', testId: 'test-1' };

  it('defaults missing server-only translation state on legacy attempts without exposing it', async () => {
    const db = new FakeFirestore();
    const attemptId = 'legacy-active-attempt';
    const sessionId = getTestAttemptSessionId('student-1', normalOrigin);
    db.seed('testAttempts', attemptId, inProgressAttemptDocument(attemptId));
    db.seed('testAttemptSessions', sessionId, sessionDocument(sessionId, 'student-1', normalOrigin, attemptId));
    const service = new TestAttemptService(db as never, () => timestamp);

    const projected = await service.getActiveAttempt(normalOrigin, 'student-1');

    expect(projected).toMatchObject({ id: attemptId, status: 'in-progress' });
    expect(projected).not.toHaveProperty('translationGradeReservations');
    expect(projected).not.toHaveProperty('translationGradeRequestWindows');
  });

  it('derives best, latest, count, and in-progress state per student and origin', async () => {
    const db = new FakeFirestore();
    db.seed(
      'testAttempts',
      's1',
      submittedAttemptDocument('s1', {
        percentage: 100,
        score: 5,
        outcome: 'passed',
        submittedAt: '2026-01-01T00:00:00.000Z',
      })
    );
    db.seed(
      'testAttempts',
      's2',
      submittedAttemptDocument('s2', { percentage: 50, score: 2.5, submittedAt: '2026-03-01T00:00:00.000Z' })
    );
    db.seed(
      'testAttempts',
      's3',
      submittedAttemptDocument('s3', {
        percentage: 100,
        score: 5,
        outcome: 'passed',
        submittedAt: '2026-02-01T00:00:00.000Z',
      })
    );
    db.seed(
      'testAttempts',
      'noise-other-student',
      submittedAttemptDocument('noise-other-student', { studentId: 'student-2' })
    );
    db.seed(
      'testAttempts',
      'noise-other-test',
      submittedAttemptDocument('noise-other-test', { origin: { kind: 'normal-test', testId: 'test-2' } })
    );
    db.seed('testAttempts', 'active-attempt', inProgressAttemptDocument('active-attempt'));
    const service = new TestAttemptService(db as never, () => timestamp);

    const summary = await service.getAttemptSummary(normalOrigin, 'student-1');

    expect(summary.origin).toEqual(normalOrigin);
    expect(summary.attemptCount).toBe(3);
    // Best breaks the percentage tie by most recent submission; latest is the most recent overall.
    expect(summary.best).toMatchObject({ attemptId: 's3', percentage: 100, submittedAt: '2026-02-01T00:00:00.000Z' });
    expect(summary.latest).toMatchObject({ attemptId: 's2', percentage: 50, submittedAt: '2026-03-01T00:00:00.000Z' });
    expect(summary.inProgressAttemptId).toBeNull();

    db.seed(
      'testAttemptSessions',
      getTestAttemptSessionId('student-1', normalOrigin),
      sessionDocument(getTestAttemptSessionId('student-1', normalOrigin), 'student-1', normalOrigin, 'active-attempt')
    );
    const withActive = await service.getAttemptSummary(normalOrigin, 'student-1');
    expect(withActive.inProgressAttemptId).toBe('active-attempt');
  });

  it('does not return corrupt or wrong-origin attempts as resumable', async () => {
    const db = new FakeFirestore();
    const sessionId = getTestAttemptSessionId('student-1', normalOrigin);
    db.seed('testAttemptSessions', sessionId, sessionDocument(sessionId, 'student-1', normalOrigin, 'active-attempt'));
    db.seed('testAttempts', 'active-attempt', {
      id: 'active-attempt',
      studentId: 'student-1',
      status: 'in-progress',
    });
    const service = new TestAttemptService(db as never, () => timestamp);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.getAttemptSummary(normalOrigin, 'student-1')).resolves.toMatchObject({
      inProgressAttemptId: null,
    });

    db.seed(
      'testAttempts',
      'active-attempt',
      inProgressAttemptDocument('active-attempt', {
        origin: { kind: 'normal-test', testId: 'different-test' },
      })
    );
    await expect(service.getAttemptSummary(normalOrigin, 'student-1')).resolves.toMatchObject({
      inProgressAttemptId: null,
    });
    consoleError.mockRestore();
  });

  it('scopes summaries to a mock-test origin', async () => {
    const db = new FakeFirestore();
    const mockOrigin: TestAttemptOrigin = { kind: 'mock-test', mockTestId: 'mock-1' };
    db.seed(
      'testAttempts',
      'm1',
      submittedAttemptDocument('m1', { origin: mockOrigin, percentage: 60, submittedAt: '2026-01-01T00:00:00.000Z' })
    );
    db.seed(
      'testAttempts',
      'm2',
      submittedAttemptDocument('m2', {
        origin: mockOrigin,
        percentage: 80,
        outcome: 'passed',
        submittedAt: '2026-02-01T00:00:00.000Z',
      })
    );
    const service = new TestAttemptService(db as never, () => timestamp);

    const summary = await service.getAttemptSummary(mockOrigin, 'student-1');

    expect(summary.attemptCount).toBe(2);
    expect(summary.best).toMatchObject({ attemptId: 'm2', percentage: 80 });
    expect(summary.latest).toMatchObject({ attemptId: 'm2' });
  });
});

describe('attempt size message and rotation validation cost', () => {
  const normalOrigin: TestAttemptOrigin = { kind: 'normal-test', testId: 'test-1' };

  it('uses a neutral attempt-size message at start and during answer saves', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const constrained = new TestAttemptService(db as never, () => timestamp, { maxAttemptDocumentBytes: 100 });

    const startFailure = await constrained
      .startAttempt({ origin: normalOrigin }, 'student-1')
      .catch((error: unknown) => error);
    expect(startFailure).toMatchObject({ code: 'ATTEMPT_TOO_LARGE', status: 422 });
    expect((startFailure as Error).message).toContain('too large to save safely');
    expect((startFailure as Error).message).not.toContain('too large to start');

    const service = new TestAttemptService(db as never, () => timestamp);
    const started = await service.startAttempt({ origin: normalOrigin }, 'student-1');
    const saveFailure = await constrained
      .saveAttemptAnswers(
        started.attempt.id,
        { answers: { 'fill.with.punctuation': { type: 'fill', answers: ['love'] } } },
        'student-1'
      )
      .catch((error: unknown) => error);
    expect(saveFailure).toMatchObject({ code: 'ATTEMPT_TOO_LARGE', status: 422 });
    expect((saveFailure as Error).message).toContain('too large to save safely');
    consoleError.mockRestore();
  });

  it('rejects review growth while saving instead of accepting an attempt that cannot be submitted', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new TestAttemptService(db as never, () => timestamp, { maxReviewDocumentBytes: 10_000 });
    const started = await service.startAttempt({ origin: normalOrigin }, 'student-1');

    await expect(
      service.saveAttemptAnswers(
        started.attempt.id,
        { answers: { 'fill.with.punctuation': { type: 'fill', answers: ['x'.repeat(20_000)] } } },
        'student-1'
      )
    ).rejects.toMatchObject({ code: 'ATTEMPT_TOO_LARGE', status: 422 });

    await expect(service.submitAttempt(started.attempt.id, 'student-1')).resolves.toMatchObject({
      attempt: { status: 'submitted' },
    });
    consoleError.mockRestore();
  });

  it('validates non-selected rotation versions from summaries and loads pages only for the selection', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a', 'version-b']));
    db.seed('testVersions', 'version-a', versionDocument('version-a'));
    db.seed('testVersions', 'version-b', {
      // Valid server-derived summary, but page content that would fail a full document parse.
      id: 'version-b',
      name: 'version-b',
      pages: 'corrupt-pages',
      totalPages: 1,
      totalItems: 1,
      totalExercises: 1,
      totalPoints: 3,
    });
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });

    const result = await service.startAttempt({ origin: normalOrigin }, 'student-1');

    expect(result.attempt.versionId).toBe('version-a');
  });

  it('rejects start when a non-selected rotation version summary is invalid', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a', 'version-b']));
    db.seed('testVersions', 'version-a', versionDocument('version-a'));
    db.seed('testVersions', 'version-b', { id: 'version-b', name: 'version-b', pages: [], totalPages: 'wrong' });
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.startAttempt({ origin: normalOrigin }, 'student-1')).rejects.toMatchObject({
      code: 'TEST_CONFIGURATION_ERROR',
    });
    expect(db.readAll('testAttempts')).toHaveLength(0);
    consoleError.mockRestore();
  });
});
