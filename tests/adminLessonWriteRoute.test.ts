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
  AdminAccessError: jest.requireActual('@/src/lib/admin-access-error').AdminAccessError,
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));

jest.mock('@/src/lib/learning-units/learning-path-service', () => ({
  assertLegacyNormalPlacementChangeAllowedInTransaction: jest.fn(async () => undefined),
  assertPlacedLessonReplacementAllowedInTransaction: jest.fn(async () => undefined),
}));

jest.mock('@/src/lib/practice-categories/service', () => {
  const { DomainError } = jest.requireActual<typeof import('@/src/lib/domain-error')>('@/src/lib/domain-error');
  class PracticeCategoryError extends DomainError {
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
    collection: (collectionName: string) => ({
      doc: (id: string) => ({ id, collectionName }),
    }),
    runTransaction: async (
      callback: (transaction: {
        get: (ref: { collectionName?: string }) => Promise<{
          exists: boolean;
          data: () => Record<string, unknown> | undefined;
        }>;
        create: typeof mockCreate;
        set: typeof mockSet;
      }) => unknown
    ) =>
      callback({
        get: async ref =>
          ref.collectionName === 'content_sync_locks'
            ? { exists: false, data: () => undefined }
            : {
                exists: existingLessonData !== undefined,
                data: () => existingLessonData,
              },
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

describe('admin lesson write route', () => {
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

  it.each([
    ['create', POST, mockCreate],
    ['update', PUT, mockSet],
  ] as const)(
    'drops retired and unknown top-level fields on %s while preserving nested authored content',
    async (action, handler, write) => {
      if (action === 'update') {
        existingLessonData = {
          kind: 'lesson',
          isLive: false,
          createdAt: '2026-01-01',
          createdBy: 'admin-1',
          version: 1,
        };
      }
      await handler({
        json: async () =>
          lessonInput({
            pages: [
              {
                id: 'page-1',
                items: [{ id: 'item-1', type: 'text', content: 'Keep me', rendererOwnedField: true }],
                rendererOwnedPageField: true,
              },
            ],
            published: true,
            introduction: [{ legacy: true }],
            introduction_backup: [{ legacy: true }],
            exercises: [{ legacy: true }],
            exercises_backup: [{ legacy: true }],
            arbitraryClientField: 'must not persist',
          }),
      } as never);

      const persistedLesson = write.mock.calls[0][1] as Record<string, unknown>;
      for (const field of [
        'published',
        'introduction',
        'introduction_backup',
        'exercises',
        'exercises_backup',
        'arbitraryClientField',
      ]) {
        expect(persistedLesson).not.toHaveProperty(field);
      }
      expect(persistedLesson.pages).toEqual([
        expect.objectContaining({
          id: 'page-1',
          rendererOwnedPageField: true,
          items: [expect.objectContaining({ id: 'item-1', content: 'Keep me', rendererOwnedField: true })],
        }),
      ]);
    }
  );

  it('does not queue the lesson write when membership validation fails', async () => {
    const { PracticeCategoryError } = jest.requireMock('@/src/lib/practice-categories/service') as {
      PracticeCategoryError: new (code: string, message: string, status: number) => Error;
    };
    mockReconcile.mockRejectedValueOnce(
      new PracticeCategoryError('CATEGORY_TYPE_MISMATCH', 'Category does not match this lesson type', 400)
    );

    const response = (await POST({
      json: async () => lessonInput({ type: 'vocab', practiceCategoryIds: ['listening-category'] }),
    } as never)) as unknown as { status: number; body: { code?: string } };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CATEGORY_TYPE_MISMATCH');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('reconciles canonical category-owned tag selections without persisting local assignment fields', async () => {
    const selections = [{ categoryId: 'authors', tagIds: ['cicero'] }];
    mockReconcile.mockResolvedValueOnce({
      practiceCategorySelections: selections,
      practiceCategoryIds: ['authors'],
      practiceCategories: [],
      memberships: [],
    } as never);

    const response = (await POST({
      json: async () =>
        lessonInput({
          type: 'vocab',
          practiceCategorySelections: selections,
          practiceCategoryIds: ['legacy-ignored'],
          practiceCategories: [{ id: 'authors', name: 'Authors' }],
        }),
    } as never)) as unknown as { status: number; body: { lesson: Record<string, unknown> } };

    expect(response.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lessonId: 'lesson-1', desiredCategorySelections: selections })
    );
    const persistedLesson = mockCreate.mock.calls[0][1] as Record<string, unknown>;
    expect(persistedLesson).not.toHaveProperty('practiceCategorySelections');
    expect(persistedLesson).not.toHaveProperty('practiceCategoryIds');
    expect(persistedLesson).not.toHaveProperty('practiceCategories');
    expect(response.body.lesson.practiceCategorySelections).toEqual(selections);
  });
});
