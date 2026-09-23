const mockVerifyAdminAccess = jest.fn();

type StoredDoc = Record<string, unknown>;

const pendingPool: StoredDoc = {
  wordDocIds: ['pending-word'],
  _creationPending: { actorUid: 'admin', requestId: 'copy-1' },
};
const visiblePool: StoredDoc = {
  name: 'Visible pool',
  description: 'A completed pool',
  wordDocIds: ['word-1'],
  metadata: {
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 'admin',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    updatedBy: 'admin',
    wordCount: 1,
    isActive: true,
    tags: [],
    difficulty: 'beginner',
  },
  searchTokens: ['visible'],
};

class FakeRef {
  constructor(
    private readonly collectionName: string,
    readonly id: string,
    private readonly docs: Map<string, StoredDoc>
  ) {}

  async get() {
    const data = this.docs.get(`${this.collectionName}/${this.id}`);
    return { id: this.id, exists: data !== undefined, data: () => data, ref: this };
  }

  collection(name: string) {
    return { doc: (id: string) => new FakeRef(name, id, this.docs) };
  }
}

class FakeQuery {
  private maxResults: number | undefined;

  constructor(private readonly docs: Map<string, StoredDoc>) {}

  where() {
    return this;
  }
  orderBy() {
    return this;
  }
  limit(value: number) {
    this.maxResults = value;
    return this;
  }
  select() {
    return this;
  }
  startAfter() {
    return this;
  }
  async get() {
    return {
      docs: [...this.docs.entries()]
        .filter(([path]) => path.startsWith('vocabulary_pools/'))
        .slice(0, this.maxResults)
        .map(([path, data]) => {
          const id = path.split('/')[1];
          return { id, exists: true, data: () => data, ref: new FakeRef('vocabulary_pools', id, this.docs) };
        }),
    };
  }
}

const mockAdminDb = {
  docs: new Map<string, StoredDoc>(),
  collection(name: string) {
    return {
      doc: (id: string) => new FakeRef(name, id, mockAdminDb.docs),
      orderBy: () => new FakeQuery(mockAdminDb.docs),
    };
  },
};

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({
  FieldPath: { documentId: () => '__name__' },
  Query: class Query {},
}));
jest.mock('@/src/services/firebase-admin', () => ({ adminDb: mockAdminDb }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  verifyAdminAccess: (...args: unknown[]) => mockVerifyAdminAccess(...args),
}));

import { getReadableVocabularyPool } from '@/src/lib/vocabulary-pools/archive.server';
import { assertVocabularyPoolAssignmentsAllowedInTransaction } from '@/src/lib/vocabulary-pools/assignment.server';
// Load the route after the fake database has been initialized; the route reads
// the injected adminDb object at module evaluation time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET: listPools } = require('@/src/app/api/admin/vocabulary-pools/route') as {
  GET: (request: unknown) => Promise<unknown>;
};

describe('pending vocabulary pool domain boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminDb.docs.clear();
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin' });
  });

  it('hides creation-pending pools from readable student/admin loaders', async () => {
    mockAdminDb.docs.set('vocabulary_pools/pending-pool', pendingPool);
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => new FakeRef(name, id, mockAdminDb.docs),
      }),
    };

    await expect(getReadableVocabularyPool(db as never, 'pending-pool')).resolves.toBeNull();
  });

  it('rejects assigning a pending pool inside the authoring transaction', async () => {
    const activeRef = { path: 'vocabulary_pools/pending-pool' };
    const tombstoneRef = { path: 'deleted_vocabulary_pools/pending-pool' };
    const transaction = {
      get: jest.fn(async (ref: { path: string }) => ({
        exists: ref.path === activeRef.path,
        data: () => (ref.path === activeRef.path ? pendingPool : {}),
      })),
      update: jest.fn(),
    };
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => ({ path: `${name}/${id}` }),
      }),
    };

    await expect(
      assertVocabularyPoolAssignmentsAllowedInTransaction(transaction as never, db as never, undefined, {
        vocabulary_pool: 'pending-pool',
      })
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_PENDING', status: 409 });
    expect(transaction.get).toHaveBeenCalledWith(tombstoneRef);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('advances the list cursor over a scanned pending record', async () => {
    mockAdminDb.docs.set('vocabulary_pools/pending-pool', pendingPool);
    mockAdminDb.docs.set('vocabulary_pools/visible-pool', visiblePool);
    const response = (await listPools({
      url: 'https://latin.test/api/admin/vocabulary-pools?limit=1',
    } as never)) as unknown as {
      status: number;
      body: { data: { pools: unknown[]; hasMore: boolean; lastPoolId: string | null } };
    };

    expect(response.status).toBe(200);
    expect(response.body.data.pools).toEqual([]);
    expect(response.body.data.hasMore).toBe(true);
    expect(response.body.data.lastPoolId).toBe('pending-pool');
  });
});
