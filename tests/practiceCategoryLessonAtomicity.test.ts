import { POST } from '@/src/app/api/admin/lessons/route';

const mockReconcile = jest.fn();
const mockCreate = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: class AdminAccessError extends Error {},
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
      getAssignmentsForLessonIds: jest.fn(),
    },
  };
});

jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    runTransaction: async (callback: (transaction: unknown) => unknown) =>
      callback({
        get: async () => ({ exists: false }),
        create: mockCreate,
      }),
  },
}));

describe('atomic lesson and practice-category writes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReconcile.mockReset();
    mockReconcile.mockResolvedValue({
      practiceCategorySelections: [{ categoryId: 'authors', tagIds: ['cicero'] }],
      practiceCategoryIds: ['authors'],
      practiceCategories: [],
      memberships: [],
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('does not queue the lesson write when membership validation fails', async () => {
    const { PracticeCategoryError } = jest.requireMock('@/src/lib/practice-categories/service') as {
      PracticeCategoryError: new (code: string, message: string, status: number) => Error;
    };
    mockReconcile.mockRejectedValue(
      new PracticeCategoryError('CATEGORY_TYPE_MISMATCH', 'Category does not match this lesson type', 400)
    );

    const response = (await POST({
      json: async () => ({
        id: 'lesson-1',
        title: 'Vocabulary lesson',
        type: 'vocab',
        pages: [],
        practiceCategoryIds: ['listening-category'],
      }),
    } as never)) as unknown as { status: number; body: { code?: string } };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CATEGORY_TYPE_MISMATCH');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('reconciles canonical category-owned tag selections without persisting local assignment fields', async () => {
    const response = (await POST({
      json: async () => ({
        id: 'lesson-1',
        title: 'Vocabulary lesson',
        type: 'vocab',
        pages: [],
        practiceCategorySelections: [{ categoryId: 'authors', tagIds: ['cicero'] }],
        practiceCategoryIds: ['legacy-ignored'],
        practiceCategories: [{ id: 'authors', name: 'Authors' }],
      }),
    } as never)) as unknown as { status: number; body: { lesson: Record<string, unknown> } };

    expect(response.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lessonId: 'lesson-1',
        desiredCategorySelections: [{ categoryId: 'authors', tagIds: ['cicero'] }],
      })
    );
    const persistedLesson = mockCreate.mock.calls[0][1] as Record<string, unknown>;
    expect(persistedLesson).not.toHaveProperty('practiceCategorySelections');
    expect(persistedLesson).not.toHaveProperty('practiceCategoryIds');
    expect(persistedLesson).not.toHaveProperty('practiceCategories');
    expect(response.body.lesson.practiceCategorySelections).toEqual([{ categoryId: 'authors', tagIds: ['cicero'] }]);
  });
});
