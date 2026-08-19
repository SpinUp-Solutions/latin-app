import { TestAttemptService } from '@/src/lib/tests/attempt-service';

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

  private query(state: QueryState): QueryRef {
    const make = (changes: Partial<QueryState>) => this.query({ ...state, ...changes });
    return {
      kind: 'query',
      ...state,
      where: (field, operator, value) => {
        if (operator !== '==') throw new Error(`Unsupported fake query operator ${operator}`);
        return make({ filters: [...state.filters, [field, value]] });
      },
      select: (...fields) => make({ selectedFields: fields }),
      orderBy: (field, direction = 'asc') => make({ orderings: [...state.orderings, [field, direction]] }),
      limit: count => make({ limitCount: count }),
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

const versionDocument = (id: string) => ({
  id,
  name: id,
  pages: [{ id: `${id}-page`, items: [fillExercise] }],
  totalPages: 1,
  totalItems: 1,
  totalExercises: 1,
  totalPoints: 3,
});

const testDocument = () => ({
  id: 'test-1',
  kind: 'test',
  title: 'Chapter test',
  description: '',
  passingPercentage: 70,
  rotationVersions: [{ versionId: 'version-a' }],
  createdAt: timestamp,
  createdBy: 'admin-1',
  updatedAt: timestamp,
  updatedBy: 'admin-1',
});

const seedTest = (db: FakeFirestore) => {
  db.seed('lessons', 'test-1', testDocument());
  db.seed('testVersions', 'version-a', versionDocument('version-a'));
};

const origin = { kind: 'normal-test' as const, testId: 'test-1' };

const seedSubmittedAttempt = (
  db: FakeFirestore,
  attemptId: string,
  studentId: string,
  submittedAt: string = timestamp
) => {
  db.seed('testAttempts', attemptId, {
    id: attemptId,
    studentId,
    versionId: 'version-a',
    passingPercentage: 70,
    origin,
    startedAt: submittedAt,
    updatedAt: submittedAt,
    status: 'submitted',
    exerciseResults: { 'fill.with.punctuation': { title: 'Fill', awardedPoints: 3, maxPoints: 3 } },
    score: 3,
    maxScore: 3,
    percentage: 100,
    outcome: 'passed',
    submittedAt,
  });
};

const seedReview = (db: FakeFirestore, attemptId: string, studentId: string, overrides: StoredDocument = {}) => {
  db.seed('testAttemptReviews', attemptId, {
    id: attemptId,
    reviewVersion: 1,
    studentId,
    attemptId,
    versionId: 'version-a',
    origin,
    submittedAt: timestamp,
    createdAt: timestamp,
    content: {
      pages: [
        {
          id: 'page-0',
          items: [
            {
              id: 'fill.with.punctuation',
              type: 'fill',
              title: 'Fill',
              instructions: '',
              maxPoints: 3,
              question: { items: [{ text: 'amo' }] },
              answerKey: { items: [{ text: 'amo', acceptedAnswers: ['love'] }] },
              itemResults: {
                answers: [
                  {
                    value: 'love',
                    correct: true,
                    points: { awardedPoints: 3, maxPoints: 3 },
                  },
                ],
              },
              studentAnswer: { type: 'fill', answers: ['love'] },
              result: { awardedPoints: 3, maxPoints: 3 },
            },
          ],
        },
      ],
    },
    ...overrides,
  });
};

const takeAndSubmit = async (db: FakeFirestore, studentId: string, answer = 'love') => {
  const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });
  const started = await service.startAttempt({ origin }, studentId);
  await service.saveAttemptAnswers(started.attempt.id, { answers: { 'fill.with.punctuation': { type: 'fill', answers: [answer] } } }, studentId);
  const result = await service.submitAttempt(started.attempt.id, studentId);
  return { service, started, result };
};

describe('submitted test review lifecycle', () => {
  it('writes a versioned review snapshot with the answer key at submission', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    const { result } = await takeAndSubmit(db, 'student-1');

    const review = db.read('testAttemptReviews', result.attempt.id);
    expect(review).toMatchObject({
      reviewVersion: 1,
      studentId: 'student-1',
      attemptId: result.attempt.id,
      origin,
    });
    const reviewContent = review!.content as { pages: Array<{ items: StoredDocument[] }> };
    const exercise = reviewContent.pages[0].items[0];
    expect(exercise.answerKey).toMatchObject({ items: [{ text: 'amo', acceptedAnswers: ['love'] }] });
    expect(exercise.studentAnswer).toEqual({ type: 'fill', answers: ['love'] });
    expect(exercise.itemResults).toEqual({
      answers: [
        {
          value: 'love',
          correct: true,
          points: { awardedPoints: 3, maxPoints: 3 },
        },
      ],
    });
    expect(exercise.result).toEqual({ awardedPoints: 3, maxPoints: 3 });

    // Submission still removed the working data and cleared the session.
    const attempt = db.read('testAttempts', result.attempt.id)!;
    expect(attempt.status).toBe('submitted');
    expect(attempt).not.toHaveProperty('deliveryState');
    expect(attempt).not.toHaveProperty('answers');
    expect(attempt.exerciseResults).toBeDefined();
    expect(db.readAll('testAttemptSessions')).toHaveLength(0);
  });

  it('keeps only the newest detailed review per test while preserving older score history', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    const first = await takeAndSubmit(db, 'student-1');
    const second = await takeAndSubmit(db, 'student-1', 'wrong');

    expect(first.result.attempt.id).not.toBe(second.result.attempt.id);
    expect(db.read('testAttemptReviews', first.result.attempt.id)).toBeUndefined();
    expect(db.read('testAttemptReviews', second.result.attempt.id)).toBeDefined();

    // Older attempt documents keep their frozen score summaries.
    const olderAttempt = db.read('testAttempts', first.result.attempt.id);
    expect(olderAttempt).toMatchObject({ status: 'submitted', score: 3, maxScore: 3 });
    const newerAttempt = db.read('testAttempts', second.result.attempt.id);
    expect(newerAttempt).toMatchObject({ status: 'submitted', score: 0, percentage: 0 });
  });

  it('does not create review data for active or unsubmitted attempts', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });
    const started = await service.startAttempt({ origin }, 'student-1');
    await service.saveAttemptAnswers(
      started.attempt.id,
      { answers: { 'fill.with.punctuation': { type: 'fill', answers: ['love'] } } },
      'student-1'
    );

    expect(db.readAll('testAttemptReviews')).toHaveLength(0);
    await expect(service.getSubmittedResult(started.attempt.id, 'student-1')).rejects.toMatchObject({
      code: 'ATTEMPT_NOT_FOUND',
      status: 404,
    });
  });

  it('serves the frozen result and detailed review only to the owning student', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    const { result } = await takeAndSubmit(db, 'student-1');

    const service = new TestAttemptService(db as never, () => timestamp);
    const ownResult = await service.getSubmittedResult(result.attempt.id, 'student-1');
    expect(ownResult.attempt).toMatchObject({ id: result.attempt.id, status: 'submitted', score: 3 });
    expect(ownResult.attempt).not.toHaveProperty('studentId');
    expect(ownResult.review).toMatchObject({ attemptId: result.attempt.id, reviewVersion: 1 });
    expect(ownResult.review).not.toHaveProperty('studentId');

    await expect(service.getSubmittedResult(result.attempt.id, 'student-2')).rejects.toMatchObject({
      code: 'ATTEMPT_NOT_FOUND',
      status: 404,
    });
  });

  it('keeps old attempts without review data working safely', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    seedSubmittedAttempt(db, 'legacy-attempt', 'student-1');

    const service = new TestAttemptService(db as never, () => timestamp);
    const result = await service.getSubmittedResult('legacy-attempt', 'student-1');

    expect(result.attempt).toMatchObject({ id: 'legacy-attempt', score: 3, percentage: 100 });
    expect(result.review).toBeNull();
  });

  it('degrades to the summary result when a review snapshot is corrupt', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    seedSubmittedAttempt(db, 'attempt-corrupt', 'student-1');
    seedReview(db, 'attempt-corrupt', 'student-1', { reviewVersion: 99 });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const service = new TestAttemptService(db as never, () => timestamp);
    const result = await service.getSubmittedResult('attempt-corrupt', 'student-1');

    expect(result.attempt.id).toBe('attempt-corrupt');
    expect(result.review).toBeNull();
    consoleError.mockRestore();
  });

  it('ignores a review snapshot whose owner or attempt does not match', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    seedSubmittedAttempt(db, 'attempt-mismatch', 'student-1');
    seedReview(db, 'attempt-mismatch', 'student-2');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const service = new TestAttemptService(db as never, () => timestamp);
    const result = await service.getSubmittedResult('attempt-mismatch', 'student-1');

    expect(result.review).toBeNull();
    consoleError.mockRestore();
  });

  it('ignores a review snapshot whose frozen origin or version does not match the attempt', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    seedSubmittedAttempt(db, 'attempt-wrong-version', 'student-1');
    seedReview(db, 'attempt-wrong-version', 'student-1', { versionId: 'different-version' });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const service = new TestAttemptService(db as never, () => timestamp);
    const result = await service.getSubmittedResult('attempt-wrong-version', 'student-1');

    expect(result.review).toBeNull();
    consoleError.mockRestore();
  });

  it('reports missing attempts without leaking their existence', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    const service = new TestAttemptService(db as never, () => timestamp);

    await expect(service.getSubmittedResult('missing-attempt', 'student-1')).rejects.toMatchObject({
      code: 'ATTEMPT_NOT_FOUND',
      status: 404,
    });
  });

  it('submission remains idempotent without duplicating reviews', async () => {
    const db = new FakeFirestore();
    seedTest(db);
    const service = new TestAttemptService(db as never, () => timestamp, { random: () => 0 });
    const started = await service.startAttempt({ origin }, 'student-1');
    await service.saveAttemptAnswers(
      started.attempt.id,
      { answers: { 'fill.with.punctuation': { type: 'fill', answers: ['love'] } } },
      'student-1'
    );

    const first = await service.submitAttempt(started.attempt.id, 'student-1');
    const second = await service.submitAttempt(started.attempt.id, 'student-1');

    expect(first.completionGranted).toBe(true);
    expect(second.completionGranted).toBe(false);
    expect(db.readAll('testAttemptReviews')).toHaveLength(1);
  });
});
