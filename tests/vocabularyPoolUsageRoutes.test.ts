const mockVerifyAdminAccess = jest.fn();
const mockScanVocabularyPoolUsages = jest.fn();
const transactionDelete = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn() } }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  verifyAdminAccess: (...args: unknown[]) => mockVerifyAdminAccess(...args),
}));
jest.mock('@/src/lib/vocabulary-pools/usage.server', () => ({
  scanVocabularyPoolUsages: (...args: unknown[]) => mockScanVocabularyPoolUsages(...args),
}));
jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (collection: string) => ({ doc: (id: string) => ({ collection, id }) }),
    runTransaction: (callback: (transaction: unknown) => unknown) =>
      callback({ get: async (ref: { id: string }) => ({ id: ref.id, exists: true }), delete: transactionDelete }),
  },
}));

import { GET as getUsages } from '@/src/app/api/admin/vocabulary-pools/usages/route';
import { DELETE as deletePool } from '@/src/app/api/admin/vocabulary-pools/[poolId]/route';

describe('vocabulary pool usage routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin-1' });
  });

  it('groups canonical usages for the management page', async () => {
    mockScanVocabularyPoolUsages.mockResolvedValue({
      status: 'available',
      documentCount: 4,
      usages: [
        { id: 'lesson:1', poolId: 'pool-1', kind: 'lesson', label: 'Lesson: First lesson' },
        { id: 'draft:1', poolId: 'pool-2', kind: 'test-version-draft', label: 'Test draft: Draft A' },
      ],
    });

    const response = (await getUsages({} as never)) as unknown as { status: number; body: { data: unknown } };

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      status: 'available',
      usagesByPoolId: {
        'pool-1': [{ id: 'lesson:1', poolId: 'pool-1', kind: 'lesson', label: 'Lesson: First lesson' }],
        'pool-2': [{ id: 'draft:1', poolId: 'pool-2', kind: 'test-version-draft', label: 'Test draft: Draft A' }],
      },
    });
  });

  it('deletes a pool without checking its saved assignments', async () => {
    mockScanVocabularyPoolUsages.mockResolvedValue({
      status: 'available',
      documentCount: 4,
      usages: [
        {
          id: 'exercise:1',
          poolId: 'pool-1',
          kind: 'lesson-exercise',
          label: 'Lesson: First lesson → Page 1, exercise 1',
        },
      ],
    });

    const response = (await deletePool({} as never, { params: Promise.resolve({ poolId: 'pool-1' }) })) as unknown as {
      status: number;
    };

    expect(response.status).toBe(200);
    expect(transactionDelete).toHaveBeenCalledTimes(1);
    expect(mockScanVocabularyPoolUsages).not.toHaveBeenCalled();
  });

  it('deletes a pool even when assignment checks would be unavailable', async () => {
    mockScanVocabularyPoolUsages.mockResolvedValueOnce({
      status: 'unavailable',
      message: 'Assignment checks are temporarily unavailable.',
    });
    const deleted = (await deletePool({} as never, { params: Promise.resolve({ poolId: 'pool-1' }) })) as unknown as {
      status: number;
    };
    expect(deleted.status).toBe(200);
    expect(transactionDelete).toHaveBeenCalledTimes(1);
    expect(mockScanVocabularyPoolUsages).not.toHaveBeenCalled();
  });
});
