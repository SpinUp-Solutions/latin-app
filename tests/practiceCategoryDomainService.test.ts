import { isCategorisableLesson, normalizeCategoryName, normalizeTagName } from '@/src/lib/practice-categories/domain';
import {
  createPracticeTagSchema,
  createPracticeCategorySchema,
  optionalPracticeCategoryIdsSchema,
  practiceCategorySelectionsSchema,
  reorderPracticeCategoriesSchema,
  replacePracticeMembershipTagsSchema,
  updatePracticeCategorySchema,
} from '@/src/lib/practice-categories/schemas';
import {
  getPracticeCategoryMembershipId,
  PracticeCategoryError,
  PracticeCategoryService,
} from '@/src/lib/practice-categories/service';

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));

const now = '2026-07-14T00:00:00.000Z';

const category = (overrides: Record<string, unknown> = {}) => ({
  id: 'category-1',
  lessonType: 'vocab',
  name: 'Authors',
  normalizedName: 'authors',
  status: 'active',
  categoryOrder: 0,
  tags: [],
  createdAt: now,
  createdBy: 'admin-1',
  updatedAt: now,
  updatedBy: 'admin-1',
  ...overrides,
});

const membership = (overrides: Record<string, unknown> = {}) => ({
  id: 'membership-1',
  categoryId: 'category-1',
  lessonId: 'lesson-1',
  lessonOrder: 0,
  tagIds: [],
  createdAt: now,
  createdBy: 'admin-1',
  updatedAt: now,
  updatedBy: 'admin-1',
  ...overrides,
});

const tag = (overrides: Record<string, unknown> = {}) => ({
  id: 'tag-cicero',
  name: 'Cicero',
  normalizedName: 'cicero',
  status: 'active',
  tagOrder: 0,
  createdAt: now,
  createdBy: 'admin-1',
  updatedAt: now,
  updatedBy: 'admin-1',
  ...overrides,
});

const snapshot = (id: string, data?: Record<string, unknown>) => ({
  id,
  exists: Boolean(data),
  data: () => data,
  ref: { id },
});

const querySnapshot = (docs: ReturnType<typeof snapshot>[] = []) => ({
  docs,
  empty: docs.length === 0,
  size: docs.length,
});

const fakeDb = {
  collection: (name: string) => {
    const query = {
      name,
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      doc: (id: string) => ({ id, collection: name }),
    };
    return query;
  },
};

const makeTransaction = (
  existingMemberships: Record<string, unknown>[] = [],
  categories: Record<string, Record<string, unknown>> = {}
) => ({
  get: jest.fn(async () => querySnapshot(existingMemberships.map(item => snapshot(item.id as string, item)))),
  getAll: jest.fn(async (...refs: { id: string }[]) => refs.map(ref => snapshot(ref.id, categories[ref.id]))),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  set: jest.fn(),
});

describe('practice category domain contracts', () => {
  it('recognizes only legacy/current lesson kinds with practice lesson types', () => {
    expect(isCategorisableLesson({ type: 'vocab' })).toBe(true);
    expect(isCategorisableLesson({ kind: 'lesson', type: 'listening' })).toBe(true);
    expect(isCategorisableLesson({ type: 'normal' })).toBe(false);
    expect(isCategorisableLesson({ kind: 'test', type: 'vocab' })).toBe(false);
    expect(isCategorisableLesson({ kind: null, type: 'vocab' })).toBe(false);
  });

  it('normalizes names and enforces strict, unique mutation payloads', () => {
    expect(normalizeCategoryName('  CÆSAR  ')).toBe('cæsar');
    expect(normalizeTagName('  CĬCERO  ')).toBe('cĭcero');
    expect(createPracticeCategorySchema.parse({ lessonType: 'vocab', name: ' Authors ' }).name).toBe('Authors');
    expect(createPracticeTagSchema.parse({ name: ' Cicero ' }).name).toBe('Cicero');
    expect(updatePracticeCategorySchema.safeParse({ lessonType: 'listening' }).success).toBe(false);
    expect(
      reorderPracticeCategoriesSchema.safeParse({
        lessonType: 'vocab',
        orderedCategoryIds: ['one', 'one'],
      }).success
    ).toBe(false);
    expect(optionalPracticeCategoryIdsSchema.parse([])).toEqual([]);
    expect(
      practiceCategorySelectionsSchema.safeParse([
        { categoryId: 'authors', tagIds: ['cicero'] },
        { categoryId: 'authors', tagIds: [] },
      ]).success
    ).toBe(false);
    expect(replacePracticeMembershipTagsSchema.safeParse({ tagIds: ['cicero', 'cicero'] }).success).toBe(false);
  });

  it('uses deterministic, pair-sensitive membership IDs', () => {
    const first = getPracticeCategoryMembershipId('category-1', 'lesson-1');
    expect(getPracticeCategoryMembershipId('category-1', 'lesson-1')).toBe(first);
    expect(getPracticeCategoryMembershipId('category-1', 'lesson-2')).not.toBe(first);
    expect(getPracticeCategoryMembershipId('category-2', 'lesson-1')).not.toBe(first);
  });
});

describe('practice category reconciliation guards', () => {
  const service = new PracticeCategoryService(fakeDb as never);

  it('rejects future test units before writing even if their type looks eligible', async () => {
    const transaction = makeTransaction();
    await expect(
      service.reconcileLessonCategoriesInTransaction(transaction as never, {
        lessonId: 'lesson-1',
        lesson: { kind: 'test', type: 'vocab' },
        desiredCategoryIds: ['category-1'],
        actorId: 'admin-1',
      })
    ).rejects.toMatchObject<Partial<PracticeCategoryError>>({ code: 'INELIGIBLE_LESSON' });
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it('rejects cross-type and new archived assignments atomically', async () => {
    const crossTypeTransaction = makeTransaction([], {
      'category-1': category({ lessonType: 'listening' }),
    });
    await expect(
      service.reconcileLessonCategoriesInTransaction(crossTypeTransaction as never, {
        lessonId: 'lesson-1',
        lesson: { type: 'vocab' },
        desiredCategoryIds: ['category-1'],
        actorId: 'admin-1',
      })
    ).rejects.toMatchObject<Partial<PracticeCategoryError>>({ code: 'CATEGORY_TYPE_MISMATCH' });
    expect(crossTypeTransaction.create).not.toHaveBeenCalled();

    const archivedTransaction = makeTransaction([], {
      'category-1': category({ status: 'archived' }),
    });
    await expect(
      service.reconcileLessonCategoriesInTransaction(archivedTransaction as never, {
        lessonId: 'lesson-1',
        lesson: { type: 'vocab' },
        desiredCategoryIds: ['category-1'],
        actorId: 'admin-1',
      })
    ).rejects.toMatchObject<Partial<PracticeCategoryError>>({ code: 'CATEGORY_ARCHIVED' });
    expect(archivedTransaction.create).not.toHaveBeenCalled();
  });

  it('keeps existing membership assignment idempotent, including archived retention', async () => {
    const existing = membership();
    const transaction = makeTransaction([existing], {
      'category-1': category({ status: 'archived' }),
    });
    const result = await service.reconcileLessonCategoriesInTransaction(transaction as never, {
      lessonId: 'lesson-1',
      lesson: { type: 'vocab' },
      desiredCategoryIds: ['category-1'],
      actorId: 'admin-1',
    });

    expect(result.practiceCategoryIds).toEqual(['category-1']);
    expect(result.memberships).toEqual([existing]);
    expect(transaction.create).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it('validates tags against their owning category and permits retained archived tags', async () => {
    const archivedTag = tag({
      id: 'tag-old',
      name: 'Old author',
      normalizedName: 'old author',
      status: 'archived',
      tagOrder: 1,
    });
    const existing = membership({ tagIds: [archivedTag.id] });
    const categoryWithTags = category({ tags: [tag(), archivedTag] });

    const foreignTransaction = makeTransaction([existing], {
      'category-1': categoryWithTags,
    });
    await expect(
      service.reconcileLessonCategoriesInTransaction(foreignTransaction as never, {
        lessonId: 'lesson-1',
        lesson: { type: 'vocab' },
        desiredCategorySelections: [{ categoryId: 'category-1', tagIds: ['foreign-tag'] }],
        actorId: 'admin-1',
      })
    ).rejects.toMatchObject<Partial<PracticeCategoryError>>({ code: 'TAG_CATEGORY_MISMATCH' });
    expect(foreignTransaction.update).not.toHaveBeenCalled();

    const retainedTransaction = makeTransaction([existing], {
      'category-1': categoryWithTags,
    });
    const result = await service.reconcileLessonCategoriesInTransaction(retainedTransaction as never, {
      lessonId: 'lesson-1',
      lesson: { type: 'vocab' },
      desiredCategorySelections: [{ categoryId: 'category-1', tagIds: ['tag-cicero', archivedTag.id] }],
      actorId: 'admin-1',
    });

    expect(result.practiceCategorySelections).toEqual([
      { categoryId: 'category-1', tagIds: ['tag-cicero', archivedTag.id] },
    ]);
    expect(retainedTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'membership-1' }),
      expect.objectContaining({ tagIds: ['tag-cicero', archivedTag.id] })
    );

    const archivedAdditionTransaction = makeTransaction([membership()], {
      'category-1': categoryWithTags,
    });
    await expect(
      service.reconcileLessonCategoriesInTransaction(archivedAdditionTransaction as never, {
        lessonId: 'lesson-1',
        lesson: { type: 'vocab' },
        desiredCategorySelections: [{ categoryId: 'category-1', tagIds: [archivedTag.id] }],
        actorId: 'admin-1',
      })
    ).rejects.toMatchObject<Partial<PracticeCategoryError>>({ code: 'TAG_ARCHIVED' });
  });
});

describe('practice category fallback ordering', () => {
  it('keeps records with missing order fields and uses IDs as a stable tie-breaker', async () => {
    const categoryDocs = [
      snapshot('category-b', category({ categoryOrder: undefined })),
      snapshot('category-a', category({ categoryOrder: undefined })),
    ];
    const scopedDb = {
      collection: (name: string) => {
        const query = {
          where: () => query,
          limit: () => query,
          doc: (id: string) => ({ id, collection: name }),
          get: jest.fn(async () => querySnapshot(name === 'practiceCategories' ? categoryDocs : [])),
        };
        return query;
      },
      getAll: jest.fn(async () => []),
    };
    const scopedService = new PracticeCategoryService(scopedDb as never);

    const categories = await scopedService.listCategories({ lessonType: 'vocab', status: 'active' });

    expect(categories.map(item => item.id)).toEqual(['category-a', 'category-b']);
    expect(categories.every(item => item.categoryOrder === Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('skips membership and lesson reads for lightweight category lists', async () => {
    const membershipGet = jest.fn(async () => querySnapshot([]));
    const lessonGetAll = jest.fn(async () => []);
    const scopedDb = {
      collection: (name: string) => {
        const query = {
          where: () => query,
          limit: () => query,
          doc: (id: string) => ({ id, collection: name }),
          get:
            name === 'practiceCategories'
              ? jest.fn(async () => querySnapshot([snapshot('category-1', category())]))
              : membershipGet,
        };
        return query;
      },
      getAll: lessonGetAll,
    };
    const scopedService = new PracticeCategoryService(scopedDb as never);

    const categories = await scopedService.listCategories({
      lessonType: 'vocab',
      status: 'active',
      includeCounts: false,
    });

    expect(categories).toHaveLength(1);
    expect(membershipGet).not.toHaveBeenCalled();
    expect(lessonGetAll).not.toHaveBeenCalled();
  });

  it('batches count membership reads instead of querying once per category', async () => {
    const categoryDocs = Array.from({ length: 31 }, (_, index) =>
      snapshot(`category-${index}`, category({ id: `category-${index}`, categoryOrder: index }))
    );
    const membershipGet = jest.fn(async () => querySnapshot([]));
    const scopedDb = {
      collection: (name: string) => {
        const query = {
          where: () => query,
          doc: (id: string) => ({ id, collection: name }),
          get: name === 'practiceCategories' ? jest.fn(async () => querySnapshot(categoryDocs)) : membershipGet,
        };
        return query;
      },
      getAll: jest.fn(async () => []),
    };
    const scopedService = new PracticeCategoryService(scopedDb as never);

    await scopedService.listCategories({ lessonType: 'vocab', status: 'active', includeCounts: true });

    expect(membershipGet).toHaveBeenCalledTimes(2);
  });

  it('keeps available lessons out of the category detail query', async () => {
    const allTypeLessonsGet = jest.fn(async () => querySnapshot([]));
    const scopedDb = {
      collection: (name: string) => {
        const query = {
          where: () => query,
          doc: (id: string) => ({
            id,
            collection: name,
            get: jest.fn(async () => snapshot(id, name === 'practiceCategories' ? category() : undefined)),
          }),
          get: name === 'practiceCategoryMemberships' ? jest.fn(async () => querySnapshot([])) : allTypeLessonsGet,
        };
        return query;
      },
      getAll: jest.fn(async () => []),
    };
    const scopedService = new PracticeCategoryService(scopedDb as never);

    const detail = await scopedService.getCategoryLessons('category-1');

    expect(detail).not.toHaveProperty('availableLessons');
    expect(allTypeLessonsGet).not.toHaveBeenCalled();
  });
});

describe('practice category scoped mutations', () => {
  type FakeQuery = {
    collection: string;
    filters: Array<{ field: string; value: unknown }>;
    where: (field: string, operator: string, value: unknown) => FakeQuery;
    limit: (value: number) => FakeQuery;
    doc: (id: string) => { id: string; collection: string };
  };

  const collection = (name: string): FakeQuery => {
    const query: FakeQuery = {
      collection: name,
      filters: [],
      where: (field, _operator, value) => {
        query.filters.push({ field, value });
        return query;
      },
      limit: () => query,
      doc: id => ({ id, collection: name }),
    };
    return query;
  };

  it('rejects stale lesson reorder scopes before writing', async () => {
    const update = jest.fn();
    const transaction = {
      get: jest.fn(async (target: { collection?: string; id?: string }) =>
        target.collection === 'practiceCategories'
          ? snapshot('category-1', category())
          : querySnapshot([
              snapshot('membership-1', membership()),
              snapshot('membership-2', membership({ id: 'membership-2', lessonId: 'lesson-2', lessonOrder: 1 })),
            ])
      ),
      update,
    };
    const service = new PracticeCategoryService({
      collection,
      runTransaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction),
    } as never);

    await expect(service.reorderLessons('category-1', ['lesson-1'], 'admin-1')).rejects.toMatchObject<
      Partial<PracticeCategoryError>
    >({ code: 'STALE_LESSON_ORDER' });
    expect(update).not.toHaveBeenCalled();
  });

  it('deletes lesson memberships and compacts every affected category', async () => {
    const targetMembership = membership();
    const remainingMembership = membership({
      id: 'membership-2',
      lessonId: 'lesson-2',
      lessonOrder: 2,
    });
    const remove = jest.fn();
    const update = jest.fn();
    const transaction = {
      get: jest.fn(async (target: { collection?: string; filters?: Array<{ field: string }> }) => {
        if (target.collection === 'lessons') return snapshot('lesson-1', { type: 'vocab' });
        const field = target.filters?.[0]?.field;
        return field === 'lessonId'
          ? querySnapshot([snapshot('membership-1', targetMembership)])
          : querySnapshot([snapshot('membership-1', targetMembership), snapshot('membership-2', remainingMembership)]);
      }),
      delete: remove,
      update,
    };
    const service = new PracticeCategoryService({
      collection,
      runTransaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction),
    } as never);

    await expect(service.deleteLessonWithMemberships('lesson-1', 'admin-1')).resolves.toBe(1);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'membership-2' }),
      expect.objectContaining({ lessonOrder: 0, updatedBy: 'admin-1' })
    );
  });

  it('rejects stale tag reorder scopes and persists complete active tag order', async () => {
    const categoryWithTags = category({
      tags: [tag(), tag({ id: 'tag-virgil', name: 'Virgil', normalizedName: 'virgil', tagOrder: 1 })],
    });
    const update = jest.fn();
    const transaction = {
      get: jest.fn(async (target: { collection?: string }) =>
        target.collection === 'content_sync_locks'
          ? snapshot('prod-content-to-dev')
          : snapshot('category-1', categoryWithTags)
      ),
      update,
    };
    const service = new PracticeCategoryService({
      collection,
      runTransaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction),
    } as never);

    await expect(service.reorderTags('category-1', ['tag-cicero'], 'admin-1')).rejects.toMatchObject<
      Partial<PracticeCategoryError>
    >({ code: 'STALE_TAG_ORDER' });
    expect(update).not.toHaveBeenCalled();

    const reordered = await service.reorderTags('category-1', ['tag-virgil', 'tag-cicero'], 'admin-1');
    expect(reordered.map(item => [item.id, item.tagOrder])).toEqual([
      ['tag-virgil', 0],
      ['tag-cicero', 1],
    ]);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'category-1' }),
      expect.objectContaining({
        tags: expect.arrayContaining([
          expect.objectContaining({ id: 'tag-virgil', tagOrder: 0 }),
          expect.objectContaining({ id: 'tag-cicero', tagOrder: 1 }),
        ]),
      })
    );
  });

  it('compacts active tag order on archive and appends a restored tag', async () => {
    const firstTag = tag();
    const secondTag = tag({
      id: 'tag-virgil',
      name: 'Virgil',
      normalizedName: 'virgil',
      tagOrder: 1,
    });
    const archiveUpdate = jest.fn();
    const archiveTransaction = {
      get: jest.fn(async (target: { collection?: string }) =>
        target.collection === 'content_sync_locks'
          ? snapshot('prod-content-to-dev')
          : snapshot('category-1', category({ tags: [firstTag, secondTag] }))
      ),
      update: archiveUpdate,
    };
    const archiveService = new PracticeCategoryService({
      collection,
      runTransaction: async (callback: (value: typeof archiveTransaction) => unknown) => callback(archiveTransaction),
    } as never);

    await expect(
      archiveService.updateTag('category-1', firstTag.id, { status: 'archived' }, 'admin-1')
    ).resolves.toMatchObject({ id: firstTag.id, status: 'archived' });
    expect(archiveUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'category-1' }),
      expect.objectContaining({
        tags: expect.arrayContaining([
          expect.objectContaining({ id: firstTag.id, status: 'archived' }),
          expect.objectContaining({ id: secondTag.id, status: 'active', tagOrder: 0 }),
        ]),
      })
    );

    const restoreUpdate = jest.fn();
    const restoreTransaction = {
      get: jest.fn(async (target: { collection?: string }) =>
        target.collection === 'content_sync_locks'
          ? snapshot('prod-content-to-dev')
          : snapshot(
              'category-1',
              category({
                tags: [
                  { ...firstTag, status: 'archived' },
                  { ...secondTag, tagOrder: 0 },
                ],
              })
            )
      ),
      update: restoreUpdate,
    };
    const restoreService = new PracticeCategoryService({
      collection,
      runTransaction: async (callback: (value: typeof restoreTransaction) => unknown) => callback(restoreTransaction),
    } as never);

    await expect(
      restoreService.updateTag('category-1', firstTag.id, { status: 'active' }, 'admin-1')
    ).resolves.toMatchObject({ id: firstTag.id, status: 'active', tagOrder: 1 });
  });

  it('prevents deleting an archived tag while a category membership still references it', async () => {
    const archivedTag = tag({ status: 'archived' });
    const update = jest.fn();
    const transaction = {
      get: jest.fn(async (target: { collection?: string; id?: string }) =>
        target.collection === 'practiceCategories'
          ? snapshot('category-1', category({ tags: [archivedTag] }))
          : querySnapshot([snapshot('membership-1', membership({ tagIds: [archivedTag.id] }))])
      ),
      update,
    };
    const service = new PracticeCategoryService({
      collection,
      runTransaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction),
    } as never);

    await expect(service.deleteTag('category-1', archivedTag.id, 'admin-1')).rejects.toMatchObject<
      Partial<PracticeCategoryError>
    >({ code: 'TAG_IN_USE' });
    expect(update).not.toHaveBeenCalled();
  });

  it('replaces membership tags only with tags owned by that category', async () => {
    const categoryWithTags = category({ tags: [tag()] });
    const update = jest.fn();
    const transaction = {
      get: jest.fn(async (target: { collection?: string; id?: string }) =>
        target.collection === 'content_sync_locks'
          ? snapshot('prod-content-to-dev')
          : target.collection === 'practiceCategories'
            ? snapshot('category-1', categoryWithTags)
            : snapshot(target.id ?? 'membership-1', membership())
      ),
      update,
    };
    const service = new PracticeCategoryService({
      collection,
      runTransaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction),
    } as never);

    await expect(
      service.replaceMembershipTags('category-1', 'lesson-1', ['foreign-tag'], 'admin-1')
    ).rejects.toMatchObject<Partial<PracticeCategoryError>>({ code: 'TAG_CATEGORY_MISMATCH' });
    expect(update).not.toHaveBeenCalled();

    await expect(
      service.replaceMembershipTags('category-1', 'lesson-1', ['tag-cicero'], 'admin-1')
    ).resolves.toMatchObject({ tagIds: ['tag-cicero'] });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'practiceCategoryMemberships' }),
      expect.objectContaining({ tagIds: ['tag-cicero'] })
    );
  });
});
