const mockVerifyAdminAccess = jest.fn();
const transactionCreate = jest.fn();
const transactionUpdate = jest.fn();
const exclusiveMutationRuns: string[] = [];
let maxWritesInSingleTransaction = 0;

type FakeSnapshot = { id: string; exists: boolean; data: () => Record<string, unknown> | undefined };
type FakeRef = { collection: string; id: string; get: () => Promise<FakeSnapshot> };

const snapshots = new Map<string, FakeSnapshot>();
const key = (collection: string, id: string) => `${collection}/${id}`;
const snapshot = (id: string, data?: Record<string, unknown>): FakeSnapshot => ({
  id,
  exists: Boolean(data),
  data: () => data,
});
const setSnapshot = (collection: string, id: string, data?: Record<string, unknown>) => {
  snapshots.set(key(collection, id), snapshot(id, data));
};

let generatedDocIdCounter = 1;
const ref = (collection: string, id?: string): FakeRef => {
  const docId = id ?? `generated-doc-${generatedDocIdCounter++}`;
  return {
    collection,
    id: docId,
    get: async () => snapshots.get(key(collection, docId)) ?? snapshot(docId),
  };
};

const request = (body?: unknown) =>
  ({
    json: jest.fn().mockResolvedValue(body),
  }) as never;

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: jest.requireActual('@/src/lib/verifyAdminAccess').AdminAccessError,
  verifyAdminAccess: (...args: unknown[]) => mockVerifyAdminAccess(...args),
}));
jest.mock('@/src/lib/vocabulary-pools/archive.server', () => ({
  VOCABULARY_POOL_COLLECTION: 'vocabulary_pools',
}));
jest.mock('@/shared/constants/firestore', () => ({
  VOCABULARY_WORDS_COLLECTION: 'vocabulary_words_v5',
}));
jest.mock('@/src/lib/vocabulary-pools/sync-lock.server', () => ({
  runVocabularyContentExclusiveMutation: async (_db: unknown, callback: (ownerId: string) => unknown) => {
    const ownerId = 'app-storage:lock-1';
    exclusiveMutationRuns.push(ownerId);
    return callback(ownerId);
  },
  runVocabularyContentMutation: async (
    _db: unknown,
    callback: (transaction: unknown) => unknown,
    _options?: { lockOwnerId?: string }
  ) => {
    let writesInThisTx = 0;
    const fakeTransaction = {
      get: async (candidate: FakeRef) => candidate.get(),
      getAll: async (...refs: FakeRef[]) => Promise.all(refs.map(candidate => candidate.get())),
      create: (candidate: FakeRef, data: Record<string, unknown>) => {
        writesInThisTx++;
        if (writesInThisTx > maxWritesInSingleTransaction) {
          maxWritesInSingleTransaction = writesInThisTx;
        }
        transactionCreate(candidate, data);
        setSnapshot(candidate.collection, candidate.id, data);
      },
      update: (candidate: FakeRef, data: Record<string, unknown>) => {
        writesInThisTx++;
        if (writesInThisTx > maxWritesInSingleTransaction) {
          maxWritesInSingleTransaction = writesInThisTx;
        }
        transactionUpdate(candidate, data);
        const existing = snapshots.get(key(candidate.collection, candidate.id))?.data() ?? {};
        setSnapshot(candidate.collection, candidate.id, { ...existing, ...data });
      },
    };
    return callback(fakeTransaction);
  },
  VocabularyContentSyncLockError: class VocabularyContentSyncLockError extends Error {},
}));
jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (collection: string) => ({
      doc: (id?: string) => ref(collection, id),
    }),
    getAll: async (...refs: FakeRef[]) => Promise.all(refs.map(candidate => candidate.get())),
  },
}));

import { POST as duplicatePool } from '@/src/app/api/admin/vocabulary-pools/[poolId]/duplicate/route';
import { AdminAccessError } from '@/src/lib/verifyAdminAccess';

describe('vocabulary pool duplicate route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    snapshots.clear();
    exclusiveMutationRuns.length = 0;
    maxWritesInSingleTransaction = 0;
    generatedDocIdCounter = 1;
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin-123' });
  });

  it('rejects unauthenticated or non-admin access', async () => {
    mockVerifyAdminAccess.mockRejectedValueOnce(new AdminAccessError('Admin access required', 403));
    const response = (await duplicatePool(request(), {
      params: Promise.resolve({ poolId: 'pool-source' }),
    })) as unknown as { status: number; body: { success: boolean; error: string } };

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Admin access required');
  });

  it('returns 404 if source pool does not exist', async () => {
    const response = (await duplicatePool(request(), {
      params: Promise.resolve({ poolId: 'non-existent-pool' }),
    })) as unknown as { status: number; body: { success: boolean; error: string } };

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Pool not found');
  });

  it('duplicates pool with default name "[Source Name] (Copy)", copies metadata, and sets isActive to false', async () => {
    setSnapshot('vocabulary_pools', 'pool-source', {
      name: 'Latin Basics',
      description: 'Introductory Latin vocabulary',
      wordDocIds: ['word-1', 'word-2'],
      metadata: {
        createdAt: new Date('2026-01-01T00:00:00Z'),
        createdBy: 'admin-old',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        updatedBy: 'admin-old',
        wordCount: 2,
        isActive: true,
        tags: ['basics', 'intro'],
        difficulty: 'beginner',
      },
    });
    setSnapshot('vocabulary_words_v5', 'word-1', {
      word: 'amo',
      translation: 'to love',
      _poolReferenceRevision: 2,
    });
    setSnapshot('vocabulary_words_v5', 'word-2', {
      word: 'puella',
      translation: 'girl',
    });

    const response = (await duplicatePool(request({}), {
      params: Promise.resolve({ poolId: 'pool-source' }),
    })) as unknown as {
      status: number;
      body: {
        success: boolean;
        data: {
          pool: {
            id: string;
            name: string;
            description: string;
            wordDocIds: string[];
            metadata: {
              isActive: boolean;
              createdBy: string;
              updatedBy: string;
              wordCount: number;
              tags: string[];
              difficulty: string;
            };
          };
        };
      };
    };

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.pool.name).toBe('Latin Basics (Copy)');
    expect(response.body.data.pool.description).toBe('Introductory Latin vocabulary');
    expect(response.body.data.pool.wordDocIds).toEqual(['word-1', 'word-2']);
    expect(response.body.data.pool.metadata.isActive).toBe(false);
    expect(response.body.data.pool.metadata.createdBy).toBe('admin-123');
    expect(response.body.data.pool.metadata.updatedBy).toBe('admin-123');
    expect(response.body.data.pool.metadata.tags).toEqual(['basics', 'intro']);
    expect(response.body.data.pool.metadata.difficulty).toBe('beginner');
    expect(response.body.data.pool.metadata.wordCount).toBe(2);

    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'vocabulary_words_v5', id: 'word-1' }),
      { _poolReferenceRevision: 3 }
    );
    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'vocabulary_words_v5', id: 'word-2' }),
      { _poolReferenceRevision: 1 }
    );
  });

  it('respects a custom name provided in the request body', async () => {
    setSnapshot('vocabulary_pools', 'pool-source', {
      name: 'Latin Basics',
      description: 'Introductory Latin vocabulary',
      wordDocIds: ['word-1'],
      metadata: {
        createdAt: new Date('2026-01-01T00:00:00Z'),
        tags: ['basics'],
        difficulty: 'beginner',
      },
    });
    setSnapshot('vocabulary_words_v5', 'word-1', {
      word: 'amo',
      translation: 'to love',
    });

    const response = (await duplicatePool(request({ name: 'Custom Cloned Pool' }), {
      params: Promise.resolve({ poolId: 'pool-source' }),
    })) as unknown as {
      status: number;
      body: {
        success: boolean;
        data: {
          pool: {
            id: string;
            name: string;
          };
        };
      };
    };

    expect(response.status).toBe(201);
    expect(response.body.data.pool.name).toBe('Custom Cloned Pool');
  });

  it('filters out deleted or missing words gracefully', async () => {
    setSnapshot('vocabulary_pools', 'pool-source', {
      name: 'Test Pool',
      description: 'Test Description',
      wordDocIds: ['word-active', 'word-missing', 'word-deleting'],
      metadata: {
        tags: ['test'],
        difficulty: 'intermediate',
      },
    });
    setSnapshot('vocabulary_words_v5', 'word-active', {
      word: 'tempus',
      translation: 'time',
    });
    // word-missing does not exist in snapshot
    setSnapshot('vocabulary_words_v5', 'word-deleting', {
      word: 'vetus',
      translation: 'old',
      _deletionPending: true,
    });

    const response = (await duplicatePool(request({}), {
      params: Promise.resolve({ poolId: 'pool-source' }),
    })) as unknown as {
      status: number;
      body: {
        success: boolean;
        data: {
          pool: {
            wordDocIds: string[];
            metadata: {
              wordCount: number;
            };
          };
        };
      };
    };

    expect(response.status).toBe(201);
    expect(response.body.data.pool.wordDocIds).toEqual(['word-active']);
    expect(response.body.data.pool.metadata.wordCount).toBe(1);
  });

  it('safely duplicates large pools containing 500+ words without exceeding Firestore transaction write limits', async () => {
    const largeWordCount = 550;
    const wordDocIds: string[] = [];
    for (let i = 0; i < largeWordCount; i++) {
      const id = `large-word-${i}`;
      wordDocIds.push(id);
      setSnapshot('vocabulary_words_v5', id, {
        word: `latin-${i}`,
        translation: `english-${i}`,
      });
    }

    setSnapshot('vocabulary_pools', 'large-pool', {
      name: 'Large Dictionary Pool',
      description: 'Contains 550 words',
      wordDocIds,
      metadata: {
        wordCount: largeWordCount,
        tags: ['massive'],
        difficulty: 'advanced',
      },
    });

    const response = (await duplicatePool(request({}), {
      params: Promise.resolve({ poolId: 'large-pool' }),
    })) as unknown as {
      status: number;
      body: {
        success: boolean;
        data: {
          pool: {
            wordDocIds: string[];
            metadata: {
              wordCount: number;
            };
          };
        };
      };
    };

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.pool.wordDocIds.length).toBe(largeWordCount);
    expect(response.body.data.pool.metadata.wordCount).toBe(largeWordCount);
    // Bounded transactions should ensure no single transaction has more than 500 writes
    expect(maxWritesInSingleTransaction).toBeLessThanOrEqual(500);
    expect(exclusiveMutationRuns.length).toBe(1);
  });
});
