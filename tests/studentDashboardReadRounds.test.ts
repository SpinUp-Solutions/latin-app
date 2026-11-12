import { StudentDashboardService } from '@/src/lib/learning-units/student-dashboard-service';
import { PracticeCategoryService } from '@/src/lib/practice-categories/service';
import {
  getStudentMockResultId,
  getTestAttemptSessionId,
  getTestAttemptSummaryMarkerId,
  TestAttemptService,
} from '@/src/lib/tests/attempt-service';
import { MockTestService } from '@/src/lib/tests/mock-service';
import { fingerprint } from '@/src/lib/tests/sections.server';
import type { TestAttemptOrigin } from '@/src/types/test';

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn() } }));

type Data = Record<string, unknown>;
type Store = Record<string, Record<string, Data>>;
type DocumentRef = { id: string; path: string; collection: string; get: () => Promise<Snapshot> };
type Snapshot = { id: string; exists: boolean; ref: DocumentRef; data: () => Data | undefined };
type QueryState = {
  filters: Array<{ field: string; operator: string; value: unknown }>;
  orderings: Array<{ field: string; direction: 'asc' | 'desc' }>;
  fields?: readonly string[];
  limit?: number;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fieldValue = (data: Data, path: string) =>
  path
    .split('.')
    .reduce<unknown>((value, key) => (value && typeof value === 'object' ? (value as Data)[key] : undefined), data);

/**
 * An in-memory Firestore in which every read and every transaction commit is
 * one request. Requests sent while earlier ones are in flight share a round,
 * so `rounds` counts how many round trips a caller waits for one after another.
 */
class RoundCountingFirestore {
  rounds = 0;
  requests = 0;
  readonly writes: string[] = [];
  private waiting: Array<() => void> = [];

  constructor(private readonly store: Store) {}

  private roundTrip<T>(respond: () => T): Promise<T> {
    this.requests += 1;
    if (this.waiting.length === 0) {
      // Every continuation of the previous round runs as a microtask, so all
      // requests that do not wait for one another are queued by now.
      setTimeout(() => {
        this.rounds += 1;
        for (const run of this.waiting.splice(0)) run();
      }, 0);
    }
    return new Promise((resolve, reject) =>
      this.waiting.push(() => {
        try {
          resolve(respond());
        } catch (error) {
          reject(error);
        }
      })
    );
  }

  private snapshot(collection: string, id: string, fields?: readonly string[]): Snapshot {
    const stored = this.store[collection]?.[id];
    const value =
      stored && fields
        ? Object.fromEntries(fields.filter(field => stored[field] !== undefined).map(field => [field, stored[field]]))
        : stored;
    return {
      id,
      exists: stored !== undefined,
      ref: this.doc(collection, id),
      data: () => (value === undefined ? undefined : clone(value)),
    };
  }

  private doc(collection: string, id: string): DocumentRef {
    return {
      id,
      path: `${collection}/${id}`,
      collection,
      get: () => this.roundTrip(() => this.snapshot(collection, id)),
    };
  }

  private query(collection: string, state: QueryState) {
    const next = (changes: Partial<QueryState>) => this.query(collection, { ...state, ...changes });
    const run = () => {
      let entries = Object.entries(this.store[collection] ?? {}).sort(([left], [right]) => left.localeCompare(right));
      for (const { field, operator, value } of state.filters) {
        if (operator !== '==' && operator !== 'in') throw new Error(`Unsupported operator ${operator}`);
        entries = entries.filter(([, data]) =>
          operator === 'in' ? (value as unknown[]).includes(fieldValue(data, field)) : fieldValue(data, field) === value
        );
      }
      for (const { field, direction } of [...state.orderings].reverse()) {
        entries = entries
          .filter(([, data]) => fieldValue(data, field) !== undefined)
          .sort(([, left], [, right]) => {
            const [a, b] = [fieldValue(left, field) as number | string, fieldValue(right, field) as number | string];
            const comparison = a < b ? -1 : a > b ? 1 : 0;
            return direction === 'desc' ? -comparison : comparison;
          });
      }
      const docs = entries
        .slice(0, state.limit ?? entries.length)
        .map(([id]) => this.snapshot(collection, id, state.fields));
      return { docs, empty: docs.length === 0, size: docs.length };
    };
    return {
      run,
      where: (field: string, operator: string, value: unknown) =>
        next({ filters: [...state.filters, { field, operator, value }] }),
      orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
        next({ orderings: [...state.orderings, { field, direction }] }),
      select: (...fields: string[]) => next({ fields }),
      limit: (limit: number) => next({ limit }),
      count: () => ({ get: () => this.roundTrip(() => ({ data: () => ({ count: run().docs.length }) })) }),
      get: () => this.roundTrip(run),
      doc: (id: string) => this.doc(collection, id),
    };
  }

  collection(name: string) {
    return this.query(name, { filters: [], orderings: [] });
  }

  getAll(...args: Array<DocumentRef | { fieldMask: readonly string[] }>) {
    const last = args.at(-1);
    const fieldMask = last && 'fieldMask' in last ? last.fieldMask : undefined;
    const refs = (fieldMask ? args.slice(0, -1) : args) as DocumentRef[];
    return this.roundTrip(() => refs.map(ref => this.snapshot(ref.collection, ref.id, fieldMask)));
  }

  async runTransaction<T>(update: (transaction: unknown) => Promise<T>): Promise<T> {
    const writes: Array<() => void> = [];
    const write = (ref: DocumentRef, apply: (current: Data | undefined) => Data | undefined) => {
      writes.push(() => {
        const documents = (this.store[ref.collection] ??= {});
        const value = apply(documents[ref.id]);
        if (value === undefined) delete documents[ref.id];
        else documents[ref.id] = clone(value);
        this.writes.push(ref.path);
      });
    };
    const transaction = {
      get: (target: DocumentRef | { run: () => unknown }) =>
        'run' in target ? this.roundTrip(target.run) : target.get(),
      getAll: (...args: Array<DocumentRef | { fieldMask: readonly string[] }>) => this.getAll(...args),
      set: (ref: DocumentRef, data: Data) => write(ref, () => data),
      create: (ref: DocumentRef, data: Data) => write(ref, () => data),
      update: (ref: DocumentRef, data: Data) => write(ref, current => ({ ...current, ...data })),
      delete: (ref: DocumentRef) => write(ref, () => undefined),
    };
    const result = await update(transaction);
    await this.roundTrip(() => writes.forEach(apply => apply()));
    return result;
  }
}

const at = '2026-10-01T12:00:00.000Z';
const student = 'student-1';
const audit = { createdAt: at, createdBy: 'admin', updatedAt: at, updatedBy: 'admin' };

const lesson = (title: string, exerciseIds: string[], overrides: Data = {}): Data => ({
  kind: 'lesson',
  title,
  description: `${title} description`,
  type: 'normal',
  pages: exerciseIds.map((exerciseId, index) => ({
    id: `${exerciseId}-page`,
    items: [{ id: exerciseId, type: 'fill', title: `Exercise ${index + 1}` }],
  })),
  totalPages: exerciseIds.length,
  totalItems: exerciseIds.length,
  totalExercises: exerciseIds.length,
  isLive: false,
  liveOrder: null,
  publishedAt: at,
  publishedBy: 'admin',
  version: 1,
  ...audit,
  ...overrides,
});

const testUnit = (title: string, versionId: string): Data => ({
  kind: 'test',
  title,
  description: `${title} description`,
  rotationVersions: [{ versionId }],
  passingPercentage: 70,
  ...audit,
});

const version = (name: string): Data => ({
  name,
  totalPages: 1,
  totalItems: 2,
  totalExercises: 2,
  totalPoints: 10,
  ...audit,
});

const mock = (id: string, versionId: string, parent: Data, mockOrder: number | null, title = id): Data => ({
  id,
  versionId,
  parent,
  title,
  description: `${title} description`,
  passingPercentage: null,
  status: 'active',
  isLive: mockOrder !== null,
  mockOrder,
  ...audit,
});

const result = (attemptId: string, percentage: number, outcome: string, submittedAt: string) => ({
  attemptId,
  score: percentage / 10,
  maxScore: 10,
  percentage,
  outcome,
  submittedAt,
});

const attemptSummary = (origin: TestAttemptOrigin, results: Array<ReturnType<typeof result>>): [string, Data] => {
  const id = getTestAttemptSessionId(student, origin);
  const best = [...results].sort((left, right) => right.percentage - left.percentage)[0];
  return [
    id,
    {
      id,
      kind: 'summary',
      studentId: student,
      origin,
      attemptCount: results.length,
      best,
      latest: results.at(-1),
      recentResults: results.map(({ percentage, submittedAt }) => ({ percentage, submittedAt })),
      updatedAt: at,
    },
  ];
};

const mockResult = (mockTestId: string, latest: ReturnType<typeof result>): [string, Data] => {
  const id = getStudentMockResultId(student, mockTestId);
  return [id, { id, studentId: student, mockTestId, latest }];
};

/**
 * One student partway through a path of lessons and tests: a passed test, a
 * failed test with live practice mocks, a locked lesson behind it, practice
 * lessons with categories, a stale progress summary, live mock cards and a
 * result for a mock that is no longer live. Another student's records sit
 * beside them.
 */
function seed(): Store {
  const markerId = getTestAttemptSummaryMarkerId(student);
  const migrationId = fingerprint(['mock-results', student]);
  return {
    learningPaths: {
      default: {
        id: 'default',
        revision: 3,
        unitIds: ['lesson-done', 'test-passed', 'test-failed', 'lesson-locked'],
        updatedAt: at,
        updatedBy: 'admin',
      },
    },
    lessons: {
      'lesson-done': lesson('First lesson', ['done-a']),
      'test-passed': testUnit('Unit test', 'version-passed'),
      'test-failed': testUnit('Final test', 'version-failed'),
      'lesson-locked': lesson('Last lesson', ['locked-a', 'locked-b']),
      'vocab-stale': lesson('Vocabulary', ['vocab-a', 'vocab-b'], {
        type: 'vocab',
        isLive: true,
        liveOrder: 0,
        version: 2,
      }),
      'listening-1': lesson('Listening', ['listen-a'], { type: 'listening', isLive: true, liveOrder: 1 }),
      'vocab-draft': lesson('Draft vocabulary', ['draft-a'], { type: 'vocab' }),
    },
    testVersions: {
      'version-passed': version('Unit version'),
      'version-failed': version('Final version'),
      'version-mock-a': version('Mock A version'),
      'version-mock-b': version('Mock B version'),
      'version-standalone': version('Standalone version'),
      'version-hidden': version('Hidden version'),
    },
    mockTests: {
      'mock-a': mock('mock-a', 'version-mock-a', { kind: 'test', testId: 'test-failed' }, 1, 'Final practice A'),
      'mock-b': mock('mock-b', 'version-mock-b', { kind: 'test', testId: 'test-failed' }, 0, 'Final practice B'),
      'mock-standalone': mock('mock-standalone', 'version-standalone', { kind: 'standalone' }, 2, 'Standalone mock'),
      'mock-broken': mock('mock-broken', 'version-missing', { kind: 'test', testId: 'test-failed' }, 3, 'Broken'),
      'mock-hidden': mock('mock-hidden', 'version-hidden', { kind: 'test', testId: 'test-passed' }, null, 'Old mock'),
    },
    userProgress: {
      'student-1_lesson-done': {
        userId: student,
        lessonId: 'lesson-done',
        status: 'completed',
        progress: 100,
        completedExerciseCount: 1,
        requiredExerciseCount: 1,
        furthestPageIndex: 0,
        exerciseProgress: [{ exerciseId: 'done-a', score: 100, completedAt: at }],
        completedAt: '2026-09-01T10:00:00.000Z',
        lastAccessedAt: '2026-09-01T10:00:00.000Z',
        progressSchemaVersion: 4,
        progressLessonVersion: 1,
      },
      'student-1_test-passed': {
        userId: student,
        lessonId: 'test-passed',
        status: 'completed',
        exerciseProgress: [],
        completedAt: '2026-09-02T10:00:00.000Z',
        lastAccessedAt: '2026-09-02T10:00:00.000Z',
        updatedAt: '2026-09-02T10:00:00.000Z',
        progressSchemaVersion: 2,
      },
      // The lesson was edited to version 2 after the student last worked on it.
      'student-1_vocab-stale': {
        userId: student,
        lessonId: 'vocab-stale',
        status: 'in-progress',
        progress: 100,
        completedExerciseCount: 1,
        requiredExerciseCount: 1,
        furthestPageIndex: 0,
        exerciseProgress: [{ exerciseId: 'vocab-a', score: 100, completedAt: at }],
        lastAccessedAt: '2026-09-03T10:00:00.000Z',
        progressSchemaVersion: 4,
        progressLessonVersion: 1,
      },
      'student-2_lesson-locked': {
        userId: 'student-2',
        lessonId: 'lesson-locked',
        status: 'completed',
        progress: 100,
        completedExerciseCount: 2,
        requiredExerciseCount: 2,
        furthestPageIndex: 1,
        exerciseProgress: [],
        completedAt: at,
        lastAccessedAt: at,
        progressSchemaVersion: 4,
        progressLessonVersion: 1,
      },
    },
    testAttemptSummaries: Object.fromEntries([
      [markerId, { id: markerId, kind: 'marker', studentId: student, completedAt: at }],
      attemptSummary({ kind: 'normal-test', testId: 'test-passed' }, [
        result('attempt-passed', 80, 'passed', '2026-09-02T10:00:00.000Z'),
      ]),
      attemptSummary({ kind: 'normal-test', testId: 'test-failed' }, [
        result('attempt-failed-1', 60, 'not-passed', '2026-09-04T10:00:00.000Z'),
        result('attempt-failed-2', 50, 'not-passed', '2026-09-05T10:00:00.000Z'),
      ]),
      attemptSummary({ kind: 'mock-test', mockTestId: 'mock-a' }, [
        result('attempt-mock-a', 40, 'score-only', '2026-09-06T10:00:00.000Z'),
      ]),
      attemptSummary({ kind: 'mock-test', mockTestId: 'mock-hidden' }, [
        result('attempt-mock-hidden', 90, 'score-only', '2026-08-30T10:00:00.000Z'),
      ]),
    ]),
    studentMockResults: Object.fromEntries([
      mockResult('mock-a', result('attempt-mock-a', 40, 'score-only', '2026-09-06T10:00:00.000Z')),
      mockResult('mock-hidden', result('attempt-mock-hidden', 90, 'score-only', '2026-08-30T10:00:00.000Z')),
    ]),
    studentMockResultMigrations: {
      [migrationId]: { id: migrationId, studentId: student, completedAt: at },
    },
    practiceCategories: {
      'category-authors': {
        lessonType: 'vocab',
        name: 'Authors',
        normalizedName: 'authors',
        description: 'Read by author',
        status: 'active',
        categoryOrder: 0,
        tags: [
          { id: 'tag-cicero', name: 'Cicero', normalizedName: 'cicero', status: 'active', tagOrder: 1, ...audit },
          { id: 'tag-old', name: 'Old', normalizedName: 'old', status: 'archived', tagOrder: 2, ...audit },
          { id: 'tag-caesar', name: 'Caesar', normalizedName: 'caesar', status: 'active', tagOrder: 0, ...audit },
        ],
        ...audit,
      },
    },
    practiceCategoryMemberships: {
      'membership-1': {
        categoryId: 'category-authors',
        lessonId: 'vocab-stale',
        lessonOrder: 3,
        tagIds: ['tag-cicero', 'tag-old', 'tag-caesar'],
        ...audit,
      },
    },
  };
}

function dashboardService(db: RoundCountingFirestore) {
  const now = () => at;
  const attempts = new TestAttemptService(db as never, now);
  return new StudentDashboardService(
    db as never,
    new PracticeCategoryService(db as never),
    attempts,
    new MockTestService(db as never, now, attempts)
  );
}

const lessonFields = { kind: 'lesson', showWordSearch: true, publishedAt: at, publishedBy: 'admin', ...audit };
const testFields = {
  kind: 'test',
  ...audit,
  passingPercentage: 70,
  rotationVersionCount: 1,
  minTotalPoints: 10,
  maxTotalPoints: 10,
  configurationStatus: 'ready',
};
const noAttempts = (origin: TestAttemptOrigin) => ({
  origin,
  inProgressAttemptId: null,
  attemptCount: 0,
  best: null,
  latest: null,
});
const passed = result('attempt-passed', 80, 'passed', '2026-09-02T10:00:00.000Z');
const mockAResult = result('attempt-mock-a', 40, 'score-only', '2026-09-06T10:00:00.000Z');

/** The dashboard the service returned for `seed()` before its reads were reordered, as the route sends it. */
const expectedDashboard = {
  learningPath: [
    {
      ...lessonFields,
      id: 'lesson-done',
      title: 'First lesson',
      description: 'First lesson description',
      type: 'normal',
      isLive: false,
      liveOrder: null,
      version: 1,
      totalPages: 1,
      totalItems: 1,
      totalExercises: 1,
      progress: 100,
      status: 'completed',
      furthestPageIndex: 0,
      currentPageIndex: 0,
      completedAt: '2026-09-01T10:00:00.000Z',
      lastAccessedAt: '2026-09-01T10:00:00.000Z',
      progressSchemaVersion: 4,
      progressLessonVersion: 1,
    },
    {
      ...testFields,
      id: 'test-passed',
      title: 'Unit test',
      description: 'Unit test description',
      status: 'completed',
      completedAt: '2026-09-02T10:00:00.000Z',
      attemptSummary: {
        origin: { kind: 'normal-test', testId: 'test-passed' },
        inProgressAttemptId: null,
        attemptCount: 1,
        best: passed,
        latest: passed,
      },
    },
    {
      ...testFields,
      id: 'test-failed',
      title: 'Final test',
      description: 'Final test description',
      status: 'available',
      attemptSummary: {
        origin: { kind: 'normal-test', testId: 'test-failed' },
        inProgressAttemptId: null,
        attemptCount: 2,
        best: result('attempt-failed-1', 60, 'not-passed', '2026-09-04T10:00:00.000Z'),
        latest: result('attempt-failed-2', 50, 'not-passed', '2026-09-05T10:00:00.000Z'),
      },
      relatedLiveMocks: [
        { id: 'mock-b', title: 'Final practice B', passingPercentage: null },
        { id: 'mock-a', title: 'Final practice A', passingPercentage: null },
      ],
    },
    {
      ...lessonFields,
      id: 'lesson-locked',
      title: 'Last lesson',
      description: 'Last lesson description',
      type: 'normal',
      isLive: false,
      liveOrder: null,
      version: 1,
      totalPages: 2,
      totalItems: 2,
      totalExercises: 2,
      progress: 0,
      status: 'locked',
      lockedReason: 'Pass Final test to unlock',
      furthestPageIndex: -1,
      currentPageIndex: 0,
    },
  ],
  practiceLessons: [
    {
      ...lessonFields,
      id: 'vocab-stale',
      title: 'Vocabulary',
      description: 'Vocabulary description',
      type: 'vocab',
      isLive: true,
      liveOrder: 0,
      version: 2,
      totalPages: 2,
      totalItems: 2,
      totalExercises: 2,
      practiceCategories: [
        {
          id: 'category-authors',
          lessonType: 'vocab',
          name: 'Authors',
          description: 'Read by author',
          status: 'active',
          categoryOrder: 0,
          tags: [
            { id: 'tag-caesar', name: 'Caesar', status: 'active', tagOrder: 0 },
            { id: 'tag-cicero', name: 'Cicero', status: 'active', tagOrder: 1 },
          ],
        },
      ],
      practiceCategoryPlacements: [
        { categoryId: 'category-authors', lessonOrder: 3, tagIds: ['tag-cicero', 'tag-caesar'] },
      ],
      progress: 50,
      status: 'in-progress',
      furthestPageIndex: 0,
      currentPageIndex: 0,
      lastAccessedAt: '2026-09-03T10:00:00.000Z',
      progressSchemaVersion: 4,
      progressLessonVersion: 2,
    },
    {
      ...lessonFields,
      id: 'listening-1',
      title: 'Listening',
      description: 'Listening description',
      type: 'listening',
      isLive: true,
      liveOrder: 1,
      version: 1,
      totalPages: 1,
      totalItems: 1,
      totalExercises: 1,
      practiceCategories: [],
      practiceCategoryPlacements: [],
      progress: 0,
      status: 'available',
      furthestPageIndex: -1,
      currentPageIndex: 0,
    },
  ],
  mockTests: [
    {
      id: 'mock-b',
      title: 'Final practice B',
      description: 'Final practice B description',
      passingPercentage: null,
      totalPoints: 10,
      attemptSummary: noAttempts({ kind: 'mock-test', mockTestId: 'mock-b' }),
      scoreTrend: [],
    },
    {
      id: 'mock-a',
      title: 'Final practice A',
      description: 'Final practice A description',
      passingPercentage: null,
      totalPoints: 10,
      attemptSummary: {
        origin: { kind: 'mock-test', mockTestId: 'mock-a' },
        inProgressAttemptId: null,
        attemptCount: 1,
        best: mockAResult,
        latest: mockAResult,
      },
      scoreTrend: [{ percentage: 40, submittedAt: '2026-09-06T10:00:00.000Z' }],
    },
    {
      id: 'mock-standalone',
      title: 'Standalone mock',
      description: 'Standalone mock description',
      passingPercentage: null,
      totalPoints: 10,
      attemptSummary: noAttempts({ kind: 'mock-test', mockTestId: 'mock-standalone' }),
      scoreTrend: [],
    },
  ],
  pastMockResults: [
    {
      id: 'mock-hidden',
      title: 'Old mock',
      description: 'Old mock description',
      passingPercentage: null,
      latest: result('attempt-mock-hidden', 90, 'score-only', '2026-08-30T10:00:00.000Z'),
    },
  ],
};

/** What the route sends: the dashboard as JSON. */
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('student dashboard Firestore reads', () => {
  beforeEach(() => {
    // The mock whose version is missing is logged and left out.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the same dashboard while waiting only for the learning path chain of reads', async () => {
    const db = new RoundCountingFirestore(seed());
    const service = dashboardService(db);

    // The first load also stores the stale vocabulary summary. Its transaction
    // starts once the path units are known: one read round and one commit.
    expect(asJson(await service.getDashboard(student))).toEqual(expectedDashboard);
    expect(db.writes).toEqual(['userProgress/student-1_vocab-stale']);
    expect(db.rounds).toBe(4);
    // The related-mock nudge reuses the live-mock read instead of querying again.
    expect(db.requests).toBe(16);

    // Later loads wait for the path document, its units, and their test
    // versions; every other read runs alongside them.
    db.rounds = 0;
    db.requests = 0;
    expect(asJson(await service.getDashboard(student))).toEqual(expectedDashboard);
    expect(db.writes).toHaveLength(1);
    expect(db.rounds).toBe(3);
    expect(db.requests).toBe(14);
  });
});
