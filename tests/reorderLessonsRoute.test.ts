import { POST } from '@/src/app/api/admin/lessons/reorder/route';

const mockRunTransaction = jest.fn();
const mockCollection = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  ...jest.requireActual('@/src/lib/verifyAdminAccess'),
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));

jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  },
}));

const request = (updates: unknown) =>
  ({
    json: async () => ({ updates }),
  }) as never;

function configureFirestore(lessons: Record<string, Record<string, unknown>>, learningPath?: Record<string, unknown>) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  mockCollection.mockImplementation((collectionName: string) => ({
    doc: (id: string) => ({ collectionName, id }),
  }));

  const transaction = {
    getAll: jest.fn(async (...refs: Array<{ id: string }>) =>
      refs.map(ref => ({
        id: ref.id,
        exists: Boolean(lessons[ref.id]),
        data: () => lessons[ref.id],
      }))
    ),
    get: jest.fn(async (ref: { collectionName?: string; id: string }) =>
      ref.collectionName === 'content_sync_locks'
        ? { id: ref.id, exists: false, data: () => undefined }
        : {
            id: ref.id,
            exists: Boolean(learningPath),
            data: () => learningPath,
          }
    ),
    update: jest.fn((ref: { id: string }, data: Record<string, unknown>) => {
      updates.push({ id: ref.id, data });
    }),
  };
  mockRunTransaction.mockImplementation(async callback => callback(transaction));
  return { transaction, updates };
}

const retiredPath = {
  id: 'default',
  revision: 2,
  unitIds: ['normal-1'],
  updatedAt: 'now',
  updatedBy: 'admin-1',
};

describe('reorder lessons route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects legacy normal reordering after fallback retirement without writes', async () => {
    const { transaction } = configureFirestore(
      {
        'normal-1': { kind: 'lesson', type: 'normal' },
        'normal-2': { kind: 'lesson', type: 'normal' },
      },
      retiredPath
    );

    const response = (await POST(
      request([
        { lessonId: 'normal-1', liveOrder: 1 },
        { lessonId: 'normal-2', liveOrder: 0 },
      ])
    )) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LEGACY_NORMAL_PLACEMENT_RETIRED');
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('allows normal reordering only when the canonical path is absent', async () => {
    const { transaction } = configureFirestore({
      'normal-1': { kind: 'lesson', type: 'normal' },
      'normal-2': { kind: 'lesson', type: 'normal' },
    });

    const response = (await POST(
      request([
        { lessonId: 'normal-1', liveOrder: 1 },
        { lessonId: 'normal-2', liveOrder: 0 },
      ])
    )) as unknown as { status: number };

    expect(response.status).toBe(200);
    expect(transaction.update).toHaveBeenCalledTimes(2);
  });

  it('keeps practice reordering available after normal fallback retirement', async () => {
    const { transaction } = configureFirestore(
      {
        'vocab-1': { kind: 'lesson', type: 'vocab' },
        'vocab-2': { kind: 'lesson', type: 'vocab' },
      },
      retiredPath
    );

    const response = (await POST(
      request([
        { lessonId: 'vocab-1', liveOrder: 1 },
        { lessonId: 'vocab-2', liveOrder: 0 },
      ])
    )) as unknown as { status: number };

    expect(response.status).toBe(200);
    expect(transaction.get).toHaveBeenCalledTimes(1);
    expect(transaction.get).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName: 'content_sync_locks', id: 'prod-content-to-dev' })
    );
    expect(transaction.update).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed and mixed-type requests before writes', async () => {
    const malformed = (await POST(
      request([
        { lessonId: 'normal-1', liveOrder: 0 },
        { lessonId: 'normal-1', liveOrder: 1 },
      ])
    )) as unknown as { status: number };
    expect(malformed.status).toBe(400);

    const { transaction } = configureFirestore({
      'normal-1': { kind: 'lesson', type: 'normal' },
      'vocab-1': { kind: 'lesson', type: 'vocab' },
    });
    const mixed = (await POST(
      request([
        { lessonId: 'normal-1', liveOrder: 0 },
        { lessonId: 'vocab-1', liveOrder: 1 },
      ])
    )) as unknown as { status: number };

    expect(mixed.status).toBe(409);
    expect(transaction.update).not.toHaveBeenCalled();
  });
});
