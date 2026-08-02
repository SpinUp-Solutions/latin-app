import { POST } from '@/src/app/api/admin/lessons/restore-snapshot/route';

const mockSet = jest.fn();
const mockReconcile = jest.fn();
let mockSnapshotLessons: Array<Record<string, unknown>>;
let mockLearningPath: Record<string, unknown>;
let mockExistingLesson: Record<string, unknown>;
let mockExistingLessonExists: boolean;

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  ...jest.requireActual('@/src/lib/verifyAdminAccess'),
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));

jest.mock('@/src/lib/practice-categories/service', () => {
  class PracticeCategoryError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number
    ) {
      super(message);
      this.name = 'PracticeCategoryError';
    }
  }
  return {
    PracticeCategoryError,
    practiceCategoryService: {
      reconcileLessonCategoriesInTransaction: (...args: unknown[]) => mockReconcile(...args),
    },
  };
});

jest.mock('@/src/services/firebase-admin', () => {
  const collection = (name: string) => ({
    doc: (id: string) => ({ collectionName: name, id }),
  });
  return {
    adminStorage: {
      bucket: () => ({
        file: () => ({
          download: async () => [
            Buffer.from(
              JSON.stringify({
                snapshotId: 'snapshot-1',
                lessons: mockSnapshotLessons,
              })
            ),
          ],
        }),
      }),
    },
    adminDb: {
      collection,
      runTransaction: async (
        callback: (transaction: {
          get: (ref: { collectionName: string; id: string }) => Promise<unknown>;
          set: typeof mockSet;
        }) => unknown
      ) =>
        callback({
          get: async ref => {
            if (ref.collectionName === 'learningPaths') {
              return {
                id: 'default',
                exists: true,
                data: () => mockLearningPath,
              };
            }
            return {
              id: ref.id,
              exists: mockExistingLessonExists,
              data: () => mockExistingLesson,
            };
          },
          set: mockSet,
        }),
    },
  };
});

describe('snapshot restore Learning Path guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSnapshotLessons = [
      {
        id: 'lesson-1',
        title: 'Wrong kind',
        type: 'vocab',
        pages: [{ id: 'page-1', items: [] }],
      },
    ];
    mockLearningPath = {
      revision: 2,
      unitIds: ['lesson-1'],
      updatedAt: 'now',
      updatedBy: 'admin-1',
    };
    mockExistingLesson = { kind: 'lesson', type: 'normal' };
    mockExistingLessonExists = true;
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects replacing a placed normal lesson with a practice lesson before writes', async () => {
    const response = (await POST({
      json: async () => ({
        snapshotPath: 'lesson-snapshots/snapshot-1.json',
        confirmRestore: true,
      }),
    } as never)) as unknown as {
      status: number;
      body: { code: string; data: { restoredLessons: number } };
    };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PLACED_UNIT_INVALID');
    expect(response.body.data.restoredLessons).toBe(0);
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('rejects normal placement changes whenever the canonical path exists', async () => {
    mockExistingLesson = {
      kind: 'lesson',
      type: 'normal',
      isLive: true,
      liveOrder: 0,
      publishedAt: 'before',
      publishedBy: 'admin-1',
    };
    mockSnapshotLessons = [
      {
        id: 'lesson-1',
        title: 'Lesson',
        type: 'normal',
        pages: [{ id: 'page-1', items: [] }],
        isLive: true,
        liveOrder: 1,
        publishedAt: 'before',
        publishedBy: 'admin-1',
      },
    ];
    const response = (await POST({
      json: async () => ({
        snapshotPath: 'lesson-snapshots/snapshot-1.json',
        confirmRestore: true,
      }),
    } as never)) as unknown as {
      status: number;
      body: { code: string };
    };

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LEGACY_NORMAL_PLACEMENT_RETIRED');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('keeps creation of a live practice lesson independent after normal fallback retirement', async () => {
    mockExistingLessonExists = false;
    mockExistingLesson = {};
    mockSnapshotLessons = [
      {
        id: 'vocab-1',
        title: 'Vocabulary',
        type: 'vocab',
        pages: [{ id: 'page-1', items: [] }],
        isLive: true,
        liveOrder: 0,
        publishedAt: 'before',
        publishedBy: 'admin-1',
      },
    ];
    mockLearningPath = {
      ...mockLearningPath,
      unitIds: ['lesson-1'],
    };
    mockReconcile.mockResolvedValue({
      practiceCategoryIds: [],
      practiceCategories: [],
    });

    const response = (await POST({
      json: async () => ({
        snapshotPath: 'lesson-snapshots/snapshot-1.json',
        confirmRestore: true,
      }),
    } as never)) as unknown as { status: number };

    expect(response.status).toBe(200);
    expect(mockSet).toHaveBeenCalledTimes(1);
  });
});
