jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' } }));
jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: jest.requireActual('@/src/lib/admin-access-error').AdminAccessError,
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));
jest.mock('@/src/services/firebase-admin', () => ({
  get adminDb() {
    return mockDb;
  },
}));

import { GET as listWords, POST as createWord, PUT as updateWord } from '@/src/app/api/admin/words/route';
import { DELETE as deleteWord } from '@/src/app/api/admin/words/[wordId]/route';
import { GET as backupWords } from '@/src/app/api/admin/words/backup/route';
import { POST as migrateWords } from '@/src/app/api/admin/words/migrate/route';
import {
  cleanupVocabularyWordPoolReferences,
  WORD_DELETION_POOL_CLEANUP_BATCH_SIZE,
  WORD_DELETION_POOL_SCAN_PAGE_SIZE,
  WORD_DELETION_POOL_WARNING_SAMPLE_SIZE,
} from '@/src/lib/vocabulary/word-deletion-cleanup.server';

type Data = Record<string, unknown>;
type FakeRef = { kind: 'doc'; collection: string; id: string; get: () => Promise<unknown> };
type FakeQuery = {
  kind: 'query';
  collection: string;
  wordId: string;
  limitValue: number;
  afterId?: string;
  orderBy: () => FakeQuery;
  limit: (limitValue: number) => FakeQuery;
  startAfter: (snapshot: { id: string }) => FakeQuery;
  get: () => Promise<unknown>;
};

const FIRESTORE_TRANSACTION_WRITE_LIMIT = 500;
const POOLS = 'vocabulary_pools';
const WORDS = 'vocabulary_words_v5';

/** In-memory Firestore that records how much each query reads and each transaction writes. */
class FakeFirestore {
  docs = new Map<string, Map<string, Data>>();
  poolQueryLimits: number[] = [];
  writesPerTransaction: number[] = [];
  openTransactions = 0;
  overlappingTransactions = false;

  seed(collection: string, id: string, data: Data) {
    if (!this.docs.has(collection)) this.docs.set(collection, new Map());
    this.docs.get(collection)!.set(id, data);
  }

  private snapshot(collection: string, id: string) {
    const data = this.docs.get(collection)?.get(id);
    return {
      id,
      ref: this.ref(collection, id),
      exists: data !== undefined,
      updateTime: { seconds: 1, nanoseconds: 1 },
      data: () => data,
    };
  }

  private ref(collection: string, id: string): FakeRef {
    return { kind: 'doc', collection, id, get: async () => this.snapshot(collection, id) };
  }

  private query(collection: string, wordId: string, limitValue = Infinity, afterId?: string): FakeQuery {
    const query: FakeQuery = {
      kind: 'query',
      collection,
      wordId,
      limitValue,
      afterId,
      orderBy: () => query,
      limit: next => this.query(collection, wordId, next, afterId),
      startAfter: snapshot => this.query(collection, wordId, limitValue, snapshot.id),
      get: async () => this.run(query),
    };
    return query;
  }

  private run(query: FakeQuery) {
    this.poolQueryLimits.push(query.limitValue);
    const docs = [...(this.docs.get(query.collection)?.entries() ?? [])]
      .filter(([, data]) => (data.wordDocIds as string[]).includes(query.wordId))
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .filter(([id]) => !query.afterId || id > query.afterId)
      .slice(0, query.limitValue)
      .map(([id]) => this.snapshot(query.collection, id));
    return { docs, empty: docs.length === 0 };
  }

  collection(collection: string) {
    return {
      doc: (id: string) => this.ref(collection, id),
      where: (_field: string, _operator: string, wordId: string) => this.query(collection, wordId),
      get: async () => ({
        docs: [...(this.docs.get(collection)?.keys() ?? [])].map(id => this.snapshot(collection, id)),
      }),
    };
  }

  async runTransaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
    if (this.openTransactions > 0) this.overlappingTransactions = true;
    this.openTransactions += 1;
    let writes = 0;
    const write = (ref: FakeRef, data: Data | undefined, merge: boolean) => {
      writes += 1;
      if (data === undefined) this.docs.get(ref.collection)?.delete(ref.id);
      else this.seed(ref.collection, ref.id, { ...(merge ? this.docs.get(ref.collection)?.get(ref.id) : {}), ...data });
    };
    try {
      const result = await callback({
        get: async (target: FakeRef | FakeQuery) =>
          target.kind === 'query' ? this.run(target) : this.snapshot(target.collection, target.id),
        getAll: async (...refs: FakeRef[]) => refs.map(ref => this.snapshot(ref.collection, ref.id)),
        set: (ref: FakeRef, data: Data) => write(ref, data, false),
        update: (ref: FakeRef, data: Data) => write(ref, data, true),
        delete: (ref: FakeRef) => write(ref, undefined, false),
      });
      this.writesPerTransaction.push(writes);
      return result;
    } finally {
      this.openTransactions -= 1;
    }
  }
}

let mockDb: FakeFirestore;

const word = {
  word: 'et',
  part_of_speech: 'conjunction',
  translation: 'and',
  definitions: [],
  etymology: null,
  pronunciation: null,
  type: 'core',
  alternate_form: null,
  dictionary_entry: null,
  sort_key: 'et',
  random_index: 0.5,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function seedWordInPools(wordId: string, poolCount: number, wordData: Data = word) {
  mockDb.seed(WORDS, wordId, wordData);
  for (let index = 0; index < poolCount; index += 1) {
    mockDb.seed(POOLS, `pool-${String(index).padStart(4, '0')}`, {
      name: `Pool ${index}`,
      wordDocIds: [wordId, `other-${index}`],
    });
  }
}

const request = (url: string, body: unknown = {}) => ({ url, json: async () => body }) as never;
type RouteResponse<T> = { status: number; body: T };

beforeEach(() => {
  mockDb = new FakeFirestore();
});

describe('admin word route collection boundaries', () => {
  const expectInvalidCollection = (response: unknown) => {
    const result = response as RouteResponse<unknown>;
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: 'INVALID_VOCABULARY_WORD_COLLECTION' });
  };
  let collection: jest.SpyInstance;

  beforeEach(() => {
    collection = jest.spyOn(mockDb, 'collection');
  });

  afterEach(() => expect(collection).not.toHaveBeenCalled());

  it('rejects arbitrary collections on list, backup, and delete', async () => {
    expectInvalidCollection(
      await listWords(request('http://localhost/api/admin/words?collection=deleted_vocabulary_pools'))
    );
    expectInvalidCollection(
      await backupWords(request('http://localhost/api/admin/words/backup?collection=vocabulary_pool_archives'))
    );
    expectInvalidCollection(
      await deleteWord(request('http://localhost/api/admin/words/word-1?collection=users'), {
        params: Promise.resolve({ wordId: 'word-1' }),
      })
    );
  });

  it('rejects arbitrary collections on create and update', async () => {
    expectInvalidCollection(
      await createWord(request('http://localhost/api/admin/words', { collection: POOLS, word: 'amo' }))
    );
    expectInvalidCollection(
      await updateWord(
        request('http://localhost/api/admin/words', {
          collection: 'deleted_vocabulary_pools',
          wordId: 'word-1',
          updates: { word: 'amo' },
        })
      )
    );
  });

  it('fixes migration to the legacy-v4 to current-v5 boundary', async () => {
    expectInvalidCollection(
      await migrateWords(
        request('http://localhost/api/admin/words/migrate?sourceCollection=users&targetCollection=vocabulary_words_v5')
      )
    );
    expectInvalidCollection(
      await migrateWords(
        request(
          'http://localhost/api/admin/words/migrate?sourceCollection=vocabulary_words_v4&targetCollection=vocabulary_pool_archives'
        )
      )
    );
  });
});

it('rejects a word deletion during production content sync before issuing a challenge or writing', async () => {
  seedWordInPools('word-1', 1);
  mockDb.seed('content_sync_locks', 'prod-content-to-dev', { ownerId: 'sync-1' });
  const stored = () => JSON.stringify([...mockDb.docs].map(([name, docs]) => [name, [...docs]]));
  const before = stored();

  const response = (await deleteWord(request('http://localhost/api/admin/words/word-1'), {
    params: Promise.resolve({ wordId: 'word-1' }),
  })) as unknown as RouteResponse<{ code: string }>;

  expect(response.status).toBe(409);
  expect(response.body.code).toBe('VOCABULARY_CONTENT_SYNC_IN_PROGRESS');
  expect(stored()).toBe(before);
});

describe('high-cardinality vocabulary word mutations', () => {
  it('removes a word from more than one Firestore write limit in bounded transactions', async () => {
    seedWordInPools('word-common', 600, { _deletionPending: { actorUid: 'admin-1', tokenHash: 'token-hash' } });

    const result = await cleanupVocabularyWordPoolReferences(mockDb as never, {
      wordId: 'word-common',
      actorUid: 'admin-1',
      tokenHash: 'token-hash',
    });

    expect(result.cleanedPoolCount).toBe(600);
    expect(
      [...mockDb.docs.get(POOLS)!.values()].some(pool => (pool.wordDocIds as string[]).includes('word-common'))
    ).toBe(false);
    expect(Math.max(...mockDb.writesPerTransaction)).toBeLessThanOrEqual(WORD_DELETION_POOL_CLEANUP_BATCH_SIZE);
  });

  it('warns about a widely used word from a paginated scan and a single-write transaction', async () => {
    seedWordInPools('word-common', 600);

    const response = (await deleteWord(request('http://localhost/api/admin/words/word-common'), {
      params: Promise.resolve({ wordId: 'word-common' }),
    })) as unknown as RouteResponse<{ warning: boolean; referencedPools: unknown[]; referencedPoolCount: number }>;

    expect(response.status).toBe(409);
    expect(response.body.warning).toBe(true);
    expect(response.body.referencedPoolCount).toBe(600);
    expect(response.body.referencedPools).toHaveLength(WORD_DELETION_POOL_WARNING_SAMPLE_SIZE);
    expect(mockDb.poolQueryLimits.length).toBeGreaterThan(1);
    expect(Math.max(...mockDb.poolQueryLimits)).toBeLessThanOrEqual(WORD_DELETION_POOL_SCAN_PAGE_SIZE);
    expect(mockDb.writesPerTransaction).toEqual([1]);
    expect(mockDb.docs.get(WORDS)!.has('word-common')).toBe(true);
  });

  it('keeps ordinary word edits constant-size regardless of pool cardinality', async () => {
    seedWordInPools('word-common', 600);

    const response = (await updateWord(
      request('http://localhost/api/admin/words', { wordId: 'word-common', updates: { translation: 'and also' } })
    )) as unknown as RouteResponse<unknown>;

    expect(response.status).toBe(200);
    expect(mockDb.docs.get(WORDS)!.get('word-common')).toMatchObject({ translation: 'and also' });
    expect(mockDb.poolQueryLimits).toEqual([]);
    expect(mockDb.writesPerTransaction).toEqual([2]);
  });

  it('migrates a large legacy collection in sequential transactions below the Firestore write limit', async () => {
    for (let index = 0; index < 900; index += 1) {
      mockDb.seed('vocabulary_words_v4', `legacy-${index}`, { word: `verbum ${index}` });
    }

    const response = (await migrateWords(
      request(
        'http://localhost/api/admin/words/migrate?sourceCollection=vocabulary_words_v4&targetCollection=vocabulary_words_v5'
      )
    )) as unknown as RouteResponse<{ data: { successfulMigrations: number } }>;

    expect(response.status).toBe(200);
    expect(response.body.data.successfulMigrations).toBe(900);
    expect(mockDb.docs.get(WORDS)!.size).toBe(900);
    expect(mockDb.writesPerTransaction.length).toBeGreaterThan(1);
    expect(Math.max(...mockDb.writesPerTransaction)).toBeLessThanOrEqual(FIRESTORE_TRANSACTION_WRITE_LIMIT);
    expect(mockDb.overlappingTransactions).toBe(false);
  });
});
