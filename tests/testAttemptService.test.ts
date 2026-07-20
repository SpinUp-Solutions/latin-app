import { getTestAttemptSessionId, TestService } from '@/src/lib/tests/service';
import type { TestAttemptOrigin } from '@/src/types/test';

jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn() } }));

const timestamp = '2026-07-20T12:00:00.000Z';

type StoredDocument = Record<string, unknown>;
type DocumentRef = { kind: 'document'; collection: string; id: string; get: () => Promise<DocumentSnapshot> };
type QueryRef = {
  kind: 'query';
  collection: string;
  filters: Array<[string, unknown]>;
  selectedFields?: string[];
  where: (field: string, operator: string, value: unknown) => QueryRef;
  select: (...fields: string[]) => QueryRef;
  limit: (count: number) => QueryRef;
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

  private query(
    collection: string,
    filters: Array<[string, unknown]> = [],
    selectedFields?: string[],
    logEntry?: { collection: string; selectedFields?: string[]; limitUsed: boolean }
  ): QueryRef {
    const make = (nextFilters: Array<[string, unknown]>, nextSelectedFields?: string[]) =>
      this.query(collection, nextFilters, nextSelectedFields, logEntry);
    return {
      kind: 'query',
      collection,
      filters,
      selectedFields,
      where: (field, operator, value) => {
        if (operator !== '==') throw new Error(`Unsupported fake query operator ${operator}`);
        return make([...filters, [field, value]], selectedFields);
      },
      select: (...fields) => {
        const entry = { collection, selectedFields: fields, limitUsed: false };
        this.queryLog.push(entry);
        return this.query(collection, filters, fields, entry);
      },
      limit: () => {
        if (logEntry) logEntry.limitUsed = true;
        else this.queryLog.push({ collection, selectedFields, limitUsed: true });
        return make(filters, selectedFields);
      },
    };
  }

  collection = (collection: string) => {
    const query = this.query(collection);
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
      const writes: Array<{ mode: 'create' | 'set'; ref: DocumentRef; value: StoredDocument }> = [];
      const transaction = {
        get: async (target: DocumentRef | QueryRef) => {
          if (target.kind === 'document') {
            const key = this.documentKey(target.collection, target.id);
            if (!readVersions.has(key)) readVersions.set(key, this.version(target.collection, target.id));
            return this.snapshot(target.collection, target.id);
          }
          const documents = this.documents.get(target.collection) ?? new Map<string, StoredDocument>();
          return {
            docs: [...documents.entries()]
              .filter(([, document]) =>
                target.filters.every(([field, expected]) => fieldValue(document, field) === expected)
              )
              .map(([id]) => this.snapshot(target.collection, id, target.selectedFields)),
          };
        },
        create: (ref: DocumentRef, value: StoredDocument) => writes.push({ mode: 'create', ref, value: clone(value) }),
        set: (ref: DocumentRef, value: StoredDocument) => writes.push({ mode: 'set', ref, value: clone(value) }),
      };

      const result = await callback(transaction);
      const hasConflict = [...readVersions.entries()].some(
        ([key, version]) => (this.documentVersions.get(key) ?? 0) !== version
      );
      if (hasConflict) return execute(retryCount + 1);

      for (const write of writes) {
        const documents = this.documents.get(write.ref.collection) ?? new Map<string, StoredDocument>();
        if (write.mode === 'create' && documents.has(write.ref.id)) throw new Error('Document already exists');
        documents.set(write.ref.id, clone(write.value));
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
