const mockVerifyAdminAccess = jest.fn();
const mockScanVocabularyPoolUsages = jest.fn();
const mockWriteVocabularyPoolWordArchive = jest.fn();
const transactionCreate = jest.fn();
const transactionDelete = jest.fn();
const transactionSet = jest.fn();
const directDelete = jest.fn();

type FakeSnapshot = { id: string; exists: boolean; data: () => Record<string, unknown> | undefined };
type FakeRef = { collection: string; id: string; get: () => Promise<FakeSnapshot>; delete: () => Promise<void> };

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
const ref = (collection: string, id: string): FakeRef => ({
  collection,
  id,
  get: async () => snapshots.get(key(collection, id)) ?? snapshot(id),
  delete: async () => {
    directDelete(collection, id);
    setSnapshot(collection, id);
  },
});

const request = (body?: unknown) =>
  ({
    json: jest.fn().mockResolvedValue(body),
  }) as never;

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({
  FieldPath: { documentId: jest.fn() },
  FieldValue: { serverTimestamp: jest.fn(() => 'server-timestamp') },
}));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: jest.requireActual('@/src/lib/verifyAdminAccess').AdminAccessError,
  verifyAdminAccess: (...args: unknown[]) => mockVerifyAdminAccess(...args),
}));
jest.mock('@/src/lib/vocabulary-pools/usage.server', () => ({
  scanVocabularyPoolUsages: (...args: unknown[]) => mockScanVocabularyPoolUsages(...args),
}));
jest.mock('@/src/lib/vocabulary-pools/archive.server', () => ({
  DELETED_VOCABULARY_POOL_COLLECTION: 'deleted_vocabulary_pools',
  VOCABULARY_POOL_ARCHIVE_COLLECTION: 'vocabulary_pool_archives',
  VOCABULARY_POOL_COLLECTION: 'vocabulary_pools',
  VOCABULARY_POOL_DELETION_CHALLENGE_COLLECTION: 'vocabulary_pool_deletion_challenges',
  VocabularyPoolArchiveIntegrityError: class VocabularyPoolArchiveIntegrityError extends Error {},
  writeVocabularyPoolWordArchive: (...args: unknown[]) => mockWriteVocabularyPoolWordArchive(...args),
}));
jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
    runTransaction: async (callback: (transaction: unknown) => unknown) =>
      callback({
        get: async (candidate: FakeRef) => candidate.get(),
        getAll: async (...refs: FakeRef[]) => Promise.all(refs.map(candidate => candidate.get())),
        set: (candidate: FakeRef, data: Record<string, unknown>) => {
          transactionSet(candidate, data);
          setSnapshot(candidate.collection, candidate.id, data);
        },
        create: (candidate: FakeRef, data: Record<string, unknown>) => {
          transactionCreate(candidate, data);
          setSnapshot(candidate.collection, candidate.id, data);
        },
        delete: (candidate: FakeRef) => {
          transactionDelete(candidate);
          setSnapshot(candidate.collection, candidate.id);
        },
      }),
  },
}));

import { GET as getUsages } from '@/src/app/api/admin/vocabulary-pools/usages/route';
import { POST as prepareDeletion } from '@/src/app/api/admin/vocabulary-pools/[poolId]/deletion-challenge/route';
import {
  DELETE as deletePool,
  GET as getPool,
  PUT as updatePool,
} from '@/src/app/api/admin/vocabulary-pools/[poolId]/route';
import { AdminAccessError } from '@/src/lib/verifyAdminAccess';

const poolData = () => ({
  name: 'Chapter words',
  description: 'Words',
  wordDocIds: ['word-1'],
  metadata: { updatedAt: new Date('2026-08-11T12:00:00.000Z'), updatedBy: 'admin-1' },
});
const availableScan = (labels = ['Lesson: First lesson']) => ({
  status: 'available' as const,
  documentCount: 4,
  usages: labels.map((label, index) => ({
    id: `lesson:${index}`,
    poolId: 'pool-1',
    kind: 'lesson' as const,
    label,
  })),
});

describe('vocabulary pool usage and deletion routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    snapshots.clear();
    setSnapshot('vocabulary_pools', 'pool-1', poolData());
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin-1' });
    mockScanVocabularyPoolUsages.mockResolvedValue(availableScan([]));
    mockWriteVocabularyPoolWordArchive.mockResolvedValue(1);
  });

  it('groups canonical usages for the management page', async () => {
    mockScanVocabularyPoolUsages.mockResolvedValueOnce(availableScan());
    const response = (await getUsages(request())) as unknown as { status: number; body: { data: unknown } };

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      status: 'available',
      usagesByPoolId: {
        'pool-1': [expect.objectContaining({ label: 'Lesson: First lesson' })],
      },
    });
  });

  it.each([
    ['GET', getPool],
    ['PUT', updatePool],
    ['DELETE', deletePool],
  ])('rejects unauthenticated %s requests before accessing pool data', async (_method, handler) => {
    mockVerifyAdminAccess.mockRejectedValueOnce(new AdminAccessError('Unauthorized', 401));
    const response = (await handler(request({}), { params: Promise.resolve({ poolId: 'pool-1' }) })) as unknown as {
      status: number;
      body: { error: string };
    };

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
    expect(mockScanVocabularyPoolUsages).not.toHaveBeenCalled();
  });

  it('rejects non-admin challenge requests', async () => {
    mockVerifyAdminAccess.mockRejectedValueOnce(new AdminAccessError('Forbidden', 403));
    const response = (await prepareDeletion(request(), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { status: number; body: { error: string } };

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
  });

  it('refuses to issue a deletion challenge for an assigned pool', async () => {
    mockScanVocabularyPoolUsages.mockResolvedValueOnce(availableScan());
    const response = (await prepareDeletion(request(), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VOCABULARY_POOL_IN_USE');
    expect(transactionSet).not.toHaveBeenCalled();
  });

  it('refuses to issue a deletion challenge when assignment checks are unavailable', async () => {
    mockScanVocabularyPoolUsages.mockResolvedValueOnce({
      status: 'unavailable',
      message: 'Assignment checks are temporarily unavailable.',
    });
    const response = (await prepareDeletion(request(), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VOCABULARY_POOL_USAGE_UNAVAILABLE');
    expect(transactionSet).not.toHaveBeenCalled();
  });

  it('requires a server-issued token before deletion', async () => {
    const response = (await deletePool(request({}), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VOCABULARY_POOL_CONFIRMATION_REQUIRED');
    expect(transactionDelete).not.toHaveBeenCalled();
  });

  it('archives the pool and word snapshots after a bound confirmation', async () => {
    mockScanVocabularyPoolUsages.mockResolvedValue(availableScan([]));
    const prepared = (await prepareDeletion(request(), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as {
      status: number;
      body: { data: { token: string; poolName: string; wordCount: number; usages: unknown[] } };
    };

    expect(prepared.status).toBe(200);
    expect(prepared.body.data.poolName).toBe('Chapter words');
    expect(prepared.body.data.wordCount).toBe(1);
    expect(prepared.body.data.usages).toHaveLength(0);

    const deleted = (await deletePool(request({ confirmationToken: prepared.body.data.token }), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { status: number };

    expect(deleted.status).toBe(200);
    expect(mockWriteVocabularyPoolWordArchive).toHaveBeenCalledTimes(1);
    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'vocabulary_pool_archives' }),
      expect.objectContaining({ name: 'Chapter words' })
    );
    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'deleted_vocabulary_pools', id: 'pool-1' }),
      expect.objectContaining({ archiveId: expect.any(String), deletedBy: 'admin-1' })
    );
    expect(transactionDelete).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'vocabulary_pools', id: 'pool-1' })
    );
  });

  it('refuses to delete a pool while saved assignments still reference it', async () => {
    const prepared = (await prepareDeletion(request(), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { body: { data: { token: string } } };
    mockScanVocabularyPoolUsages.mockResolvedValueOnce(availableScan());

    const response = (await deletePool(request({ confirmationToken: prepared.body.data.token }), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VOCABULARY_POOL_IN_USE');
    expect(mockWriteVocabularyPoolWordArchive).not.toHaveBeenCalled();
  });

  it('blocks deletion when an assignment appears after confirmation', async () => {
    mockScanVocabularyPoolUsages.mockResolvedValueOnce(availableScan([]));
    const prepared = (await prepareDeletion(request(), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { body: { data: { token: string } } };
    mockScanVocabularyPoolUsages.mockResolvedValueOnce(availableScan(['Lesson: First lesson', 'Lesson: New lesson']));

    const response = (await deletePool(request({ confirmationToken: prepared.body.data.token }), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VOCABULARY_POOL_IN_USE');
    expect(mockWriteVocabularyPoolWordArchive).not.toHaveBeenCalled();
  });

  it('invalidates confirmation when assignment checks become unavailable', async () => {
    const prepared = (await prepareDeletion(request(), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { body: { data: { token: string } } };
    mockScanVocabularyPoolUsages.mockResolvedValueOnce({
      status: 'unavailable',
      message: 'Assignment checks are temporarily unavailable.',
    });

    const response = (await deletePool(request({ confirmationToken: prepared.body.data.token }), {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VOCABULARY_POOL_USAGE_UNAVAILABLE');
  });
});
