import { POST, PUT } from '@/src/app/api/admin/lessons/route';

const mockCreate = jest.fn();
const mockSet = jest.fn();
const mockReconcile = jest.fn(async (..._args: unknown[]) => ({
  practiceCategoryIds: [],
  practiceCategories: [],
}));
let existingLessonData: Record<string, unknown> | undefined;

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));

jest.mock('@/src/lib/learning-units/learning-path-service', () => ({
  assertLegacyNormalPlacementChangeAllowedInTransaction: jest.fn(async () => undefined),
  assertPlacedLessonReplacementAllowedInTransaction: jest.fn(async () => undefined),
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
      getAssignmentsForLessonIds: jest.fn(),
    },
  };
});

jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: (id: string) => ({ id }),
    }),
    runTransaction: async (
      callback: (transaction: {
        get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
        create: typeof mockCreate;
        set: typeof mockSet;
      }) => unknown
    ) =>
      callback({
        get: async () => ({
          exists: existingLessonData !== undefined,
          data: () => existingLessonData,
        }),
        create: mockCreate,
        set: mockSet,
      }),
  },
}));

const lessonInput = (overrides: Record<string, unknown> = {}) => ({
  id: 'lesson-1',
  title: 'Lesson',
  type: 'normal',
  pages: [{ id: 'page-1', items: [] }],
  ...overrides,
});

describe('lesson word-search configuration routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    existingLessonData = undefined;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('defaults newly created lessons off and preserves explicit opt-in', async () => {
    await POST({ json: async () => lessonInput() } as never);
    expect(mockCreate.mock.calls[0][1]).toMatchObject({ showWordSearch: false });

    await POST({ json: async () => lessonInput({ showWordSearch: true }) } as never);
    expect(mockCreate.mock.calls[1][1]).toMatchObject({ showWordSearch: true });
  });

  it('preserves existing visibility on update and treats legacy omissions as enabled', async () => {
    existingLessonData = {
      kind: 'lesson',
      isLive: false,
      showWordSearch: false,
      createdAt: '2026-01-01',
      createdBy: 'admin-1',
      version: 1,
    };
    await PUT({ json: async () => lessonInput() } as never);
    expect(mockSet.mock.calls[0][1]).toMatchObject({ showWordSearch: false });

    existingLessonData = {
      kind: 'lesson',
      isLive: false,
      createdAt: '2026-01-01',
      createdBy: 'admin-1',
      version: 1,
    };
    await PUT({ json: async () => lessonInput() } as never);
    expect(mockSet.mock.calls[1][1]).toMatchObject({ showWordSearch: true });
  });

  it('rejects non-boolean visibility values', async () => {
    const response = (await POST({
      json: async () => lessonInput({ showWordSearch: 'yes' }),
    } as never)) as unknown as { status: number; body: { error: string } };

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('showWordSearch must be a boolean');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
