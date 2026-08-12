import {
  LearningPathService,
  LearningPathServiceError,
  assertPlacedLessonReplacementAllowedInTransaction,
  assertPlacedTestRotationAllowedInTransaction,
  assertUnitDeletionAllowedInTransaction,
} from '@/src/lib/learning-units/learning-path-service';
import { learningPathDocumentSchema, saveLearningPathInputSchema } from '@/src/lib/learning-units/schemas';
import { testVersionDocumentSchema } from '@/src/lib/tests/schemas';

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));

type Data = Record<string, unknown>;
type Ref = {
  kind: 'ref';
  collectionName: string;
  id: string;
  get: () => Promise<ReturnType<typeof snapshot>>;
};

const snapshot = (id: string, value: Data | undefined, ref?: Ref) => ({
  id,
  exists: value !== undefined,
  data: () => value,
  ref,
});

class FakeQuery {
  readonly kind = 'query';
  private filters: Array<{ field: string; value: unknown }> = [];
  private orderField?: string;
  private orderDirection: 'asc' | 'desc' = 'asc';
  private limitCount?: number;
  private selectedFields?: string[];

  constructor(
    readonly collectionName: string,
    private readonly records: Record<string, Record<string, Data>>
  ) {}

  where(field: string, _operator: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  select(...fields: string[]) {
    this.selectedFields = fields;
    return this;
  }

  doc(id: string): Ref {
    const ref = {
      kind: 'ref' as const,
      collectionName: this.collectionName,
      id,
      get: async () => snapshot(id, this.records[this.collectionName]?.[id], ref),
    };
    return ref;
  }

  async get() {
    let entries = Object.entries(this.records[this.collectionName] ?? {});
    for (const filter of this.filters) {
      entries = entries.filter(([, value]) => value[filter.field] === filter.value);
    }
    if (this.orderField) {
      const field = this.orderField;
      entries.sort(([, left], [, right]) => {
        const leftValue = left[field];
        const rightValue = right[field];
        const comparison =
          typeof leftValue === 'number' && typeof rightValue === 'number'
            ? leftValue - rightValue
            : String(leftValue ?? '').localeCompare(String(rightValue ?? ''));
        return comparison * (this.orderDirection === 'desc' ? -1 : 1);
      });
    }
    if (this.limitCount !== undefined) entries = entries.slice(0, this.limitCount);
    const docs = entries.map(([id, value]) => {
      const selected = this.selectedFields
        ? Object.fromEntries(
            this.selectedFields.filter(field => value[field] !== undefined).map(field => [field, value[field]])
          )
        : value;
      return snapshot(id, selected, this.doc(id));
    });
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeFirestore {
  readonly writes: Array<{ ref: Ref; value: Data }> = [];

  constructor(readonly records: Record<string, Record<string, Data>>) {}

  collection = (name: string) => new FakeQuery(name, this.records);

  transaction = {
    get: async (target: Ref | FakeQuery) => (target.kind === 'ref' ? target.get() : target.get()),
    getAll: async (...refs: Ref[]) => {
      if (refs.length === 0) throw new Error('Firestore getAll requires at least one document reference');
      return Promise.all(refs.map(ref => ref.get()));
    },
    set: (ref: Ref, value: Data) => {
      this.writes.push({ ref, value });
      this.records[ref.collectionName] ??= {};
      this.records[ref.collectionName][ref.id] = value;
    },
  };

  runTransaction = <T>(callback: (transaction: typeof this.transaction) => Promise<T>): Promise<T> =>
    callback(this.transaction);
}

const lesson = (overrides: Data = {}): Data => ({
  kind: 'lesson',
  title: 'Lesson',
  description: '',
  type: 'normal',
  pages: [{ id: 'page-1', items: [] }],
  isLive: true,
  liveOrder: 0,
  publishedAt: 'now',
  publishedBy: 'admin',
  ...overrides,
});

const path = (overrides: Data = {}): Data => ({
  revision: 2,
  unitIds: ['normal-1'],
  updatedAt: 'now',
  updatedBy: 'admin',
  ...overrides,
});

const readableLegacyInvalidVersion = {
  name: 'Legacy version',
  pages: [{ id: 'page-1', items: [{ id: 'question-1', type: 'multiple-choice', maxPoints: 1 }] }],
  totalPages: 1,
  totalItems: 1,
  totalExercises: 1,
  totalPoints: 1,
};

describe('Learning Path schemas', () => {
  it('requires unique bounded IDs and rejects unknown path fields', () => {
    expect(
      saveLearningPathInputSchema.safeParse({
        expectedRevision: 0,
        unitIds: ['one', 'one'],
      }).success
    ).toBe(false);
    expect(
      learningPathDocumentSchema.safeParse({
        id: 'default',
        ...path({ legacyField: true }),
      }).success
    ).toBe(false);
    expect(
      saveLearningPathInputSchema.safeParse({
        expectedRevision: 0,
        unitIds: Array.from({ length: 600 }, (_, index) => `${index}-${'x'.repeat(1300)}`),
      }).success
    ).toBe(false);
  });
});

describe('LearningPathService', () => {
  it('uses the canonical aggregate for admin projections', async () => {
    const db = new FakeFirestore({
      lessons: {
        'normal-2': lesson({ liveOrder: 2 }),
        practice: lesson({ type: 'vocab', liveOrder: 1 }),
        'normal-1': lesson({ liveOrder: 0 }),
        test: {
          kind: 'test',
          title: 'Test',
          description: '',
          isLive: true,
          liveOrder: 3,
        },
      },
      learningPaths: {},
    });
    const service = new LearningPathService(db as never);

    await expect(service.getAdminView()).resolves.toEqual({
      path: null,
      effectiveUnitIds: [],
      source: 'learning-path',
      canEdit: false,
      editBlockedReason: 'The Learning Path is not available.',
    });

    db.records.learningPaths.default = path({
      unitIds: ['normal-2', 'normal-1'],
    });
    await expect(service.getAdminView()).resolves.toMatchObject({
      effectiveUnitIds: ['normal-2', 'normal-1'],
      source: 'learning-path',
      canEdit: true,
    });
  });

  it('atomically replaces the complete sequence and increments the expected revision', async () => {
    const db = new FakeFirestore({
      lessons: {
        'normal-1': lesson(),
        'normal-2': lesson({ isLive: false, liveOrder: null }),
      },
      learningPaths: { default: path() },
    });
    const service = new LearningPathService(db as never);

    const saved = await service.save({ expectedRevision: 2, unitIds: ['normal-2', 'normal-1'] }, 'admin-2');

    expect(saved).toMatchObject({
      id: 'default',
      revision: 3,
      unitIds: ['normal-2', 'normal-1'],
      updatedBy: 'admin-2',
    });
    expect(db.writes).toHaveLength(1);
    expect(db.records.learningPaths.default).toEqual(saved);
  });

  it('validates active ownership even when saving an empty Learning Path', async () => {
    const db = new FakeFirestore({
      lessons: {
        corrupt: { kind: 'test', title: 'Corrupt test owner' },
      },
      learningPaths: { default: path() },
      mockTests: {},
      testVersions: {},
    });
    const service = new LearningPathService(db as never, true);

    await expect(service.save({ expectedRevision: 2, unitIds: [] }, 'admin')).rejects.toMatchObject({
      code: 'INELIGIBLE_LEARNING_UNIT',
    });
    expect(db.writes).toHaveLength(0);
  });

  it('persists an empty Learning Path without calling getAll with no references', async () => {
    const db = new FakeFirestore({
      lessons: {},
      learningPaths: { default: path() },
      mockTests: {},
      testVersions: {},
    });
    const service = new LearningPathService(db as never, true);

    await expect(service.save({ expectedRevision: 2, unitIds: [] }, 'admin')).resolves.toMatchObject({
      revision: 3,
      unitIds: [],
      updatedBy: 'admin',
    });
    expect(db.writes).toHaveLength(1);
  });

  it.each([
    {
      name: 'stale revision',
      records: {
        lessons: { 'normal-1': lesson() },
        learningPaths: { default: path() },
      },
      input: { expectedRevision: 1, unitIds: ['normal-1'] },
      code: 'STALE_LEARNING_PATH_REVISION',
    },
    {
      name: 'unknown ID',
      records: {
        lessons: { 'normal-1': lesson() },
        learningPaths: { default: path() },
      },
      input: { expectedRevision: 2, unitIds: ['missing'] },
      code: 'UNKNOWN_LEARNING_UNIT',
    },
    {
      name: 'practice lesson',
      records: {
        lessons: { practice: lesson({ type: 'listening' }) },
        learningPaths: { default: path() },
      },
      input: { expectedRevision: 2, unitIds: ['practice'] },
      code: 'INELIGIBLE_LEARNING_UNIT',
    },
    {
      name: 'incomplete normal lesson',
      records: {
        lessons: {
          incomplete: lesson({ isLive: false, liveOrder: null, pages: [] }),
        },
        learningPaths: { default: path() },
      },
      input: { expectedRevision: 2, unitIds: ['incomplete'] },
      code: 'INELIGIBLE_LEARNING_UNIT',
    },
    {
      name: 'test before Phase 6',
      records: {
        lessons: {
          test: {
            kind: 'test',
            title: 'Test',
            description: '',
            rotationVersions: [{ versionId: 'version-1' }],
            passingPercentage: null,
          },
        },
        learningPaths: { default: path() },
      },
      input: { expectedRevision: 2, unitIds: ['test'] },
      code: 'INELIGIBLE_LEARNING_UNIT',
    },
  ])('rejects $name without writes', async ({ records, input, code }) => {
    const db = new FakeFirestore(records as unknown as Record<string, Record<string, Data>>);
    const service = new LearningPathService(db as never);

    await expect(service.save(input, 'admin')).rejects.toMatchObject({ code });
    expect(db.writes).toHaveLength(0);
  });

  it('guards deletion whenever the canonical path contains the unit', async () => {
    const db = new FakeFirestore({
      lessons: {},
      learningPaths: {
        default: path({ unitIds: ['normal-1'] }),
      },
    });

    await expect(
      assertUnitDeletionAllowedInTransaction(db.transaction as never, db as never, 'normal-1')
    ).rejects.toMatchObject<Partial<LearningPathServiceError>>({
      code: 'PLACED_UNIT_DELETE',
    });

    delete db.records.learningPaths.default;
    await expect(
      assertUnitDeletionAllowedInTransaction(db.transaction as never, db as never, 'normal-1')
    ).resolves.toBeUndefined();
  });

  it('prevents an active placed lesson from being edited into an incomplete state', async () => {
    const db = new FakeFirestore({
      lessons: {},
      learningPaths: {
        default: path({ unitIds: ['normal-1'] }),
      },
    });

    await expect(
      assertPlacedLessonReplacementAllowedInTransaction(db.transaction as never, db as never, 'normal-1', {
        type: 'normal',
        pages: [],
      })
    ).rejects.toMatchObject({ code: 'PLACED_UNIT_INVALID' });

    await expect(
      assertPlacedLessonReplacementAllowedInTransaction(db.transaction as never, db as never, 'unplaced', {
        type: 'normal',
        pages: [],
      })
    ).resolves.toBeUndefined();

    await expect(
      assertPlacedLessonReplacementAllowedInTransaction(db.transaction as never, db as never, 'normal-1', {
        type: 'vocab',
        pages: [{ id: 'page-1', items: [] }],
      })
    ).rejects.toMatchObject({ code: 'PLACED_UNIT_INVALID' });
  });

  it('guards version-ownership changes that would invalidate a placed test', async () => {
    const db = new FakeFirestore({
      learningPaths: { default: path({ unitIds: ['test'] }) },
      testVersions: {
        version: {
          name: 'Version A',
          pages: [
            {
              id: 'page-1',
              items: [
                {
                  id: 'fill-1',
                  type: 'fill',
                  title: 'Fill',
                  instructions: '',
                  maxPoints: 1,
                  feedbackConfig: { escalationLevels: [] },
                  data: { items: [{ text: 'Question', answer: 'Answer' }] },
                },
              ],
            },
          ],
          totalPages: 1,
          totalItems: 1,
          totalExercises: 1,
          totalPoints: 1,
        },
      },
    });

    await expect(
      assertPlacedTestRotationAllowedInTransaction(db.transaction as never, db as never, 'test', [])
    ).rejects.toMatchObject({ code: 'PLACED_UNIT_INVALID' });

    await expect(
      assertPlacedTestRotationAllowedInTransaction(db.transaction as never, db as never, 'test', [
        { versionId: 'version' },
      ])
    ).resolves.toBeUndefined();

    await expect(
      assertPlacedTestRotationAllowedInTransaction(db.transaction as never, db as never, 'unplaced-test', [])
    ).resolves.toBeUndefined();

    db.records.testVersions.version = readableLegacyInvalidVersion;
    expect(testVersionDocumentSchema.safeParse({ id: 'version', ...readableLegacyInvalidVersion }).success).toBe(true);
    await expect(
      assertPlacedTestRotationAllowedInTransaction(db.transaction as never, db as never, 'test', [
        { versionId: 'version' },
      ])
    ).rejects.toMatchObject({ code: 'PLACED_UNIT_INVALID' });
    expect(db.writes).toHaveLength(0);
  });

  it('does not newly place a test backed by a readable legacy-invalid version', async () => {
    const originalPath = path({ unitIds: [] });
    const db = new FakeFirestore({
      lessons: {
        test: {
          kind: 'test',
          title: 'Test',
          description: '',
          rotationVersions: [{ versionId: 'version-1' }],
          passingPercentage: null,
        },
      },
      learningPaths: { default: originalPath },
      testVersions: { 'version-1': readableLegacyInvalidVersion },
      mockTests: {},
    });
    const service = new LearningPathService(db as never);

    expect(testVersionDocumentSchema.safeParse({ id: 'version-1', ...readableLegacyInvalidVersion }).success).toBe(
      true
    );
    await expect(service.save({ expectedRevision: 2, unitIds: ['test'] }, 'admin')).rejects.toMatchObject({
      code: 'INELIGIBLE_LEARNING_UNIT',
    });
    expect(db.writes).toHaveLength(0);
    expect(db.records.learningPaths.default).toEqual(originalPath);
  });

  it('validates every referenced version for mixed test placement', async () => {
    const testUnit = {
      kind: 'test',
      title: 'Test',
      description: '',
      rotationVersions: [{ versionId: 'version-1' }],
      passingPercentage: null,
    };
    const db = new FakeFirestore({
      lessons: { test: testUnit },
      learningPaths: { default: path() },
      testVersions: {},
    });
    const service = new LearningPathService(db as never);

    await expect(service.save({ expectedRevision: 2, unitIds: ['test'] }, 'admin')).rejects.toMatchObject({
      code: 'INELIGIBLE_LEARNING_UNIT',
    });
    expect(db.writes).toHaveLength(0);

    db.records.testVersions['version-1'] = {
      name: 'Version A',
      pages: [
        {
          id: 'page-1',
          items: [
            {
              id: 'fill-1',
              type: 'fill',
              title: 'Fill',
              instructions: '',
              maxPoints: 1,
              feedbackConfig: { escalationLevels: [] },
              data: { items: [{ text: 'Question', answer: 'Answer' }] },
            },
          ],
        },
      ],
      totalPages: 1,
      totalItems: 1,
      totalExercises: 1,
      totalPoints: 1,
      createdAt: 'now',
      createdBy: 'admin',
      updatedAt: 'now',
      updatedBy: 'admin',
    };
    await expect(service.save({ expectedRevision: 2, unitIds: ['test'] }, 'admin')).resolves.toMatchObject({
      unitIds: ['test'],
      revision: 3,
    });
  });
});
