import {
  StudentDashboardService,
  StudentDashboardServiceError,
} from '@/src/lib/learning-units/student-dashboard-service';
import type { StudentLessonSummary } from '@/src/types/lesson';

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/tests/attempt-service', () => ({
  testAttemptService: { getAttemptSummary: jest.fn() },
}));
jest.mock('@/src/lib/tests/mock-service', () => ({
  mockTestService: {
    listStudentLiveMocks: jest.fn(async () => []),
    listPastStudentMockResults: jest.fn(async () => []),
    getRelatedLiveMocks: jest.fn(),
  },
}));

type RecordData = Record<string, unknown>;

const snapshot = (id: string, value?: RecordData, ref?: unknown) => ({
  id,
  exists: value !== undefined,
  data: () => value,
  ref: ref ?? { id },
});

class FakeQuery {
  private filters: Array<{ field: string; value: unknown }> = [];
  private orderField?: string;
  private selectedFields?: string[];

  constructor(
    private readonly collectionName: string,
    private readonly collections: Record<string, Record<string, RecordData>>,
    private readonly selectedFieldLog: string[][]
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
    this.selectedFieldLog.push(fields);
    return this;
  }

  doc(id: string) {
    const ref = {
      id,
      get: async () => snapshot(id, this.collections[this.collectionName]?.[id], ref),
    };
    return ref;
  }

  async get() {
    let entries = Object.entries(this.collections[this.collectionName] ?? {});
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
      const selectedValue = this.selectedFields
        ? Object.fromEntries(
            this.selectedFields.filter(field => value[field] !== undefined).map(field => [field, value[field]])
          )
        : value;
      return snapshot(id, selectedValue, {
        id,
        get: async () => snapshot(id, value),
      });
    });
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

const createFakeDb = (collections: Record<string, Record<string, RecordData>>) => {
  const selectedFieldLog: string[][] = [];
  return {
    db: {
      collection: (name: string) => new FakeQuery(name, collections, selectedFieldLog),
      getAll: async (
        ...inputs: Array<{ get?: () => Promise<ReturnType<typeof snapshot>> } | { fieldMask: string[] }>
      ) => {
        const options = inputs.at(-1);
        const fieldMask =
          options && 'fieldMask' in options && Array.isArray(options.fieldMask) ? options.fieldMask : undefined;
        const refs = (fieldMask ? inputs.slice(0, -1) : inputs) as Array<{
          get: () => Promise<ReturnType<typeof snapshot>>;
        }>;
        if (fieldMask) selectedFieldLog.push(fieldMask);
        return Promise.all(
          refs.map(async ref => {
            const full = await ref.get();
            const value = full.data();
            if (!fieldMask || !value) return full;
            return snapshot(
              full.id,
              Object.fromEntries(
                fieldMask.filter(field => value[field] !== undefined).map(field => [field, value[field]])
              ),
              full.ref
            );
          })
        );
      },
    },
    selectedFieldLog,
  };
};

const lesson = (overrides: RecordData): RecordData => ({
  kind: 'lesson',
  title: 'Lesson',
  description: '',
  type: 'normal',
  pages: [{ id: 'page-1', items: [] }],
  totalPages: 1,
  totalItems: 0,
  totalExercises: 0,
  isLive: true,
  liveOrder: 0,
  publishedAt: '2026-07-01T00:00:00.000Z',
  publishedBy: 'admin',
  ...overrides,
});

describe('StudentDashboardService summary projection', () => {
  it('preserves normal/practice ordering and returns no page bodies', async () => {
    const collections = {
      lessons: {
        'normal-3': lesson({ title: 'Normal 3', liveOrder: 30, totalPages: 4 }),
        'normal-2': lesson({ title: 'Normal 2', liveOrder: 20, totalPages: 3 }),
        'vocab-1': lesson({ title: 'Vocab', type: 'vocab', liveOrder: 1 }),
        listening: lesson({ title: 'Listening', type: 'listening', liveOrder: 3 }),
        'normal-1': lesson({
          title: 'Normal 1',
          liveOrder: 5,
          pages: [
            { id: 'normal-1-page-1', items: [] },
            { id: 'normal-1-page-2', items: [] },
          ],
          totalPages: undefined,
          totalItems: undefined,
          totalExercises: undefined,
        }),
        'diagram-1': lesson({
          title: 'Diagram',
          type: 'sentence-diagramming',
          liveOrder: 0,
        }),
        'test-1': {
          kind: 'test',
          title: 'Hidden test',
          description: '',
          isLive: true,
          liveOrder: 2,
        },
        draft: lesson({ title: 'Draft', isLive: false, liveOrder: null }),
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['normal-1', 'normal-2', 'normal-3'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        'user_normal-1': {
          userId: 'user',
          lessonId: 'normal-1',
          status: 'completed',
          completedAt: '2026-07-02T00:00:00.000Z',
          currentPageIndex: 2,
          exerciseProgress: [],
          lastAccessedAt: '2026-07-02T00:00:00.000Z',
          progressSchemaVersion: 1,
        },
        'user_normal-2': {
          userId: 'user',
          lessonId: 'normal-2',
          status: 'completed',
          completedAt: '2026-07-03T00:00:00.000Z',
          furthestPageIndex: 0,
          exerciseProgress: [],
          lastAccessedAt: '2026-07-03T00:00:00.000Z',
          progressSchemaVersion: 2,
        },
        'user_normal-3': {
          userId: 'user',
          lessonId: 'normal-3',
          status: 'in-progress',
          furthestPageIndex: 2,
          exerciseProgress: [],
          lastAccessedAt: '2026-07-03T00:00:00.000Z',
          progressSchemaVersion: 2,
        },
      },
    };
    const { db, selectedFieldLog } = createFakeDb(collections);
    const getAssignmentsForLessonIds = jest.fn(async (lessonIds: string[]) => {
      expect(lessonIds).toEqual(['vocab-1', 'diagram-1', 'listening']);
      return new Map([
        [
          'vocab-1',
          {
            practiceCategoryIds: ['category-1'],
            practiceCategories: [
              {
                id: 'category-1',
                lessonType: 'vocab',
                name: 'Authors',
                normalizedName: 'authors',
                status: 'active',
                categoryOrder: 0,
                tags: [
                  {
                    id: 'tag-cicero',
                    name: 'Cicero',
                    normalizedName: 'cicero',
                    status: 'active',
                    tagOrder: 0,
                    createdAt: 'now',
                    createdBy: 'admin',
                    updatedAt: 'now',
                    updatedBy: 'admin',
                  },
                  {
                    id: 'tag-old',
                    name: 'Old author',
                    normalizedName: 'old author',
                    status: 'archived',
                    tagOrder: 1,
                    createdAt: 'now',
                    createdBy: 'admin',
                    updatedAt: 'now',
                    updatedBy: 'admin',
                  },
                ],
                createdAt: 'now',
                createdBy: 'admin',
                updatedAt: 'now',
                updatedBy: 'admin',
              },
            ],
            memberships: [
              {
                id: 'membership-1',
                categoryId: 'category-1',
                lessonId: 'vocab-1',
                lessonOrder: 4,
                tagIds: ['tag-cicero', 'tag-old'],
                createdAt: 'now',
                createdBy: 'admin',
                updatedAt: 'now',
                updatedBy: 'admin',
              },
            ],
          },
        ],
      ]);
    });
    const service = new StudentDashboardService(
      db as never,
      {
        getAssignmentsForLessonIds,
      } as never
    );

    const dashboard = await service.getDashboard('user');

    // This matrix covers legacy progress records, page-math completion,
    // authoritative v2 completion, and stored cursor metadata.
    expect(
      dashboard.learningPath
        .filter((item): item is StudentLessonSummary => item.kind === 'lesson')
        .map(item => [item.id, item.status, item.progress, item.totalPages, item.furthestPageIndex])
    ).toEqual([
      ['normal-1', 'completed', 100, 2, 1],
      ['normal-2', 'completed', 100, 3, 0],
      ['normal-3', 'in-progress', 75, 4, 2],
    ]);
    expect(dashboard.practiceLessons.map(item => item.id)).toEqual(['vocab-1', 'diagram-1', 'listening']);
    expect(dashboard.practiceLessons[0].practiceCategoryPlacements).toEqual([
      { categoryId: 'category-1', lessonOrder: 4, tagIds: ['tag-cicero'] },
    ]);
    expect(dashboard.practiceLessons[0].practiceCategories?.[0].tags).toEqual([
      { id: 'tag-cicero', name: 'Cicero', status: 'active', tagOrder: 0 },
    ]);
    expect(JSON.stringify(dashboard)).not.toContain('"pages"');
    expect(selectedFieldLog).toHaveLength(3);
    expect(selectedFieldLog.every(fields => !fields.includes('pages'))).toBe(true);
    // The dashboard reads progress with a summary mask: per-exercise history
    // (which grows without bound) stays out of the projection.
    const progressFields = selectedFieldLog.find(fields => fields.includes('lessonId'));
    expect(progressFields).toBeDefined();
    expect(progressFields).not.toContain('exerciseProgress');
    expect(progressFields).toContain('progress');
    expect(progressFields).toContain('completedExerciseCount');
    expect(progressFields).toContain('requiredExerciseCount');
    expect(progressFields).toContain('progressLessonVersion');
    expect(JSON.stringify(dashboard)).not.toContain('"exerciseProgress"');
  });

  it('keeps a later reached lesson unlocked when the path changes behind it', async () => {
    const collections = {
      lessons: {
        first: lesson({ title: 'First', liveOrder: 0, totalPages: 2 }),
        second: lesson({ title: 'Second', liveOrder: 1, totalPages: 4 }),
      },
      userProgress: {
        user_first: {
          userId: 'user',
          lessonId: 'first',
          status: 'in-progress',
          currentPageIndex: 0,
          exerciseProgress: [],
          lastAccessedAt: 'now',
          progressSchemaVersion: 1,
        },
        user_second: {
          userId: 'user',
          lessonId: 'second',
          status: 'in-progress',
          furthestPageIndex: 2,
          exerciseProgress: [],
          lastAccessedAt: 'now',
          progressSchemaVersion: 2,
        },
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['first', 'second'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
    };
    const { db } = createFakeDb(collections);
    const service = new StudentDashboardService(
      db as never,
      {
        getAssignmentsForLessonIds: jest.fn(async () => new Map()),
      } as never
    );

    const dashboard = await service.getDashboard('user');

    const lessonPath = dashboard.learningPath.filter((item): item is StudentLessonSummary => item.kind === 'lesson');
    expect(lessonPath.map(item => [item.id, item.status, item.progress, item.furthestPageIndex])).toEqual([
      ['first', 'in-progress', 50, 0],
      ['second', 'in-progress', 75, 2],
    ]);
  });

  it('authorizes one detail through the same projection and rejects locked lessons', async () => {
    const collections = {
      lessons: {
        'normal-1': lesson({ title: 'Normal 1', liveOrder: 0 }),
        'normal-2': lesson({
          title: 'Normal 2',
          liveOrder: 1,
          pages: [{ id: 'page-2', items: [] }],
        }),
        'vocab-hidden-search': lesson({
          title: 'Vocabulary without search',
          type: 'vocab',
          showWordSearch: false,
        }),
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['normal-1', 'normal-2'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {},
    };
    const { db } = createFakeDb(collections);
    const service = new StudentDashboardService(
      db as never,
      {
        getAssignmentsForLessonIds: jest.fn(async () => new Map()),
      } as never
    );

    const firstLesson = await service.getLesson('user', 'normal-1');
    expect(firstLesson.pages).toEqual([{ id: 'page-1', items: [] }]);
    expect(firstLesson.status).toBe('available');
    expect(firstLesson.showWordSearch).toBe(true);

    const hiddenSearchLesson = await service.getLesson('user', 'vocab-hidden-search');
    expect(hiddenSearchLesson.showWordSearch).toBe(false);

    await expect(service.getLesson('user', 'normal-2')).rejects.toMatchObject<Partial<StudentDashboardServiceError>>({
      code: 'LESSON_LOCKED',
      status: 403,
    });
    await expect(service.getLesson('user', 'missing')).rejects.toMatchObject<Partial<StudentDashboardServiceError>>({
      code: 'LESSON_NOT_FOUND',
      status: 404,
    });
  });

  it('keeps a lesson before an attempted test unlocked without loading the dashboard', async () => {
    const collections = {
      lessons: {
        first: lesson({ title: 'First', isLive: false, liveOrder: null }),
        gate: {
          kind: 'test',
          title: 'Gate test',
          description: '',
          rotationVersions: [{ versionId: 'version-a' }],
          passingPercentage: 70,
        },
        second: lesson({ title: 'Second', isLive: false, liveOrder: null }),
      },
      testVersions: {
        'version-a': {
          name: 'Version A',
          totalPages: 1,
          totalItems: 1,
          totalExercises: 1,
          totalPoints: 10,
          createdAt: 'now',
          createdBy: 'admin',
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['first', 'second', 'gate'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {},
      testAttempts: {} as Record<string, RecordData>,
    };
    const { db } = createFakeDb(collections);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never
    );

    await expect(service.getLesson('user', 'second')).rejects.toMatchObject<Partial<StudentDashboardServiceError>>({
      code: 'LESSON_LOCKED',
      status: 403,
    });

    collections.testAttempts['attempt-1'] = {
      studentId: 'user',
      origin: { kind: 'normal-test', testId: 'gate' },
      status: 'submitted',
    };
    await expect(service.getLesson('user', 'second')).resolves.toMatchObject({ id: 'second', status: 'available' });
  });

  it('keeps practice category failure non-fatal', async () => {
    const { db } = createFakeDb({
      lessons: {
        vocab: lesson({ type: 'vocab' }),
      },
      userProgress: {},
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new StudentDashboardService(
      db as never,
      {
        getAssignmentsForLessonIds: jest.fn(async () => {
          throw new Error('category read failed');
        }),
      } as never
    );

    await expect(service.getDashboard('user')).resolves.toMatchObject({
      learningPath: [],
      practiceLessons: [{ id: 'vocab' }],
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('skips and logs dangling aggregate references without disturbing valid order', async () => {
    const { db, selectedFieldLog } = createFakeDb({
      lessons: {
        first: lesson({ title: 'First', liveOrder: 0 }),
        practice: lesson({ title: 'Practice', type: 'vocab', liveOrder: 1 }),
        second: lesson({ title: 'Second', liveOrder: 2 }),
      },
      userProgress: {},
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new StudentDashboardService(
      db as never,
      {
        getAssignmentsForLessonIds: jest.fn(async () => new Map()),
      } as never
    );

    const summaries = await service.getPlacedUnitSummaries(['second', 'missing', 'practice', 'first']);

    expect(summaries.map(item => item.id)).toEqual(['second', 'first']);
    expect(errorSpy).toHaveBeenCalledWith('Learning Path references missing unit missing; skipping it');
    expect(errorSpy).toHaveBeenCalledWith('Learning Path references ineligible unit practice; skipping it');
    expect(selectedFieldLog.at(-1)).not.toContain('pages');
    errorSpy.mockRestore();
  });

  it('uses the canonical path for the normal sequence while preserving practice order', async () => {
    const collections = {
      lessons: {
        legacy: lesson({ title: 'Legacy', liveOrder: 0 }),
        placed: lesson({
          title: 'Placed',
          isLive: false,
          liveOrder: null,
        }),
        practice: lesson({ title: 'Practice', type: 'vocab', liveOrder: 1 }),
      },
      learningPaths: {
        default: {
          revision: 1,
          unitIds: ['placed', 'missing', 'legacy'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {},
    };
    const { db } = createFakeDb(collections);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new StudentDashboardService(
      db as never,
      {
        getAssignmentsForLessonIds: jest.fn(async () => new Map()),
      } as never
    );

    const active = await service.getDashboard('user');
    expect(active.learningPath.map(item => item.id)).toEqual(['placed', 'legacy']);
    await expect(service.getNormalSequenceUnitIds()).resolves.toEqual(['placed', 'legacy']);
    expect(active.practiceLessons.map(item => item.id)).toEqual(['practice']);
    expect(errorSpy).toHaveBeenCalledWith('Learning Path references missing unit missing; skipping it');

    errorSpy.mockRestore();
  });
});

describe('StudentDashboardService Phase 6 mixed Learning Path', () => {
  const testUnit = (overrides: RecordData = {}): RecordData => ({
    kind: 'test',
    title: 'Chapter test',
    description: 'Assessment',
    rotationVersions: [{ versionId: 'version-a' }],
    passingPercentage: 70,
    ...overrides,
  });

  const versionSummary: RecordData = {
    name: 'Version A',
    totalPages: 1,
    totalItems: 1,
    totalExercises: 1,
    totalPoints: 10,
    createdAt: 'now',
    createdBy: 'admin',
    updatedAt: 'now',
    updatedBy: 'admin',
  };

  it('uses test completion rather than page math and names the required-pass gate', async () => {
    const collections = {
      lessons: {
        first: lesson({ title: 'First lesson', isLive: false, liveOrder: null }),
        test: testUnit(),
        second: lesson({ title: 'Second lesson', isLive: false, liveOrder: null }),
      },
      testVersions: { 'version-a': versionSummary },
      learningPaths: {
        default: {
          id: 'default',
          revision: 3,
          unitIds: ['first', 'test', 'second'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_first: {
          userId: 'user',
          lessonId: 'first',
          status: 'completed',
          exerciseProgress: [],
          completedAt: 'before',
          lastAccessedAt: 'before',
          progressSchemaVersion: 2,
        },
      },
    };
    const { db } = createFakeDb(collections);
    const getAttemptSummary = jest.fn(async () => ({
      origin: { kind: 'normal-test' as const, testId: 'test' },
      inProgressAttemptId: null,
      attemptCount: 1,
      best: {
        attemptId: 'attempt-1',
        score: 6,
        maxScore: 10,
        percentage: 60,
        outcome: 'not-passed' as const,
        submittedAt: 'now',
      },
      latest: {
        attemptId: 'attempt-1',
        score: 6,
        maxScore: 10,
        percentage: 60,
        outcome: 'not-passed' as const,
        submittedAt: 'now',
      },
    }));
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never,
      { getAttemptSummary } as never
    );

    const dashboard = await service.getDashboard('user');

    expect(dashboard.learningPath.map(unit => [unit.id, unit.kind, unit.status])).toEqual([
      ['first', 'lesson', 'completed'],
      ['test', 'test', 'available'],
      ['second', 'lesson', 'locked'],
    ]);
    expect(dashboard.learningPath[2].lockedReason).toBe('Pass Chapter test to unlock');
    expect(dashboard.learningPath[1]).not.toHaveProperty('totalPages');
    expect(getAttemptSummary).toHaveBeenCalledWith({ kind: 'normal-test', testId: 'test' }, 'user');
  });

  it('uses the frozen failed outcome for related mocks even when current settings become score-only', async () => {
    const collections = {
      lessons: {
        first: lesson({ isLive: false, liveOrder: null }),
        test: testUnit(),
        second: lesson({ isLive: false, liveOrder: null }),
      },
      testVersions: { 'version-a': versionSummary },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['first', 'test', 'second'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_first: {
          userId: 'user',
          lessonId: 'first',
          status: 'completed',
          exerciseProgress: [],
          completedAt: 'before',
          lastAccessedAt: 'before',
          progressSchemaVersion: 2,
        },
      },
    };
    const { db } = createFakeDb(collections);
    let outcome: 'not-passed' | 'passed' | 'score-only' = 'not-passed';
    const getRelatedLiveMocks = jest.fn(async () => [{ id: 'mock-1', title: 'Practice', passingPercentage: null }]);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never,
      {
        getAttemptSummary: jest.fn(async () => ({
          origin: { kind: 'normal-test' as const, testId: 'test' },
          inProgressAttemptId: null,
          attemptCount: 1,
          best: null,
          latest: {
            attemptId: 'attempt-1',
            score: 1,
            maxScore: 10,
            percentage: 10,
            outcome,
            submittedAt: '2026-07-28T12:00:00.000Z',
          },
        })),
      } as never,
      {
        listStudentLiveMocks: jest.fn(async () => []),
        listPastStudentMockResults: jest.fn(async () => []),
        getRelatedLiveMocks,
      } as never
    );

    expect((await service.getDashboard('user')).learningPath[1]).toMatchObject({
      relatedLiveMocks: [{ id: 'mock-1' }],
    });
    collections.lessons.test.passingPercentage = null; // Admin changes settings after the failed frozen attempt.
    expect((await service.getDashboard('user')).learningPath[1]).toMatchObject({
      relatedLiveMocks: [{ id: 'mock-1' }],
    });

    outcome = 'passed';
    expect((await service.getDashboard('user')).learningPath[1]).not.toHaveProperty('relatedLiveMocks');
    outcome = 'score-only';
    expect((await service.getDashboard('user')).learningPath[1]).not.toHaveProperty('relatedLiveMocks');
    expect(getRelatedLiveMocks).toHaveBeenCalledTimes(2);
  });

  it('does not let an inserted required-pass test relock a reached later unit', async () => {
    const collections = {
      lessons: {
        first: lesson({ title: 'First lesson', isLive: false, liveOrder: null }),
        inserted: testUnit({ title: 'Inserted test' }),
        reached: lesson({ title: 'Reached lesson', isLive: false, liveOrder: null }),
      },
      testVersions: { 'version-a': versionSummary },
      learningPaths: {
        default: {
          id: 'default',
          revision: 4,
          unitIds: ['first', 'inserted', 'reached'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_first: {
          userId: 'user',
          lessonId: 'first',
          status: 'completed',
          exerciseProgress: [],
          completedAt: 'before',
          lastAccessedAt: 'before',
          progressSchemaVersion: 2,
        },
        user_reached: {
          userId: 'user',
          lessonId: 'reached',
          status: 'in-progress',
          furthestPageIndex: 0,
          exerciseProgress: [],
          lastAccessedAt: 'before-insertion',
          progressSchemaVersion: 2,
        },
      },
    };
    const { db } = createFakeDb(collections);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never,
      {
        getAttemptSummary: jest.fn(async () => ({
          origin: { kind: 'normal-test', testId: 'inserted' },
          inProgressAttemptId: null,
          attemptCount: 0,
          best: null,
          latest: null,
        })),
      } as never
    );

    const dashboard = await service.getDashboard('user');

    expect(dashboard.learningPath.map(unit => [unit.id, unit.status])).toEqual([
      ['first', 'completed'],
      ['inserted', 'available'],
      ['reached', 'in-progress'],
    ]);
  });

  it('keeps a structurally invalid placed test as an unavailable gate', async () => {
    const collections = {
      lessons: {
        first: lesson({ title: 'First lesson', isLive: false, liveOrder: null }),
        broken: testUnit({
          title: 'Broken test',
          rotationVersions: [{ versionId: 'version-a' }, { versionId: 'version-a' }],
        }),
        second: lesson({ title: 'Second lesson', isLive: false, liveOrder: null }),
      },
      testVersions: { 'version-a': versionSummary },
      learningPaths: {
        default: {
          id: 'default',
          revision: 4,
          unitIds: ['first', 'broken', 'second'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_first: {
          userId: 'user',
          lessonId: 'first',
          status: 'completed',
          exerciseProgress: [],
          completedAt: 'before',
          lastAccessedAt: 'before',
          progressSchemaVersion: 2,
        },
      },
    };
    const { db } = createFakeDb(collections);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never,
      {
        getAttemptSummary: jest.fn(async () => ({
          origin: { kind: 'normal-test', testId: 'broken' },
          inProgressAttemptId: null,
          attemptCount: 0,
          best: null,
          latest: null,
        })),
      } as never
    );

    const dashboard = await service.getDashboard('user');

    expect(dashboard.learningPath.map(unit => [unit.id, unit.status])).toEqual([
      ['first', 'completed'],
      ['broken', 'available'],
      ['second', 'locked'],
    ]);
    expect(dashboard.learningPath[1]).toMatchObject({
      kind: 'test',
      configurationStatus: 'unavailable',
    });
    expect(errorSpy).toHaveBeenCalledWith('Learning Path references invalid test broken; marking it unavailable');
    errorSpy.mockRestore();
  });

  it('fails closed when test reachability history cannot be loaded', async () => {
    const collections = {
      lessons: {
        test: testUnit(),
      },
      testVersions: { 'version-a': versionSummary },
      learningPaths: {
        default: {
          id: 'default',
          revision: 4,
          unitIds: ['test'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {},
    };
    const { db } = createFakeDb(collections);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never,
      { getAttemptSummary: jest.fn(async () => Promise.reject(new Error('index unavailable'))) } as never
    );

    await expect(service.getDashboard('user')).rejects.toThrow('index unavailable');
  });

  it('runs attempt summaries, practice enrichment, and mock listing concurrently', async () => {
    const collections = {
      lessons: {
        first: lesson({ isLive: false, liveOrder: null }),
        test: testUnit(),
        practice: lesson({ type: 'vocab', title: 'Practice', liveOrder: 1 }),
      },
      testVersions: { 'version-a': versionSummary },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['first', 'test'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {},
    };
    const { db } = createFakeDb(collections);

    // Attempt summaries stay pending: if the phases still ran serially, the
    // practice/mock/past-result work could never have started by now.
    let releaseAttempts!: () => void;
    const attemptsHeld = new Promise<void>(resolve => {
      releaseAttempts = resolve;
    });
    const getAttemptSummary = jest.fn(
      () =>
        attemptsHeld.then(() => ({
          origin: { kind: 'normal-test' as const, testId: 'test' },
          inProgressAttemptId: null,
          attemptCount: 0,
          best: null,
          latest: null,
        }))
    );
    const getAssignmentsForLessonIds = jest.fn(async () => new Map());
    const listStudentLiveMocks = jest.fn(async () => []);
    const listPastStudentMockResults = jest.fn(async () => []);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds } as never,
      { getAttemptSummary } as never,
      { listStudentLiveMocks, listPastStudentMockResults, getRelatedLiveMocks: jest.fn() } as never
    );

    const dashboardPromise = service.getDashboard('user');
    // One macrotask tick drains the fake db's promise chains, so every
    // independent phase has been started by now if they truly run in parallel.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(getAttemptSummary).toHaveBeenCalledTimes(1);
    expect(getAssignmentsForLessonIds).toHaveBeenCalledTimes(1);
    expect(listStudentLiveMocks).toHaveBeenCalledWith('user');
    expect(listPastStudentMockResults).toHaveBeenCalledWith('user');

    releaseAttempts();
    await expect(dashboardPromise).resolves.toBeDefined();
  });

  it('reconciles past mock results against the live cards after both resolve', async () => {
    const collections = {
      lessons: { first: lesson({ isLive: false, liveOrder: null }) },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['first'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {},
    };
    const { db } = createFakeDb(collections);
    const listStudentLiveMocks = jest.fn(async () => [{ id: 'live-mock' }]);
    const listPastStudentMockResults = jest.fn(async () => [
      { id: 'live-mock', title: 'Live' },
      { id: 'past-mock', title: 'Past' },
    ]);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never,
      { getAttemptSummary: jest.fn(async () => ({})) } as never,
      { listStudentLiveMocks, listPastStudentMockResults, getRelatedLiveMocks: jest.fn() } as never
    );

    const dashboard = await service.getDashboard('user');

    expect(dashboard.mockTests).toEqual([{ id: 'live-mock' }]);
    expect(dashboard.pastMockResults).toEqual([{ id: 'past-mock', title: 'Past' }]);
  });

  it('uses trusted exercise summaries and canonically refreshes stale lesson versions', async () => {
    const collections = {
      lessons: {
        trusted: lesson({
          title: 'Trusted',
          liveOrder: 0,
          version: 2,
          pages: [
            { id: 'page-1', items: [{ id: 'trusted-a', type: 'fill', title: 'A' }] },
            { id: 'page-2', items: [{ id: 'trusted-b', type: 'fill', title: 'B' }] },
            { id: 'page-3', items: [{ id: 'trusted-c', type: 'fill', title: 'C' }] },
          ],
          totalPages: 3,
          totalExercises: 3,
        }),
        mismatched: lesson({
          title: 'Mismatched',
          liveOrder: 1,
          version: 2,
          pages: [
            { id: 'page-1', items: [{ id: 'mismatch-a', type: 'fill', title: 'A' }] },
            { id: 'page-2', items: [{ id: 'mismatch-b', type: 'fill', title: 'B' }] },
            { id: 'page-3', items: [{ id: 'mismatch-c', type: 'fill', title: 'C' }] },
          ],
          totalPages: 3,
          totalExercises: 3,
        }),
        locked: lesson({ title: 'Locked', liveOrder: 2, totalPages: 2, totalExercises: 1 }),
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['trusted', 'mismatched', 'locked'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_trusted: {
          userId: 'user',
          lessonId: 'trusted',
          status: 'in-progress',
          furthestPageIndex: 0,
          progress: 33,
          completedExerciseCount: 1,
          requiredExerciseCount: 3,
          progressSchemaVersion: 4,
          progressLessonVersion: 2,
          lastAccessedAt: 'now',
        },
        user_mismatched: {
          userId: 'user',
          lessonId: 'mismatched',
          status: 'in-progress',
          furthestPageIndex: 2,
          progress: 66,
          completedExerciseCount: 2,
          requiredExerciseCount: 2,
          progressSchemaVersion: 4,
          progressLessonVersion: 1,
          exerciseProgress: [
            { exerciseId: 'mismatch-a', score: 100, completedAt: 'before' },
            { exerciseId: 'mismatch-b', score: 100, completedAt: 'before' },
          ],
          lastAccessedAt: 'now',
        },
      },
    };
    const { db } = createFakeDb(collections);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never
    );

    const dashboard = await service.getDashboard('user');
    const lessonPath = dashboard.learningPath.filter((item): item is StudentLessonSummary => item.kind === 'lesson');
    expect(lessonPath.map(item => [item.id, item.status, item.progress, item.progressLessonVersion])).toEqual([
      ['trusted', 'in-progress', 33, 2],
      ['mismatched', 'in-progress', 67, 2],
      ['locked', 'locked', 0, undefined],
    ]);
  });

  it('does not unlock the next lesson from numeric 100 without completed status', async () => {
    const collections = {
      lessons: {
        first: lesson({
          title: 'First',
          liveOrder: 0,
          version: 1,
          pages: [{ id: 'page-1', items: [{ id: 'exercise-a', type: 'fill', title: 'A' }] }],
          totalPages: 1,
          totalExercises: 1,
        }),
        second: lesson({ title: 'Second', liveOrder: 1, totalPages: 2, totalExercises: 1 }),
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['first', 'second'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_first: {
          userId: 'user',
          lessonId: 'first',
          status: 'in-progress',
          progress: 100,
          requiredExerciseCount: 1,
          completedExerciseCount: 1,
          progressSchemaVersion: 3,
          furthestPageIndex: 0,
          lastAccessedAt: 'now',
        },
      },
    };
    const { db } = createFakeDb(collections);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never
    );

    const dashboard = await service.getDashboard('user');
    const lessonPath = dashboard.learningPath.filter((item): item is StudentLessonSummary => item.kind === 'lesson');
    expect(lessonPath.map(item => [item.id, item.status, item.progress])).toEqual([
      ['first', 'in-progress', 0],
      ['second', 'locked', 0],
    ]);
  });

  it('uses canonical exercise evidence consistently for dashboard and lesson access', async () => {
    const collections = {
      lessons: {
        first: lesson({
          title: 'First',
          liveOrder: 0,
          version: 2,
          pages: [{ id: 'page-1', items: [{ id: 'exercise-a', type: 'fill', title: 'A' }] }],
          totalPages: 1,
          totalItems: 1,
          totalExercises: 1,
        }),
        second: lesson({ title: 'Second', liveOrder: 1 }),
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['first', 'second'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_first: {
          userId: 'user',
          lessonId: 'first',
          status: 'in-progress',
          furthestPageIndex: 0,
          progressSchemaVersion: 2,
          exerciseProgress: [{ exerciseId: 'exercise-a', score: 100, completedAt: 'before' }],
          lastAccessedAt: 'before',
        },
      },
    };
    const { db } = createFakeDb(collections);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never
    );

    const dashboard = await service.getDashboard('user');
    expect(
      dashboard.learningPath
        .filter((item): item is StudentLessonSummary => item.kind === 'lesson')
        .map(item => [item.id, item.status, item.progress])
    ).toEqual([
      ['first', 'completed', 100],
      ['second', 'available', 0],
    ]);
    await expect(service.getLesson('user', 'second')).resolves.toMatchObject({
      id: 'second',
      status: 'available',
    });
  });

  it('isolates an invalid lesson during canonical dashboard hydration', async () => {
    const collections = {
      lessons: {
        broken: lesson({
          title: 'Broken',
          liveOrder: 0,
          version: 2,
          pages: 'not-an-array',
          totalPages: 1,
          totalItems: 1,
          totalExercises: 1,
        }),
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['broken'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_broken: {
          userId: 'user',
          lessonId: 'broken',
          status: 'in-progress',
          progressSchemaVersion: 2,
          exerciseProgress: [],
          lastAccessedAt: 'before',
        },
      },
    };
    const { db } = createFakeDb(collections);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never
    );

    await expect(service.getDashboard('user')).resolves.toMatchObject({
      learningPath: [{ id: 'broken', status: 'in-progress', progress: 0 }],
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'Unable to canonicalize progress for invalid lesson broken; skipping it',
      expect.any(StudentDashboardServiceError)
    );
    errorSpy.mockRestore();
  });

  it('uses canonical completion from full exercise history on getLesson', async () => {
    const collections = {
      lessons: {
        first: lesson({
          title: 'First',
          liveOrder: 0,
          pages: [
            { id: 'page-1', items: [{ id: 'exercise-a', type: 'fill', title: 'One' }] },
            { id: 'page-2', items: [{ id: 'exercise-b', type: 'fill', title: 'Two' }] },
          ],
          totalPages: 2,
          totalExercises: 2,
        }),
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['first'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_first: {
          userId: 'user',
          lessonId: 'first',
          status: 'in-progress',
          furthestPageIndex: 1,
          progressSchemaVersion: 2,
          exerciseProgress: [{ exerciseId: 'exercise-a', score: 100, completedAt: 'now' }],
          lastAccessedAt: 'now',
        },
      },
    };
    const { db } = createFakeDb(collections);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never
    );

    const detail = await service.getLesson('user', 'first');
    expect(detail.progress).toBe(50);
    expect(detail.completedExerciseCount).toBe(1);
    expect(detail.requiredExerciseCount).toBe(2);
    expect(detail.status).toBe('in-progress');
    expect(detail.progressLessonVersion).toBe(0);
  });

  it('logs when hydrated counts still disagree with the persisted lesson summary', async () => {
    const collections = {
      lessons: {
        drifted: lesson({
          title: 'Drifted',
          liveOrder: 0,
          version: 2,
          pages: [{ id: 'page-1', items: [{ id: 'exercise-a', type: 'fill', title: 'A' }] }],
          totalPages: 1,
          totalItems: 1,
          totalExercises: 2,
        }),
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['drifted'],
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_drifted: {
          userId: 'user',
          lessonId: 'drifted',
          status: 'in-progress',
          furthestPageIndex: 0,
          progressSchemaVersion: 4,
          progressLessonVersion: 2,
          completedExerciseCount: 1,
          requiredExerciseCount: 1,
          progress: 100,
          lastAccessedAt: 'before',
        },
      },
    };
    const { db } = createFakeDb(collections);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new StudentDashboardService(
      db as never,
      { getAssignmentsForLessonIds: jest.fn(async () => new Map()) } as never
    );

    const dashboard = await service.getDashboard('user');
    expect(dashboard.learningPath).toMatchObject([{ id: 'drifted', status: 'in-progress', progress: 0 }]);
    expect(errorSpy).toHaveBeenCalledWith(
      'Unable to trust hydrated progress for lesson drifted; dashboard will show 0% until the lesson summary matches authored exercises',
      expect.objectContaining({ requiredExerciseCount: 1, totalExercises: 2 })
    );
    errorSpy.mockRestore();
  });
});
