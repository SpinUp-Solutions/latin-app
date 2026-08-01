import {
  LearningPathService,
  LearningPathServiceError,
  assertLearningPathProjectionParity,
  assertLegacyNormalPlacementChangeAllowedInTransaction,
  assertPlacedLessonReplacementAllowedInTransaction,
  assertPlacedTestRotationAllowedInTransaction,
  assertLegacyNormalPlacementAllowedInTransaction,
  assertUnitDeletionAllowedInTransaction,
  hashLearningPathMigrationSource,
} from '@/src/lib/learning-units/learning-path-service';
import {
  learningPathDocumentSchema,
  learningPathMigrationManifestSchema,
  saveLearningPathInputSchema,
} from '@/src/lib/learning-units/schemas';

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
  private selectedFields?: string[];

  constructor(
    readonly collectionName: string,
    private readonly records: Record<string, Record<string, Data>>
  ) {}

  where(field: string, _operator: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  orderBy(field: string) {
    this.orderField = field;
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
      entries.sort(
        ([, left], [, right]) =>
          Number(left[field] ?? Number.MAX_SAFE_INTEGER) - Number(right[field] ?? Number.MAX_SAFE_INTEGER)
      );
    }
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

class ConflictAwareFirestore {
  readonly writes: Array<{ ref: Ref; value: Data }> = [];
  private readonly documentVersions = new Map<string, number>();
  private readonly collectionVersions = new Map<string, number>();

  constructor(readonly records: Record<string, Record<string, Data>>) {}

  collection = (name: string) => new FakeQuery(name, this.records);

  private documentKey(ref: Ref) {
    return `${ref.collectionName}/${ref.id}`;
  }

  async runTransaction<T>(
    callback: (transaction: {
      get: (target: Ref | FakeQuery) => Promise<unknown>;
      getAll: (...refs: Ref[]) => Promise<unknown[]>;
      set: (ref: Ref, value: Data) => void;
    }) => Promise<T>
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const documentReads = new Map<string, number>();
      const collectionReads = new Map<string, number>();
      const pendingWrites: Array<{ ref: Ref; value: Data }> = [];
      const readRef = async (ref: Ref) => {
        const key = this.documentKey(ref);
        documentReads.set(key, this.documentVersions.get(key) ?? 0);
        return ref.get();
      };
      const transaction = {
        get: async (target: Ref | FakeQuery) => {
          if (target.kind === 'ref') return readRef(target);
          collectionReads.set(target.collectionName, this.collectionVersions.get(target.collectionName) ?? 0);
          return target.get();
        },
        getAll: async (...refs: Ref[]) => Promise.all(refs.map(readRef)),
        set: (ref: Ref, value: Data) => {
          pendingWrites.push({ ref, value });
        },
      };

      const result = await callback(transaction);
      const hasConflict =
        [...documentReads].some(([key, version]) => (this.documentVersions.get(key) ?? 0) !== version) ||
        [...collectionReads].some(([name, version]) => (this.collectionVersions.get(name) ?? 0) !== version);
      if (hasConflict) continue;

      for (const write of pendingWrites) {
        const key = this.documentKey(write.ref);
        this.records[write.ref.collectionName] ??= {};
        this.records[write.ref.collectionName][write.ref.id] = write.value;
        this.documentVersions.set(key, (this.documentVersions.get(key) ?? 0) + 1);
        this.collectionVersions.set(
          write.ref.collectionName,
          (this.collectionVersions.get(write.ref.collectionName) ?? 0) + 1
        );
        this.writes.push(write);
      }
      return result;
    }
    throw new Error('Transaction exceeded retry limit');
  }
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

const activeCutover = {
  state: 'active',
  migrationId: 'migration-1',
  sourceHash: 'a'.repeat(64),
  appliedAt: 'now',
  appliedBy: 'admin',
};

describe('Learning Path schemas', () => {
  it('requires unique bounded IDs and a source-consistent migration manifest', () => {
    expect(
      saveLearningPathInputSchema.safeParse({
        expectedRevision: 0,
        unitIds: ['one', 'one'],
      }).success
    ).toBe(false);
    expect(
      learningPathMigrationManifestSchema.safeParse({
        migrationId: 'migration-1',
        createdAt: 'now',
        sourceHash: 'a'.repeat(64),
        unitIds: ['two', 'one'],
        source: [
          { unitId: 'one', liveOrder: 0 },
          { unitId: 'two', liveOrder: 1 },
        ],
      }).success
    ).toBe(false);
    expect(
      learningPathDocumentSchema.safeParse({
        id: 'default',
        ...path({
          cutover: {
            ...activeCutover,
            state: 'inactive',
          },
        }),
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

describe('LearningPathService Phase 5B', () => {
  it('uses legacy order while absent/inactive and the aggregate while active', async () => {
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
      effectiveUnitIds: ['normal-1', 'normal-2'],
      source: 'legacy',
      canEdit: false,
      editBlockedReason: 'The Learning Path has not been initialized. Complete the migration workflow first.',
    });

    db.records.learningPaths.default = path({
      unitIds: ['normal-2', 'normal-1'],
      cutover: activeCutover,
    });
    await expect(service.getAdminView()).resolves.toMatchObject({
      effectiveUnitIds: ['normal-2', 'normal-1'],
      source: 'learning-path',
      canEdit: false,
    });
    db.records.lessons['normal-1'].liveOrder = null;
    await expect(service.getAdminView()).resolves.toMatchObject({
      effectiveUnitIds: ['normal-2', 'normal-1'],
      source: 'learning-path',
    });

    db.records.learningPaths.default = path({ unitIds: ['normal-2', 'normal-1'] });
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
    {
      name: 'migration freeze',
      records: {
        lessons: { 'normal-1': lesson() },
        learningPaths: { default: path({ cutover: activeCutover }) },
      },
      input: { expectedRevision: 2, unitIds: ['normal-1'] },
      code: 'LEARNING_PATH_FROZEN',
    },
  ])('rejects $name without writes', async ({ records, input, code }) => {
    const db = new FakeFirestore(records as unknown as Record<string, Record<string, Data>>);
    const service = new LearningPathService(db as never);

    await expect(service.save(input, 'admin')).rejects.toMatchObject({ code });
    expect(db.writes).toHaveLength(0);
  });

  it('guards deletion only while the path is active', async () => {
    const db = new FakeFirestore({
      lessons: {},
      learningPaths: {
        default: path({ unitIds: ['normal-1'], cutover: activeCutover }),
      },
    });

    await expect(
      assertUnitDeletionAllowedInTransaction(db.transaction as never, db as never, 'normal-1')
    ).rejects.toMatchObject<Partial<LearningPathServiceError>>({
      code: 'PLACED_UNIT_DELETE',
    });

    db.records.learningPaths.default = path({
      unitIds: ['normal-1'],
      cutover: {
        ...activeCutover,
        state: 'inactive',
        rolledBackAt: 'later',
        rolledBackBy: 'admin',
      },
    });
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

describe('LearningPathService Phase 5C migration lifecycle', () => {
  it('builds a deterministic reviewed manifest from an un-ordered full live read', async () => {
    const db = new FakeFirestore({
      lessons: {
        second: lesson({ liveOrder: 4 }),
        practice: lesson({ type: 'vocab', liveOrder: null }),
        first: lesson({ liveOrder: 1 }),
        draft: lesson({ isLive: false, liveOrder: null }),
      },
      learningPaths: {},
    });
    const service = new LearningPathService(db as never, false, () => 'manifest-time');

    const manifest = await service.buildMigrationManifest('migration-1');

    expect(manifest).toEqual({
      migrationId: 'migration-1',
      createdAt: 'manifest-time',
      sourceHash: hashLearningPathMigrationSource([
        { unitId: 'first', liveOrder: 1 },
        { unitId: 'second', liveOrder: 4 },
      ]),
      unitIds: ['first', 'second'],
      source: [
        { unitId: 'first', liveOrder: 1 },
        { unitId: 'second', liveOrder: 4 },
      ],
    });
    expect(db.writes).toHaveLength(0);
  });

  it.each([
    {
      name: 'missing order',
      lessons: {
        first: lesson({ liveOrder: null }),
      },
      code: 'INVALID_LEGACY_NORMAL_ORDER',
    },
    {
      name: 'duplicate order',
      lessons: {
        first: lesson({ liveOrder: 1 }),
        second: lesson({ liveOrder: 1 }),
      },
      code: 'INVALID_LEGACY_NORMAL_ORDER',
    },
    {
      name: 'unexpected live test',
      lessons: {
        first: lesson({ liveOrder: 1 }),
        test: {
          kind: 'test',
          isLive: true,
          liveOrder: 2,
        },
      },
      code: 'PHASE5_TEST_PRESENT',
    },
  ])('fails dry run on $name without writes', async ({ lessons, code }) => {
    const db = new FakeFirestore({
      lessons,
      learningPaths: {},
    } as unknown as Record<string, Record<string, Data>>);
    const service = new LearningPathService(db as never);

    await expect(service.buildMigrationManifest('migration-1')).rejects.toMatchObject({
      code,
    });
    expect(db.writes).toHaveLength(0);
  });

  it('applies idempotently, verifies, rolls back without lesson writes, reapplies, and retires', async () => {
    let clock = 0;
    const db = new FakeFirestore({
      lessons: {
        first: lesson({ liveOrder: 0 }),
        second: lesson({ liveOrder: 1 }),
        practice: lesson({ type: 'listening', liveOrder: 0 }),
      },
      learningPaths: {},
      testVersions: {},
    });
    const service = new LearningPathService(db as never, false, () => `time-${++clock}`);
    const manifest = await service.buildMigrationManifest('migration-1');
    const lessonsBefore = JSON.parse(JSON.stringify(db.records.lessons));

    const firstApply = await service.applyMigration(manifest, 'admin-1');
    expect(firstApply).toMatchObject({
      applied: true,
      path: {
        revision: 1,
        unitIds: ['first', 'second'],
        cutover: { state: 'active', migrationId: 'migration-1' },
      },
    });
    expect(db.writes).toHaveLength(1);

    const retry = await service.applyMigration(manifest, 'admin-1');
    expect(retry.applied).toBe(false);
    expect(db.writes).toHaveLength(1);
    await expect(service.verifyMigration(manifest)).resolves.toMatchObject({
      verified: true,
      path: { revision: 1 },
    });

    const rolledBack = await service.rollbackMigration('admin-2');
    expect(rolledBack).toMatchObject({
      revision: 1,
      cutover: {
        state: 'inactive',
        rolledBackBy: 'admin-2',
      },
    });
    expect(db.records.lessons).toEqual(lessonsBefore);
    expect(db.writes.every(write => write.ref.collectionName === 'learningPaths')).toBe(true);

    const reapplied = await service.applyMigration(manifest, 'admin-3');
    expect(reapplied.path).toMatchObject({
      revision: 2,
      cutover: { state: 'active', appliedBy: 'admin-3' },
    });

    const retired = await service.retireMigration('admin-4');
    expect(retired).toMatchObject({
      revision: 2,
      unitIds: ['first', 'second'],
      updatedBy: 'admin-4',
    });
    expect(retired).not.toHaveProperty('cutover');
    await expect(service.rollbackMigration('admin-5')).rejects.toMatchObject({
      code: 'ROLLBACK_UNAVAILABLE',
    });

    await expect(service.save({ expectedRevision: 2, unitIds: ['second', 'first'] }, 'admin-5')).resolves.toMatchObject(
      {
        revision: 3,
        unitIds: ['second', 'first'],
      }
    );
    expect(db.records.lessons).toEqual(lessonsBefore);
  });

  it('rejects a changed source and a conflicting active manifest without writes', async () => {
    const db = new FakeFirestore({
      lessons: {
        first: lesson({ liveOrder: 0 }),
        second: lesson({ liveOrder: 1 }),
      },
      learningPaths: {},
    });
    const service = new LearningPathService(db as never, false, () => 'now');
    const manifest = await service.buildMigrationManifest('migration-1');
    db.records.lessons.second.liveOrder = 2;

    await expect(service.applyMigration(manifest, 'admin')).rejects.toMatchObject({
      code: 'MIGRATION_SOURCE_CHANGED',
    });
    expect(db.writes).toHaveLength(0);

    db.records.lessons.second.liveOrder = 1;
    await service.applyMigration(manifest, 'admin');
    const conflicting = { ...manifest, migrationId: 'migration-2' };
    await expect(service.applyMigration(conflicting, 'admin')).rejects.toMatchObject({
      code: 'MIGRATION_CONFLICT',
    });
    expect(db.writes).toHaveLength(1);
  });

  it('binds the reviewed source records to their hash and uses portable ID ordering', async () => {
    const db = new FakeFirestore({
      lessons: {
        alpha: lesson({ liveOrder: 0 }),
        beta: lesson({ liveOrder: 1 }),
      },
      learningPaths: {},
    });
    const service = new LearningPathService(db as never, false, () => 'now');
    const manifest = await service.buildMigrationManifest('migration-1');
    const tamperedManifest = {
      ...manifest,
      source: [
        { unitId: 'alpha', liveOrder: 10 },
        { unitId: 'beta', liveOrder: 11 },
      ],
    };

    await expect(service.applyMigration(tamperedManifest, 'admin')).rejects.toMatchObject({
      code: 'MIGRATION_SOURCE_CHANGED',
    });
    expect(db.writes).toHaveLength(0);

    const localeCompare = jest.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
      throw new Error('locale-dependent ordering must not be used');
    });
    expect(
      hashLearningPathMigrationSource([
        { unitId: 'βeta', liveOrder: 1 },
        { unitId: 'Alpha', liveOrder: 0 },
      ])
    ).toMatch(/^[a-f0-9]{64}$/);
    localeCompare.mockRestore();
  });

  it('allows legacy normal mutations only before cutover or after rollback', async () => {
    const db = new FakeFirestore({
      lessons: {},
      learningPaths: {},
    });

    await expect(
      assertLegacyNormalPlacementAllowedInTransaction(db.transaction as never, db as never)
    ).resolves.toBeUndefined();

    db.records.learningPaths.default = path({ cutover: activeCutover });
    await expect(
      assertLegacyNormalPlacementAllowedInTransaction(db.transaction as never, db as never)
    ).rejects.toMatchObject({ code: 'LEGACY_NORMAL_PLACEMENT_RETIRED' });

    db.records.learningPaths.default = path({
      cutover: {
        ...activeCutover,
        state: 'inactive',
        rolledBackAt: 'later',
        rolledBackBy: 'admin',
      },
    });
    await expect(
      assertLegacyNormalPlacementAllowedInTransaction(db.transaction as never, db as never)
    ).resolves.toBeUndefined();

    db.records.learningPaths.default = path();
    await expect(
      assertLegacyNormalPlacementAllowedInTransaction(db.transaction as never, db as never)
    ).rejects.toMatchObject({ code: 'LEGACY_NORMAL_PLACEMENT_RETIRED' });
  });

  it('serializes an in-flight legacy reorder against cutover and retries it closed', async () => {
    const db = new ConflictAwareFirestore({
      lessons: {
        first: lesson({ liveOrder: 0 }),
      },
      learningPaths: {},
    });
    const service = new LearningPathService(db as never, false, () => 'now');
    const manifest = await service.buildMigrationManifest('migration-1');
    const lessonRef = db.collection('lessons').doc('first');
    let releaseFirstAttempt!: () => void;
    let markFirstReadComplete!: () => void;
    const firstReadComplete = new Promise<void>(resolve => {
      markFirstReadComplete = resolve;
    });
    const release = new Promise<void>(resolve => {
      releaseFirstAttempt = resolve;
    });
    let legacyAttempts = 0;

    const legacyMutation = db.runTransaction(async transaction => {
      legacyAttempts += 1;
      await assertLegacyNormalPlacementAllowedInTransaction(transaction as never, db as never);
      if (legacyAttempts === 1) {
        markFirstReadComplete();
        await release;
      }
      transaction.set(lessonRef, lesson({ liveOrder: 1 }));
    });

    await firstReadComplete;
    await expect(service.applyMigration(manifest, 'admin')).resolves.toMatchObject({
      applied: true,
    });
    releaseFirstAttempt();

    await expect(legacyMutation).rejects.toMatchObject({
      code: 'LEGACY_NORMAL_PLACEMENT_RETIRED',
    });
    expect(legacyAttempts).toBe(2);
    expect(db.records.lessons.first.liveOrder).toBe(0);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].ref.collectionName).toBe('learningPaths');
  });

  it('guards only changes that can alter legacy normal placement state', async () => {
    const db = new FakeFirestore({
      lessons: {},
      learningPaths: { default: path({ cutover: activeCutover }) },
    });

    await expect(
      assertLegacyNormalPlacementChangeAllowedInTransaction(
        db.transaction as never,
        db as never,
        {
          type: 'normal',
          isLive: true,
          liveOrder: 0,
          publishedAt: 'now',
          publishedBy: 'admin',
        },
        {
          type: 'normal',
          isLive: true,
          liveOrder: 1,
          publishedAt: 'now',
          publishedBy: 'admin',
        }
      )
    ).rejects.toMatchObject({ code: 'LEGACY_NORMAL_PLACEMENT_RETIRED' });

    await expect(
      assertLegacyNormalPlacementChangeAllowedInTransaction(
        db.transaction as never,
        db as never,
        { type: 'normal', isLive: false, liveOrder: null },
        { type: 'vocab', isLive: false, liveOrder: null }
      )
    ).resolves.toBeUndefined();
  });

  it('rejects any admin or student projection mismatch', () => {
    expect(() => assertLearningPathProjectionParity(['first', 'second'], ['first', 'second'], ['first'])).toThrow(
      expect.objectContaining<Partial<LearningPathServiceError>>({
        code: 'VERIFICATION_FAILED',
      })
    );
    expect(() =>
      assertLearningPathProjectionParity(['first', 'second'], ['second', 'first'], ['first', 'second'])
    ).toThrow(
      expect.objectContaining<Partial<LearningPathServiceError>>({
        code: 'VERIFICATION_FAILED',
      })
    );
  });

  it('rejects rollback and retirement if a test has entered the Phase 5 path', async () => {
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
      learningPaths: {
        default: path({ unitIds: ['test'], cutover: activeCutover }),
      },
    });
    const service = new LearningPathService(db as never);

    await expect(service.rollbackMigration('admin')).rejects.toMatchObject({
      code: 'PHASE5_TEST_PRESENT',
    });
    await expect(service.retireMigration('admin')).rejects.toMatchObject({
      code: 'PHASE5_TEST_PRESENT',
    });
    db.records.learningPaths.default = path({
      unitIds: ['test'],
      cutover: {
        ...activeCutover,
        state: 'inactive',
        rolledBackAt: 'later',
        rolledBackBy: 'admin',
      },
    });
    await expect(service.rollbackMigration('admin')).rejects.toMatchObject({
      code: 'PHASE5_TEST_PRESENT',
    });
    expect(db.writes).toHaveLength(0);
  });
});
