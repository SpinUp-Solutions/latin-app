import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  parseLessonSaveInput,
  saveLessonInTransaction,
  type LessonSaveMode,
} from '@/src/lib/learning-units/lesson-save.server';

const mockReconcile = jest.fn();
const mockApplyPoolRevisions = jest.fn();
const mockAssertPoolAssignments = jest.fn(async (..._args: unknown[]) => mockApplyPoolRevisions);

jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));
jest.mock('@/src/lib/practice-categories/service', () => ({
  practiceCategoryService: {
    reconcileLessonCategoriesInTransaction: (...args: unknown[]) => mockReconcile(...args),
  },
}));
jest.mock('@/src/lib/vocabulary-pools/assignment.server', () => ({
  assertVocabularyPoolAssignmentsAllowedInTransaction: (...args: unknown[]) => mockAssertPoolAssignments(...args),
}));

type Stored = Record<string, unknown> | undefined;

const page = { id: 'page-1', title: 'Page', items: [] };
const payload = (overrides: Record<string, unknown> = {}) => ({
  id: 'lesson-1',
  title: 'Lesson',
  type: 'vocab',
  pages: [page],
  ...overrides,
});
const storedLesson = (overrides: Record<string, unknown> = {}) => ({
  kind: 'lesson',
  type: 'vocab',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'author-1',
  version: 4,
  isLive: false,
  liveOrder: null,
  publishedAt: null,
  publishedBy: null,
  ...overrides,
});

const setup = (stored: Stored, learningPath?: Record<string, unknown>) => {
  const transaction = {
    get: jest.fn(async (ref: { collection: string }) => {
      const data = ref.collection === 'learningPaths' ? learningPath : stored;
      return {
        id: ref.collection === 'learningPaths' ? 'default' : 'lesson-1',
        exists: Boolean(data),
        data: () => data,
      };
    }),
    set: jest.fn(),
    create: jest.fn(),
  };
  const db = { collection: (collection: string) => ({ doc: (id: string) => ({ collection, id }) }) };
  const save = (rawLesson: unknown, mode: LessonSaveMode) =>
    saveLessonInTransaction(
      transaction as unknown as Transaction,
      db as unknown as Firestore,
      parseLessonSaveInput(rawLesson),
      'admin-1',
      mode
    );
  return { transaction, save };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockReconcile.mockResolvedValue({
    practiceCategorySelections: [{ categoryId: 'authors', tagIds: [] }],
    practiceCategoryIds: ['authors'],
    practiceCategories: [{ id: 'authors', name: 'Authors' }],
  });
});

describe('parseLessonSaveInput', () => {
  it.each([
    ['a test unit', { ...payload(), kind: 'test' }, 'Only lesson documents can use the lesson endpoint'],
    ['a non-boolean word search flag', payload({ showWordSearch: 'yes' }), 'showWordSearch must be a boolean'],
    ['no payload', undefined, 'Only lesson documents can use the lesson endpoint'],
  ])('rejects %s before any read', (_name, rawLesson, message) => {
    expect(() => parseLessonSaveInput(rawLesson)).toThrow(
      expect.objectContaining({ status: 400, code: 'LESSON_INVALID', message })
    );
  });

  it('uses the fallback category IDs only when the payload has none', () => {
    expect(parseLessonSaveInput(payload(), ['fallback']).practiceCategoryIds).toEqual(['fallback']);
    expect(parseLessonSaveInput(payload({ practiceCategoryIds: ['own'] }), ['fallback']).practiceCategoryIds).toEqual([
      'own',
    ]);
  });
});

describe('saveLessonInTransaction', () => {
  it('creates an unpublished first version and assigns no categories by default', async () => {
    const { transaction, save } = setup(undefined);

    const result = await save(payload(), 'create');

    expect(result.created).toBe(true);
    expect(transaction.set).not.toHaveBeenCalled();
    const [, document] = transaction.create.mock.calls[0];
    expect(document).toMatchObject({
      id: 'lesson-1',
      kind: 'lesson',
      version: 1,
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
      showWordSearch: false,
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
      totalPages: 1,
      totalItems: 0,
      totalExercises: 0,
    });
    expect(mockReconcile).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ lessonId: 'lesson-1', desiredCategoryIds: [], actorId: 'admin-1' })
    );
    expect(mockApplyPoolRevisions).toHaveBeenCalledTimes(1);
  });

  it('keeps authorship, placement and the word search setting on update, and bumps the version', async () => {
    const stored = storedLesson({
      type: 'normal',
      isLive: true,
      liveOrder: 3,
      publishedAt: '2026-02-01T00:00:00.000Z',
      publishedBy: 'publisher-1',
      showWordSearch: false,
    });
    const { transaction, save } = setup(stored);

    const result = await save(payload({ type: 'normal' }), 'update');

    expect(result.created).toBe(false);
    expect(transaction.create).not.toHaveBeenCalled();
    const [, document] = transaction.set.mock.calls[0];
    expect(document).toMatchObject({
      version: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'author-1',
      updatedBy: 'admin-1',
      isLive: true,
      liveOrder: 3,
      publishedAt: '2026-02-01T00:00:00.000Z',
      publishedBy: 'publisher-1',
      showWordSearch: false,
    });
    // No category fields in the payload: the lesson keeps its memberships.
    expect(mockReconcile.mock.calls[0][1]).toMatchObject({ desiredCategoryIds: undefined });
    expect(mockAssertPoolAssignments).toHaveBeenCalledWith(transaction, expect.anything(), stored, document);
  });

  it('returns the reconciled categories with the lesson without storing them on it', async () => {
    const { transaction, save } = setup(storedLesson());

    const result = await save(
      payload({ practiceCategorySelections: [{ categoryId: 'authors', tagIds: ['cicero'] }] }),
      'update'
    );

    expect(mockReconcile.mock.calls[0][1]).toMatchObject({
      desiredCategorySelections: [{ categoryId: 'authors', tagIds: ['cicero'] }],
    });
    const [, document] = transaction.set.mock.calls[0];
    for (const field of ['practiceCategorySelections', 'practiceCategoryIds', 'practiceCategories']) {
      expect(document).not.toHaveProperty(field);
    }
    expect(result.lesson).toMatchObject({
      practiceCategoryIds: ['authors'],
      practiceCategories: [{ id: 'authors', name: 'Authors' }],
    });
  });

  it.each([
    ['create', storedLesson(), 409, 'LESSON_ALREADY_EXISTS'],
    ['update', undefined, 404, 'LESSON_NOT_FOUND'],
    ['create', { kind: 'test' }, 409, 'LESSON_ALREADY_EXISTS'],
    ['update', { kind: 'test' }, 404, 'LESSON_NOT_FOUND'],
    ['create-or-update', { kind: 'test' }, 404, 'LESSON_NOT_FOUND'],
  ] as const)('in %s mode with stored %o answers %i %s and writes nothing', async (mode, stored, status, code) => {
    const { transaction, save } = setup(stored);

    await expect(save(payload(), mode)).rejects.toMatchObject({ status, code });

    expect(mockReconcile).not.toHaveBeenCalled();
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it.each(['update', 'create-or-update'] as const)(
    'rejects a %s that would leave a live lesson without valid pages',
    async mode => {
      const { transaction, save } = setup(storedLesson({ type: 'normal', isLive: true, liveOrder: 0 }));

      await expect(save(payload({ type: 'normal', pages: [] }), mode)).rejects.toMatchObject({
        status: 400,
        code: 'LESSON_PROGRESSION_INVALID',
        details: { progressionErrors: ['Lesson must contain at least one page.'] },
      });

      expect(transaction.set).not.toHaveBeenCalled();
    }
  );

  it('does not let a save turn a lesson placed on the Learning Path into a practice lesson', async () => {
    const { transaction, save } = setup(storedLesson({ type: 'normal' }), {
      revision: 2,
      unitIds: ['lesson-1'],
      updatedAt: 'now',
      updatedBy: 'admin-1',
    });

    await expect(save(payload({ type: 'vocab' }), 'create-or-update')).rejects.toMatchObject({
      status: 400,
      code: 'PLACED_UNIT_INVALID',
    });

    expect(mockReconcile).not.toHaveBeenCalled();
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('creates through create-or-update when the lesson does not exist yet', async () => {
    const { transaction, save } = setup(undefined);

    const result = await save(payload({ showWordSearch: true }), 'create-or-update');

    expect(result.created).toBe(true);
    expect(transaction.create.mock.calls[0][1]).toMatchObject({ version: 1, showWordSearch: true, isLive: false });
  });
});
