import { POST } from '@/src/app/api/admin/lessons/recovery/[id]/route';

const mockTransactionSet = jest.fn();
const mockTransactionUpdate = jest.fn();
let mockRecoveryStatus: 'pending' | 'recovered' | 'discarded' = 'pending';
let mockLearningPathData: Record<string, unknown> | undefined;
let mockRecoveryLessonData: Record<string, unknown>;
const mockReconcile = jest.fn(async (..._args: unknown[]) => ({
  practiceCategorySelections: [{ categoryId: 'category-1', tagIds: [] }],
  practiceCategoryIds: ['category-1'],
  practiceCategories: [{ id: 'category-1', name: 'Authors' }],
  memberships: [],
}));

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: class AdminAccessError extends Error {},
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));

jest.mock('@/src/lib/practice-categories/service', () => ({
  PracticeCategoryError: class PracticeCategoryError extends Error {},
  practiceCategoryService: {
    reconcileLessonCategoriesInTransaction: (...args: unknown[]) => mockReconcile(...args),
  },
}));

jest.mock('@/src/services/firebase-admin', () => {
  const collection = (name: string) => ({
    doc: (id: string) => ({ id, collectionName: name }),
  });
  return {
    adminDb: {
      collection,
      runTransaction: async (callback: (transaction: unknown) => unknown) =>
        callback({
          get: async (ref: { collectionName: string }) =>
            ref.collectionName === 'lesson_recovery'
              ? {
                  exists: true,
                  data: () => ({
                    userId: 'admin-1',
                    status: mockRecoveryStatus,
                    rawLessonData: mockRecoveryLessonData,
                  }),
                }
              : ref.collectionName === 'learningPaths'
                ? {
                    id: 'default',
                    exists: Boolean(mockLearningPathData),
                    data: () => mockLearningPathData,
                  }
                : {
                    exists: true,
                    data: () => ({
                      createdAt: '2026-01-01T00:00:00.000Z',
                      createdBy: 'admin-1',
                      version: 2,
                      isLive: false,
                      liveOrder: null,
                    }),
                  },
          set: mockTransactionSet,
          update: mockTransactionUpdate,
        }),
    },
  };
});

describe('practice category recovery retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecoveryStatus = 'pending';
    mockLearningPathData = undefined;
    mockRecoveryLessonData = {
      id: 'lesson-1',
      title: 'Recovered lesson',
      type: 'vocab',
      pages: [],
      practiceCategoryIds: ['category-1'],
      practiceCategories: [{ id: 'category-1', name: 'Authors' }],
    };
  });

  it('atomically reconciles pending IDs without persisting joined or local category fields', async () => {
    const response = (await POST({} as never, {
      params: Promise.resolve({ id: 'recovery-1' }),
    })) as unknown as { status: number; body: { lesson: Record<string, unknown> } };

    expect(response.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lessonId: 'lesson-1',
        desiredCategoryIds: ['category-1'],
        actorId: 'admin-1',
      })
    );
    const persistedLesson = mockTransactionSet.mock.calls[0][1] as Record<string, unknown>;
    expect(persistedLesson).not.toHaveProperty('practiceCategoryIds');
    expect(persistedLesson).not.toHaveProperty('practiceCategories');
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName: 'lesson_recovery', id: 'recovery-1' }),
      expect.objectContaining({ status: 'recovered' })
    );
    expect(response.body.lesson.practiceCategoryIds).toEqual(['category-1']);
  });

  it('prefers recovered category/tag selections and strips them from the lesson document', async () => {
    mockRecoveryLessonData = {
      ...mockRecoveryLessonData,
      practiceCategorySelections: [{ categoryId: 'category-1', tagIds: ['cicero'] }],
    };

    const response = (await POST({} as never, {
      params: Promise.resolve({ id: 'recovery-1' }),
    })) as unknown as { status: number; body: { lesson: Record<string, unknown> } };

    expect(response.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        desiredCategorySelections: [{ categoryId: 'category-1', tagIds: ['cicero'] }],
      })
    );
    const persistedLesson = mockTransactionSet.mock.calls[0][1] as Record<string, unknown>;
    expect(persistedLesson).not.toHaveProperty('practiceCategorySelections');
    expect(response.body.lesson.practiceCategorySelections).toEqual([{ categoryId: 'category-1', tagIds: [] }]);
  });

  it('strips retired and arbitrary top-level fields when retrying recovery', async () => {
    mockRecoveryLessonData = {
      ...mockRecoveryLessonData,
      published: true,
      introduction: [{ legacy: true }],
      introduction_backup: [{ legacy: true }],
      exercises: [{ legacy: true }],
      exercises_backup: [{ legacy: true }],
      arbitraryClientField: 'must not persist',
    };

    const response = (await POST({} as never, {
      params: Promise.resolve({ id: 'recovery-1' }),
    })) as unknown as { status: number };

    expect(response.status).toBe(200);
    const persistedLesson = mockTransactionSet.mock.calls[0][1] as Record<string, unknown>;
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
  });

  it('rejects replaying an item that has already left pending state', async () => {
    mockRecoveryStatus = 'recovered';

    const response = (await POST({} as never, {
      params: Promise.resolve({ id: 'recovery-1' }),
    })) as unknown as { status: number; body: { error: string } };

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Recovery item is no longer pending');
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(mockTransactionSet).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });

  it('does not let recovery replace a placed normal lesson with practice content', async () => {
    mockLearningPathData = {
      revision: 2,
      unitIds: ['lesson-1'],
      updatedAt: 'now',
      updatedBy: 'admin-1',
    };

    const response = (await POST({} as never, {
      params: Promise.resolve({ id: 'recovery-1' }),
    })) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PLACED_UNIT_INVALID');
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(mockTransactionSet).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });
});
