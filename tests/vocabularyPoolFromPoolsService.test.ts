import type { CreateVocabularyPoolFromPoolsRequest } from '@/shared/types/vocabulary/pool-requests';

type StoredData = Record<string, unknown>;
type ReadOptions = { fieldMask?: readonly string[] };

const isFieldDelete = (value: unknown): boolean =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (((value as { constructor?: { name?: string } }).constructor?.name ?? '') === 'DeleteTransform' ||
        (value as { _methodName?: string })._methodName === 'FieldValue.delete')
  );

function applyUpdateData(current: StoredData, update: StoredData): StoredData {
  const next = { ...current };
  Object.entries(update).forEach(([field, value]) => {
    const path = field.split('.');
    let target = next;
    path.slice(0, -1).forEach(segment => {
      target[segment] = target[segment] && typeof target[segment] === 'object' ? target[segment] : {};
      target = target[segment] as StoredData;
    });
    const leaf = path[path.length - 1];
    if (isFieldDelete(value)) delete target[leaf];
    else target[leaf] = value;
  });
  return next;
}

const mockMutationCalls: Array<{ options?: { lockOwnerId?: string }; events: string[] }> = [];
const mockFailureBeforeCommit = new Set<number>();
const mockFailureAfterCommit = new Set<number>();
const mockBeforeCommitHooks = new Map<number, () => void>();
const mockAfterCommitHooks = new Map<number, () => void>();
let mockFailureMessage = 'simulated transaction failure';

class FakeRef {
  readonly path: string;

  constructor(
    private readonly db: FakeFirestore,
    readonly collectionName: string,
    readonly id: string
  ) {
    this.path = `${collectionName}/${id}`;
  }

  async get(): Promise<FakeSnapshot> {
    return this.db.snapshot(this);
  }
}

class FakeSnapshot {
  readonly exists: boolean;
  readonly ref: FakeRef;

  constructor(
    readonly id: string,
    private value: StoredData | undefined,
    ref: FakeRef,
    fieldMask?: readonly string[]
  ) {
    this.exists = value !== undefined;
    this.ref = ref;
    if (value !== undefined && fieldMask) {
      this.value = fieldMask.reduce<StoredData>((projected, field) => {
        const path = field.split('.');
        let source: unknown = value;
        for (const segment of path) {
          if (!source || typeof source !== 'object' || !(segment in (source as object))) return projected;
          source = (source as StoredData)[segment];
        }
        let target = projected;
        path.forEach((segment, index) => {
          if (index === path.length - 1) target[segment] = source;
          else {
            target[segment] = target[segment] ?? {};
            target = target[segment] as StoredData;
          }
        });
        return projected;
      }, {});
    }
  }

  data(): StoredData | undefined {
    return this.value;
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredData>();
  readonly fieldMasks: Array<readonly string[] | undefined> = [];

  collection(collectionName: string) {
    return {
      doc: (id: string) => new FakeRef(this, collectionName, id),
    };
  }

  snapshot(ref: FakeRef, fieldMask?: readonly string[]): FakeSnapshot {
    return new FakeSnapshot(ref.id, this.documents.get(ref.path), ref, fieldMask);
  }

  set(ref: FakeRef, data: StoredData): void {
    this.documents.set(ref.path, data);
  }

  get(ref: FakeRef): StoredData | undefined {
    return this.documents.get(ref.path);
  }

  private splitRefs(args: unknown[]): { refs: FakeRef[]; options?: ReadOptions } {
    const last = args.at(-1);
    const options =
      last && typeof last === 'object' && !('path' in (last as object)) ? (last as ReadOptions) : undefined;
    return {
      refs: (options ? args.slice(0, -1) : args) as FakeRef[],
      options,
    };
  }

  async getAll(...args: unknown[]): Promise<FakeSnapshot[]> {
    const { refs, options } = this.splitRefs(args);
    this.fieldMasks.push(options?.fieldMask);
    return refs.map(ref => this.snapshot(ref, options?.fieldMask));
  }

  transaction() {
    const events: string[] = [];
    const read = (event: string) => events.push(event);
    const writes: Array<{ kind: 'create' | 'update' | 'set' | 'delete'; ref: FakeRef; data?: StoredData }> = [];

    const transaction = {
      get: async (ref: FakeRef) => {
        read('read');
        return this.snapshot(ref);
      },
      getAll: async (...args: unknown[]) => {
        const { refs, options } = this.splitRefs(args);
        this.fieldMasks.push(options?.fieldMask);
        refs.forEach(() => read('read'));
        return refs.map(ref => this.snapshot(ref, options?.fieldMask));
      },
      create: (ref: FakeRef, data: StoredData) => {
        read('write');
        writes.push({ kind: 'create', ref, data });
      },
      update: (ref: FakeRef, data: StoredData) => {
        read('write');
        writes.push({ kind: 'update', ref, data });
      },
      set: (ref: FakeRef, data: StoredData) => {
        read('write');
        writes.push({ kind: 'set', ref, data });
      },
      delete: (ref: FakeRef) => {
        read('write');
        writes.push({ kind: 'delete', ref });
      },
    };
    return {
      transaction,
      events,
      commit: () => {
        const staged = new Map(this.documents);
        for (const write of writes) {
          if (write.kind === 'create') {
            if (staged.has(write.ref.path)) throw new Error(`Document ${write.ref.path} already exists`);
            staged.set(write.ref.path, write.data!);
          } else if (write.kind === 'update') {
            if (!staged.has(write.ref.path)) throw new Error(`Document ${write.ref.path} does not exist`);
            staged.set(write.ref.path, applyUpdateData(staged.get(write.ref.path) ?? {}, write.data ?? {}));
          } else if (write.kind === 'set') {
            staged.set(write.ref.path, write.data!);
          } else {
            staged.delete(write.ref.path);
          }
        }
        this.documents.clear();
        staged.forEach((value, key) => this.documents.set(key, value));
      },
    };
  }
}

jest.mock('@/src/lib/vocabulary-pools/archive.server', () => ({
  DELETED_VOCABULARY_POOL_COLLECTION: 'deleted_vocabulary_pools',
  VOCABULARY_POOL_COLLECTION: 'vocabulary_pools',
}));

jest.mock('@/src/lib/vocabulary-pools/sync-lock.server', () => ({
  runVocabularyContentExclusiveMutation: async (_db: unknown, callback: (ownerId: string) => unknown) =>
    callback('app-storage:test-owner'),
  runVocabularyContentMutation: async (
    db: { transaction: () => { transaction: unknown; events: string[]; commit: () => void } },
    callback: (transaction: unknown) => Promise<unknown>,
    options?: { lockOwnerId?: string }
  ) => {
    const { transaction, events, commit } = db.transaction();
    mockMutationCalls.push({ options, events });
    const result = await callback(transaction);
    mockBeforeCommitHooks.get(mockMutationCalls.length)?.();
    if (mockFailureBeforeCommit.has(mockMutationCalls.length)) throw new Error(mockFailureMessage);
    commit();
    mockAfterCommitHooks.get(mockMutationCalls.length)?.();
    if (mockFailureAfterCommit.has(mockMutationCalls.length)) throw new Error(mockFailureMessage);
    return result;
  },
}));

import {
  VOCABULARY_POOL_COPY_WORD_BATCH_SIZE,
  createVocabularyPoolFromPools,
} from '@/src/lib/vocabulary-pools/from-pools.server';
import { createVocabularyPoolFromPoolsRequestSchema } from '@/shared/types/vocabulary/pool-requests';

const makeRequest = (overrides: Partial<CreateVocabularyPoolFromPoolsRequest> = {}) =>
  createVocabularyPoolFromPoolsRequestSchema.parse({
    name: 'Combined lessons',
    description: 'Words copied from selected lessons',
    difficulty: 'intermediate',
    tags: ['Lessons'],
    sourcePoolIds: ['lesson-67'],
    wordDocIds: [],
    requestId: 'request-1',
    ...overrides,
  });

function seedSource(db: FakeFirestore, id: string, wordDocIds: string[], extra: StoredData = {}): void {
  db.set(db.collection('vocabulary_pools').doc(id), {
    name: id,
    description: `Description for ${id}`,
    wordDocIds,
    metadata: { isActive: false, wordCount: wordDocIds.length },
    ...extra,
  });
}

function seedWord(db: FakeFirestore, id: string, revision?: number, extra: StoredData = {}): void {
  db.set(db.collection('vocabulary_words_v5').doc(id), {
    word: id,
    translation: id,
    ...(revision === undefined ? {} : { _poolReferenceRevision: revision }),
    ...extra,
  });
}

describe('create vocabulary pool from pools service', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockMutationCalls.length = 0;
    mockFailureBeforeCommit.clear();
    mockFailureAfterCommit.clear();
    mockBeforeCommitHooks.clear();
    mockAfterCommitHooks.clear();
    mockFailureMessage = 'simulated transaction failure';
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('copies 35 lesson pools with more than 500 unique IDs in stable order and bounded transactions', async () => {
    const db = new FakeFirestore();
    const sourcePoolIds = Array.from({ length: 35 }, (_, index) => `lesson-${index + 67}`);
    const expectedWordIds: string[] = [];
    const seen = new Set<string>();

    sourcePoolIds.forEach((sourceId, sourceIndex) => {
      const wordIds = [
        ...Array.from({ length: 16 }, (_, wordIndex) => `word-${sourceIndex}-${wordIndex}`),
        `shared-${sourceIndex % 5}`,
        `same-spelling-${sourceIndex % 3}`,
      ];
      if (sourceIndex === 0) wordIds.push(wordIds[0]);
      seedSource(db, sourceId, wordIds);
      wordIds.forEach((wordId, wordIndex) => {
        if (!seen.has(wordId)) {
          seen.add(wordId);
          expectedWordIds.push(wordId);
          seedWord(db, wordId, wordIndex % 4 === 0 ? wordIndex : undefined, {
            word: wordId.startsWith('same-spelling-') ? 'idem' : wordId,
          });
        }
      });
    });
    seedWord(db, 'extra-word');
    seedWord(db, 'extra-second');

    const input = makeRequest({
      sourcePoolIds,
      wordDocIds: ['extra-word', expectedWordIds[0], 'extra-second'],
    });
    const result = await createVocabularyPoolFromPools(db as never, 'admin-1', input);

    expect(result.wordDocIds).toEqual([...expectedWordIds, 'extra-word', 'extra-second']);
    expect(result.metadata).toMatchObject({
      wordCount: expectedWordIds.length + 2,
      isActive: true,
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
      difficulty: 'intermediate',
      tags: ['lessons'],
    });
    expect(result).not.toHaveProperty('_copyRequest');
    expect(result).not.toHaveProperty('_creationPending');

    const maxWrites = Math.max(...mockMutationCalls.map(call => call.events.filter(event => event === 'write').length));
    expect(maxWrites).toBeLessThanOrEqual(200);
    expect(mockMutationCalls.length).toBe(
      Math.ceil((expectedWordIds.length + 2) / VOCABULARY_POOL_COPY_WORD_BATCH_SIZE) + 1
    );
    expect(mockMutationCalls.every(call => call.options?.lockOwnerId === 'app-storage:test-owner')).toBe(true);
    expect(
      mockMutationCalls.every(
        call =>
          call.events.indexOf('write') < 0 ||
          call.events.slice(call.events.indexOf('write')).every(event => event === 'write')
      )
    ).toBe(true);

    sourcePoolIds.forEach(sourceId => {
      expect(db.get(db.collection('vocabulary_pools').doc(sourceId))?.wordDocIds).toEqual(expect.any(Array));
    });
    expectedWordIds.concat(['extra-word', 'extra-second']).forEach(wordId => {
      expect(db.get(db.collection('vocabulary_words_v5').doc(wordId))?._poolReferenceRevision).toBeGreaterThanOrEqual(
        1
      );
    });
    expect(db.fieldMasks).toContainEqual(['_deletionPending', '_poolReferenceRevision']);
    expect(db.fieldMasks).toContainEqual(['wordDocIds', '_creationPending', '_deletionPending']);
  });

  it('leaves source documents unchanged and preserves distinct IDs with the same spelling', async () => {
    const db = new FakeFirestore();
    seedSource(db, 'source-a', ['word-a', 'duplicate-id', 'duplicate-id']);
    seedSource(db, 'source-b', ['duplicate-id', 'word-b']);
    seedWord(db, 'word-a');
    seedWord(db, 'duplicate-id', undefined, { word: 'idem' });
    seedWord(db, 'word-b', undefined, { word: 'idem' });
    const sourceBefore = [...(db.get(db.collection('vocabulary_pools').doc('source-a'))?.wordDocIds as string[])];

    const result = await createVocabularyPoolFromPools(
      db as never,
      'admin-1',
      makeRequest({ sourcePoolIds: ['source-a', 'source-b'], requestId: 'request-2' })
    );

    expect(result.wordDocIds).toEqual(['word-a', 'duplicate-id', 'word-b']);
    expect(db.get(db.collection('vocabulary_pools').doc('source-a'))?.wordDocIds).toEqual(sourceBefore);
    expect(result.wordDocIds).toContain('duplicate-id');
    expect(result.wordDocIds).toContain('word-b');
  });

  it('accepts a valid empty source pool and creates an active empty destination', async () => {
    const db = new FakeFirestore();
    seedSource(db, 'empty-source', []);
    const result = await createVocabularyPoolFromPools(
      db as never,
      'admin-1',
      makeRequest({ sourcePoolIds: ['empty-source'], requestId: 'empty-request' })
    );

    expect(result.wordDocIds).toEqual([]);
    expect(result.metadata).toMatchObject({ wordCount: 0, isActive: true });
  });

  it('cleans only its unpublished stage after a failed batch and resumes safely on retry', async () => {
    const db = new FakeFirestore();
    const retryWordIds = Array.from(
      { length: VOCABULARY_POOL_COPY_WORD_BATCH_SIZE + 2 },
      (_, index) => `retry-${index}`
    );
    seedSource(db, 'retry-source', retryWordIds);
    retryWordIds.forEach(id => seedWord(db, id));
    const input = makeRequest({ sourcePoolIds: ['retry-source'], requestId: 'retry-request' });

    mockFailureBeforeCommit.add(2);
    await expect(createVocabularyPoolFromPools(db as never, 'admin-1', input)).rejects.toThrow(mockFailureMessage);

    const destinationIds = [...db.documents.keys()]
      .filter(path => path.startsWith('vocabulary_pools/copy-'))
      .map(path => path.split('/')[1]);
    expect(destinationIds).toHaveLength(0);
    expect([...db.documents.keys()].some(path => path.startsWith('vocabulary_pools/copy-'))).toBe(false);

    mockFailureBeforeCommit.clear();
    const result = await createVocabularyPoolFromPools(db as never, 'admin-1', input);
    expect(result.wordDocIds).toEqual(retryWordIds);
    expect(result.metadata.wordCount).toBe(retryWordIds.length);
    expect(mockMutationCalls.length).toBeGreaterThan(3);
  });

  it('returns the completed pool on an identical retry even after source membership changes', async () => {
    const db = new FakeFirestore();
    seedSource(db, 'idempotent-source', ['same-a']);
    seedWord(db, 'same-a');
    seedWord(db, 'same-b');
    const input = makeRequest({ sourcePoolIds: ['idempotent-source'], requestId: 'idempotent-request' });
    const first = await createVocabularyPoolFromPools(db as never, 'admin-1', input);
    const revisionAfterFirst = db.get(db.collection('vocabulary_words_v5').doc('same-a'))?._poolReferenceRevision;

    db.set(db.collection('vocabulary_pools').doc('idempotent-source'), {
      name: 'idempotent-source',
      description: 'changed after completion',
      wordDocIds: ['same-a', 'same-b'],
    });
    const second = await createVocabularyPoolFromPools(db as never, 'admin-1', input);

    expect(second).toEqual(first);
    expect(db.get(db.collection('vocabulary_words_v5').doc('same-a'))?._poolReferenceRevision).toBe(revisionAfterFirst);
  });

  it('keeps a completed pool when publication commits but the response is lost, then replays it', async () => {
    const db = new FakeFirestore();
    seedSource(db, 'lost-response-source', ['lost-word']);
    seedWord(db, 'lost-word');
    const input = makeRequest({ sourcePoolIds: ['lost-response-source'], requestId: 'lost-response-request' });

    mockFailureAfterCommit.add(2);
    await expect(createVocabularyPoolFromPools(db as never, 'admin-1', input)).rejects.toThrow(mockFailureMessage);
    expect([...db.documents.keys()].filter(path => path.startsWith('vocabulary_pools/copy-'))).toHaveLength(1);

    mockFailureAfterCommit.clear();
    const replay = await createVocabularyPoolFromPools(db as never, 'admin-1', input);
    expect(replay.wordDocIds).toEqual(['lost-word']);
    expect(replay).not.toHaveProperty('_copyRequest');
    expect(mockMutationCalls).toHaveLength(3);
  });

  it('resumes a staged copy when cleanup itself fails, without decrementing revisions', async () => {
    const db = new FakeFirestore();
    const wordIds = Array.from({ length: VOCABULARY_POOL_COPY_WORD_BATCH_SIZE + 2 }, (_, index) => `cleanup-${index}`);
    seedSource(db, 'cleanup-source', wordIds);
    wordIds.forEach(id => seedWord(db, id));
    const input = makeRequest({ sourcePoolIds: ['cleanup-source'], requestId: 'cleanup-request' });

    mockFailureBeforeCommit.add(2);
    mockFailureBeforeCommit.add(3);
    await expect(createVocabularyPoolFromPools(db as never, 'admin-1', input)).rejects.toThrow(mockFailureMessage);
    expect([...db.documents.keys()].some(path => path.startsWith('vocabulary_pools/copy-'))).toBe(true);

    mockFailureBeforeCommit.clear();
    const result = await createVocabularyPoolFromPools(db as never, 'admin-1', input);
    expect(result.wordDocIds).toEqual(wordIds);
    expect(result.metadata.wordCount).toBe(wordIds.length);
    wordIds.forEach(id => {
      expect(db.get(db.collection('vocabulary_words_v5').doc(id))?._poolReferenceRevision).toBeGreaterThanOrEqual(1);
    });
  });

  it('stops publication when a source changes between staging and the final transaction', async () => {
    const db = new FakeFirestore();
    const wordIds = Array.from({ length: VOCABULARY_POOL_COPY_WORD_BATCH_SIZE + 1 }, (_, index) => `changed-${index}`);
    seedSource(db, 'changed-source', wordIds);
    wordIds.forEach(id => seedWord(db, id));
    const input = makeRequest({ sourcePoolIds: ['changed-source'], requestId: 'changed-request' });

    mockAfterCommitHooks.set(1, () => {
      db.set(db.collection('vocabulary_pools').doc('changed-source'), {
        name: 'changed-source',
        description: 'changed while copying',
        wordDocIds: [...wordIds, 'new-after-stage'],
      });
    });
    await expect(createVocabularyPoolFromPools(db as never, 'admin-1', input)).rejects.toMatchObject({
      code: 'VOCABULARY_POOL_SOURCE_MEMBERSHIP_CHANGED',
      status: 409,
    });
    expect([...db.documents.keys()].some(path => path.startsWith('vocabulary_pools/copy-'))).toBe(false);
  });

  it('rejects a resumed operation after its source membership changes', async () => {
    const db = new FakeFirestore();
    const wordIds = Array.from({ length: VOCABULARY_POOL_COPY_WORD_BATCH_SIZE + 1 }, (_, index) => `resume-${index}`);
    seedSource(db, 'resume-source', wordIds);
    wordIds.forEach(id => seedWord(db, id));
    const input = makeRequest({ sourcePoolIds: ['resume-source'], requestId: 'resume-request' });

    mockFailureBeforeCommit.add(2);
    mockFailureBeforeCommit.add(3);
    await expect(createVocabularyPoolFromPools(db as never, 'admin-1', input)).rejects.toThrow(mockFailureMessage);
    mockFailureBeforeCommit.clear();
    db.set(db.collection('vocabulary_pools').doc('resume-source'), {
      name: 'resume-source',
      description: 'changed before resume',
      wordDocIds: [...wordIds, 'resume-new'],
    });

    await expect(createVocabularyPoolFromPools(db as never, 'admin-1', input)).rejects.toMatchObject({
      code: 'VOCABULARY_POOL_SOURCE_MEMBERSHIP_CHANGED',
      status: 409,
    });
  });

  it('rejects a deterministic destination tombstone before creating staging', async () => {
    const db = new FakeFirestore();
    seedSource(db, 'tombstone-source', []);
    const input = makeRequest({ sourcePoolIds: ['tombstone-source'], requestId: 'tombstone-request' });
    const destinationId = 'copy-';
    const crypto = await import('node:crypto');
    const operationId = `${destinationId}${crypto
      .createHash('sha256')
      .update(JSON.stringify({ actorUid: 'admin-1', requestId: input.requestId }))
      .digest('hex')
      .slice(0, 48)}`;
    db.set(db.collection('deleted_vocabulary_pools').doc(operationId), { archiveId: 'archived-copy' });

    await expect(createVocabularyPoolFromPools(db as never, 'admin-1', input)).rejects.toMatchObject({
      code: 'VOCABULARY_POOL_COPY_DESTINATION_ARCHIVED',
      status: 409,
    });
    expect(db.get(db.collection('vocabulary_pools').doc(operationId))).toBeUndefined();
  });

  it.each([1, 2, 3])('cleans its stage when transaction boundary %s fails before commit', async failureCall => {
    const db = new FakeFirestore();
    const wordIds = Array.from({ length: 300 }, (_, index) => `boundary-${failureCall}-${index}`);
    seedSource(db, `boundary-source-${failureCall}`, wordIds);
    wordIds.forEach(id => seedWord(db, id));
    const input = makeRequest({
      sourcePoolIds: [`boundary-source-${failureCall}`],
      requestId: `boundary-request-${failureCall}`,
    });
    mockFailureBeforeCommit.add(failureCall);

    await expect(createVocabularyPoolFromPools(db as never, 'admin-1', input)).rejects.toThrow(mockFailureMessage);
    expect([...db.documents.keys()].some(path => path.startsWith('vocabulary_pools/copy-'))).toBe(false);
    mockFailureBeforeCommit.clear();
  });

  it('rejects an oversized final/staging document before any write transaction', async () => {
    const db = new FakeFirestore();
    const wordIds = Array.from({ length: 5000 }, (_, index) => `oversize-${index}-${'x'.repeat(180)}`);
    seedSource(db, 'oversize-source', wordIds);
    wordIds.forEach(id => seedWord(db, id));
    const input = makeRequest({ sourcePoolIds: ['oversize-source'], requestId: 'oversize-request' });

    await expect(createVocabularyPoolFromPools(db as never, 'admin-1', input)).rejects.toMatchObject({
      code: 'VOCABULARY_POOL_TOO_LARGE',
      status: 409,
    });
    expect(mockMutationCalls).toHaveLength(0);
    expect([...db.documents.keys()].some(path => path.startsWith('vocabulary_pools/copy-'))).toBe(false);
  });

  it('rejects a same-actor request ID with a different payload', async () => {
    const db = new FakeFirestore();
    seedSource(db, 'conflict-source', ['conflict-word']);
    seedWord(db, 'conflict-word');
    const input = makeRequest({ sourcePoolIds: ['conflict-source'], requestId: 'conflict-request' });
    await createVocabularyPoolFromPools(db as never, 'admin-1', input);

    await expect(
      createVocabularyPoolFromPools(
        db as never,
        'admin-1',
        makeRequest({ sourcePoolIds: ['conflict-source'], requestId: 'conflict-request', name: 'Changed name' })
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_COPY_REQUEST_CONFLICT', status: 409 });
  });

  it.each([
    ['missing-word', { wordDocIds: ['not-there'] }, 'VOCABULARY_POOL_WORD_REFERENCE_MISSING'],
    ['deleting-word', { wordDocIds: ['deleting'] }, 'VOCABULARY_POOL_WORD_PENDING_DELETION'],
  ])('rejects %s references without publishing', async (_label, source: { wordDocIds: string[] }, code: string) => {
    const db = new FakeFirestore();
    seedSource(db, 'invalid-source', source.wordDocIds);
    if (source.wordDocIds[0] === 'deleting') seedWord(db, 'deleting', undefined, { _deletionPending: true });

    await expect(
      createVocabularyPoolFromPools(
        db as never,
        'admin-1',
        makeRequest({ sourcePoolIds: ['invalid-source'], requestId: `invalid-${code}` })
      )
    ).rejects.toMatchObject({ code, status: 409 });
    expect([...db.documents.keys()].some(path => path.startsWith('vocabulary_pools/copy-'))).toBe(false);
  });

  it('rejects a source with active and tombstone records and a pending source', async () => {
    const collisionDb = new FakeFirestore();
    seedSource(collisionDb, 'collision-source', []);
    collisionDb.set(collisionDb.collection('deleted_vocabulary_pools').doc('collision-source'), { archiveId: 'a' });
    await expect(
      createVocabularyPoolFromPools(
        collisionDb as never,
        'admin-1',
        makeRequest({ sourcePoolIds: ['collision-source'], requestId: 'collision-request' })
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_SOURCE_STATE_CONFLICT', status: 409 });

    const pendingDb = new FakeFirestore();
    seedSource(pendingDb, 'pending-source', [], { _creationPending: { requestId: 'other' } });
    await expect(
      createVocabularyPoolFromPools(
        pendingDb as never,
        'admin-1',
        makeRequest({ sourcePoolIds: ['pending-source'], requestId: 'pending-request' })
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_SOURCE_PENDING', status: 409 });
  });
});
