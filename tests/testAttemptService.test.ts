import { getTestAttemptSessionId, TestService } from '@/src/lib/tests/service';
import type { TestAttemptOrigin } from '@/src/types/test';

jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));
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

const testDocument = (rotationVersions = ['version-a', 'version-b']) => ({
  id: 'test-1',
  kind: 'test',
  title: 'Chapter test',
  description: '',
  passingPercentage: 70,
  rotationVersions: rotationVersions.map(versionId => ({ versionId })),
  isLive: true,
  liveOrder: 1,
  publishedAt: timestamp,
  publishedBy: 'admin-1',
  createdAt: timestamp,
  createdBy: 'admin-1',
  updatedAt: timestamp,
  updatedBy: 'admin-1',
});

const seedNormalTest = (db: FakeFirestore, versions = ['version-a', 'version-b']) => {
  db.seed('lessons', 'test-1', testDocument(versions));
  versions.forEach(versionId => db.seed('testVersions', versionId, versionDocument(versionId)));
};

describe('test attempt persistence service', () => {
  it('converges concurrent starts on one resumable attempt and freezes assignment settings', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db);
    const service = new TestService(db as never, () => timestamp, { random: () => 0 });
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
    const service = new TestService(db as never, () => timestamp, { random: () => 0 });

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
    const service = new TestService(db as never, () => timestamp, { random: () => 0 });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1')
    ).rejects.toMatchObject({ code: 'TEST_CONFIGURATION_ERROR', status: 409 });
    expect(db.readAll('testAttempts')).toHaveLength(0);
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
    consoleError.mockRestore();
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
    const service = new TestService(db as never, () => timestamp);

    const result = await service.startAttempt({ origin: { kind: 'mock-test', mockTestId: 'mock-1' } }, 'student-1');

    expect(result.attempt).toMatchObject({ versionId: 'mock-version', passingPercentage: 80 });
  });

  it('persists and explicitly clears canonical answers by whole-map writes', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestService(db as never, () => timestamp);
    const started = await service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1');

    const answered = await service.saveAttemptAnswer(
      started.attempt.id,
      {
        exerciseId: 'fill.with.punctuation',
        answer: { type: 'fill', answers: ['love'] },
      },
      'student-1'
    );
    expect(answered.answers['fill.with.punctuation']).toEqual({ type: 'fill', answers: ['love'] });
    await expect(service.getAttempt(started.attempt.id, 'student-2')).rejects.toMatchObject({
      code: 'ATTEMPT_NOT_FOUND',
    });

    const cleared = await service.saveAttemptAnswer(
      started.attempt.id,
      { exerciseId: 'fill.with.punctuation', answer: null },
      'student-1'
    );
    expect(cleared.answers).toEqual({});
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
        posConfigs: {},
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
    const service = new TestService(db as never, () => timestamp, { loadGeneratedWords: loadGeneratedWords as never });

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
    const service = new TestService(db as never, () => timestamp, { maxAttemptDocumentBytes: 100 });

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

const fillExerciseWith = (id: string, items: Array<{ text: string; answer: string }>, maxPoints: number) => ({
  id,
  type: 'fill',
  title: 'Fill',
  instructions: '',
  maxPoints,
  feedbackConfig: { escalationLevels: [] },
  data: { items },
});

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

  const startAnswerSubmit = async (
    service: TestService,
    db: FakeFirestore,
    answer: { type: 'fill'; answers: string[] } | null,
    exerciseId = 'fill.with.punctuation'
  ) => {
    const started = await service.startAttempt(startInput, 'student-1');
    if (answer) {
      await service.saveAttemptAnswer(started.attempt.id, { exerciseId, answer }, 'student-1');
    }
    return service.submitAttempt(started.attempt.id, 'student-1');
  };

  it('passes at the exact threshold, freezes full-precision statistics, and purges temporary state', async () => {
    const db = new FakeFirestore();
    const items = Array.from({ length: 10 }, (_, index) => ({ text: `Q${index + 1}`, answer: `a${index + 1}` }));
    db.seed('lessons', 'test-1', testDocument(['version-a']));
    db.seed('testVersions', 'version-a', versionDocumentWith('version-a', fillExerciseWith('fill-ten', items, 5), 5));
    const service = new TestService(db as never, () => timestamp);
    const started = await service.startAttempt(startInput, 'student-1');
    await service.saveAttemptAnswer(
      started.attempt.id,
      {
        exerciseId: 'fill-ten',
        answer: { type: 'fill', answers: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'x', 'y', 'z'] },
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
    expect(result.attempt.exerciseResults['fill-ten']).toEqual({ title: 'Fill', awardedPoints: 3.5, maxPoints: 5 });

    const stored = db.read('testAttempts', started.attempt.id)!;
    expect(stored.status).toBe('submitted');
    expect(stored).not.toHaveProperty('answers');
    expect(stored).not.toHaveProperty('deliveryState');
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

  it('completes a score-only test on submission regardless of score', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', { ...testDocument(['version-a']), passingPercentage: null });
    db.seed('testVersions', 'version-a', versionDocument('version-a'));
    const service = new TestService(db as never, () => timestamp);

    const result = await startAnswerSubmit(service, db, null);

    expect(result.attempt).toMatchObject({ outcome: 'score-only', score: 0, percentage: 0 });
    expect(result.completionGranted).toBe(true);
    expect(db.read('userProgress', 'student-1_test-1')).toMatchObject({ status: 'completed' });
  });

  it('does not grant completion after a failed submission', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestService(db as never, () => timestamp);

    const result = await startAnswerSubmit(service, db, { type: 'fill', answers: ['wrong'] });

    expect(result.attempt).toMatchObject({ outcome: 'not-passed', score: 0, percentage: 0 });
    expect(result.completionGranted).toBe(false);
    expect(db.read('userProgress', 'student-1_test-1')).toBeUndefined();
    const stored = db.read('testAttempts', result.attempt.id)!;
    expect(stored).not.toHaveProperty('answers');
    expect(stored).not.toHaveProperty('deliveryState');
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
  });

  it('keeps completion permanent across later failing and passing retakes', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    let now = '2026-07-20T12:00:00.000Z';
    const service = new TestService(db as never, () => now);

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
    const service = new TestService(db as never, () => timestamp);
    const started = await service.startAttempt(startInput, 'student-1');
    await service.saveAttemptAnswer(
      started.attempt.id,
      { exerciseId: 'fill.with.punctuation', answer: { type: 'fill', answers: ['love'] } },
      'student-1'
    );

    const first = await service.submitAttempt(started.attempt.id, 'student-1');
    const writesBefore = db.writeLog.length;
    const duplicate = await service.submitAttempt(started.attempt.id, 'student-1');

    expect(duplicate.attempt).toEqual(first.attempt);
    expect(duplicate.completionGranted).toBe(false);
    expect(db.writeLog).toHaveLength(writesBefore);
  });

  it('does not clear a session pointer that belongs to a newer active attempt', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestService(db as never, () => timestamp);
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
    const service = new TestService(db as never, () => timestamp);
    const started = await service.startAttempt({ origin: { kind: 'normal-test', testId: 'test-1' } }, 'student-1');
    await service.saveAttemptAnswer(
      started.attempt.id,
      {
        exerciseId: 'fill-ten',
        answer: { type: 'fill', answers: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'x'] },
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
    const service = new TestService(db as never, () => timestamp);
    const started = await service.startAttempt({ origin: { kind: 'mock-test', mockTestId: 'mock-1' } }, 'student-1');
    await service.saveAttemptAnswer(
      started.attempt.id,
      { exerciseId: 'fill.with.punctuation', answer: { type: 'fill', answers: ['love'] } },
      'student-1'
    );

    const result = await service.submitAttempt(started.attempt.id, 'student-1');

    expect(result.attempt).toMatchObject({ outcome: 'passed', percentage: 100 });
    expect(result.completionGranted).toBe(false);
    expect(db.readAll('userProgress')).toHaveLength(0);
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
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
    const service = new TestService(db as never, () => timestamp);

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
    const service = new TestService(db as never, () => timestamp);

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
    const service = new TestService(db as never, () => timestamp);
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
    const service = new TestService(db as never, () => timestamp);

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
    const constrained = new TestService(db as never, () => timestamp, { maxAttemptDocumentBytes: 100 });

    const startFailure = await constrained
      .startAttempt({ origin: normalOrigin }, 'student-1')
      .catch((error: unknown) => error);
    expect(startFailure).toMatchObject({ code: 'ATTEMPT_TOO_LARGE', status: 422 });
    expect((startFailure as Error).message).toContain('too large to save safely');
    expect((startFailure as Error).message).not.toContain('too large to start');

    const service = new TestService(db as never, () => timestamp);
    const started = await service.startAttempt({ origin: normalOrigin }, 'student-1');
    const saveFailure = await constrained
      .saveAttemptAnswer(
        started.attempt.id,
        { exerciseId: 'fill.with.punctuation', answer: { type: 'fill', answers: ['love'] } },
        'student-1'
      )
      .catch((error: unknown) => error);
    expect(saveFailure).toMatchObject({ code: 'ATTEMPT_TOO_LARGE', status: 422 });
    expect((saveFailure as Error).message).toContain('too large to save safely');
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
    const service = new TestService(db as never, () => timestamp, { random: () => 0 });

    const result = await service.startAttempt({ origin: normalOrigin }, 'student-1');

    expect(result.attempt.versionId).toBe('version-a');
  });

  it('rejects start when a non-selected rotation version summary is invalid', async () => {
    const db = new FakeFirestore();
    db.seed('lessons', 'test-1', testDocument(['version-a', 'version-b']));
    db.seed('testVersions', 'version-a', versionDocument('version-a'));
    db.seed('testVersions', 'version-b', { id: 'version-b', name: 'version-b', pages: [], totalPages: 'wrong' });
    const service = new TestService(db as never, () => timestamp, { random: () => 0 });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.startAttempt({ origin: normalOrigin }, 'student-1')).rejects.toMatchObject({
      code: 'TEST_CONFIGURATION_ERROR',
    });
    expect(db.readAll('testAttempts')).toHaveLength(0);
    consoleError.mockRestore();
  });
});

describe('test attempt session recovery', () => {
  const normalOrigin: TestAttemptOrigin = { kind: 'normal-test', testId: 'test-1' };
  const input = { origin: normalOrigin };

  it('clears a pointer to a corrupt attempt while preserving the document, then starts cleanly', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const sessionId = getTestAttemptSessionId('student-1', normalOrigin);
    db.seed('testAttempts', 'attempt-bad', { id: 'attempt-bad', unexpected: 'garbage' });
    db.seed('testAttemptSessions', sessionId, sessionDocument(sessionId, 'student-1', normalOrigin, 'attempt-bad'));
    const service = new TestService(db as never, () => timestamp);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.startAttempt(input, 'student-1')).rejects.toMatchObject({ code: 'STALE_TEST_ATTEMPT_DATA' });

    await expect(service.recoverAttemptSession(input, 'student-1')).resolves.toEqual({ recovered: true });
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
    expect(db.read('testAttempts', 'attempt-bad')).toBeDefined();

    const restarted = await service.startAttempt(input, 'student-1');
    expect(restarted.resumed).toBe(false);
    consoleError.mockRestore();
  });

  it('clears a pointer to a parseable but ungradable attempt while preserving the document', async () => {
    const db = new FakeFirestore();
    const sessionId = getTestAttemptSessionId('student-1', normalOrigin);
    db.seed('testAttempts', 'attempt-ungradable', {
      id: 'attempt-ungradable',
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
      sessionId,
      sessionDocument(sessionId, 'student-1', normalOrigin, 'attempt-ungradable')
    );
    const service = new TestService(db as never, () => timestamp);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.recoverAttemptSession(input, 'student-1')).resolves.toEqual({ recovered: true });
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
    expect(db.read('testAttempts', 'attempt-ungradable')).toBeDefined();
    consoleError.mockRestore();
  });

  it('never abandons a valid resumable attempt', async () => {
    const db = new FakeFirestore();
    seedNormalTest(db, ['version-a']);
    const service = new TestService(db as never, () => timestamp);
    await service.startAttempt(input, 'student-1');

    await expect(service.recoverAttemptSession(input, 'student-1')).resolves.toEqual({ recovered: false });
    expect(db.readAll('testAttemptSessions')).toHaveLength(1);
  });

  it('clears pointers to missing or submitted attempts and reports no pointer as a no-op', async () => {
    const db = new FakeFirestore();
    const sessionId = getTestAttemptSessionId('student-1', normalOrigin);
    db.seed('testAttemptSessions', sessionId, sessionDocument(sessionId, 'student-1', normalOrigin, 'missing-attempt'));
    const service = new TestService(db as never, () => timestamp);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.recoverAttemptSession(input, 'student-1')).resolves.toEqual({ recovered: true });
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);

    db.seed('testAttempts', 'submitted-attempt', submittedAttemptDocument('submitted-attempt'));
    db.seed(
      'testAttemptSessions',
      sessionId,
      sessionDocument(sessionId, 'student-1', normalOrigin, 'submitted-attempt')
    );
    await expect(service.recoverAttemptSession(input, 'student-1')).resolves.toEqual({ recovered: true });
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);

    await expect(service.recoverAttemptSession(input, 'student-1')).resolves.toEqual({ recovered: false });
    consoleError.mockRestore();
  });
});
