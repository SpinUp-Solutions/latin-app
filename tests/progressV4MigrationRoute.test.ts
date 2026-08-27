type Data = Record<string, unknown>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const mockCollections = new Map<string, Map<string, Data>>();
const mockVerifyAdminAccess = jest.fn(async (_request?: unknown) => ({ uid: 'admin-1' }));
const mockRunTransaction = jest.fn();
let mockBeforeTransaction: (() => void) | undefined;

class FakeDocumentRef {
  constructor(
    readonly collectionName: string,
    readonly id: string
  ) {}

  async get() {
    return snapshot(this, mockCollections.get(this.collectionName)?.get(this.id));
  }
}

function snapshot(ref: FakeDocumentRef, data?: Data) {
  return {
    id: ref.id,
    ref,
    exists: data !== undefined,
    data: () => data,
  };
}

class FakeQuery {
  private after?: string;
  private max = Number.MAX_SAFE_INTEGER;

  constructor(readonly collectionName: string) {}

  doc(id: string) {
    return new FakeDocumentRef(this.collectionName, id);
  }

  orderBy() {
    return this;
  }

  startAfter(cursor: string) {
    this.after = cursor;
    return this;
  }

  limit(limit: number) {
    this.max = limit;
    return this;
  }

  async get() {
    const entries = [...(mockCollections.get(this.collectionName)?.entries() ?? [])]
      .sort(([left], [right]) => left.localeCompare(right))
      .filter(([id]) => !this.after || id > this.after)
      .slice(0, this.max);
    return { docs: entries.map(([id, data]) => snapshot(this.doc(id), data)) };
  }
}

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' } }));
jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => new FakeQuery(name),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  },
}));
jest.mock('@/src/lib/verifyAdminAccess', () => {
  class AdminAccessError extends Error {
    status = 401;
  }

  return {
    AdminAccessError,
    verifyAdminAccess: (request: unknown) => mockVerifyAdminAccess(request),
  };
});

import { POST as migrateExerciseProgress } from '@/src/app/api/admin/progress/migrate-exercise-progress-v4/route';
import { AdminAccessError } from '@/src/lib/verifyAdminAccess';

const exerciseLesson = {
  id: 'lesson-1',
  kind: 'lesson',
  title: 'Exercise lesson',
  description: '',
  type: 'normal',
  version: 7,
  pages: [{ id: 'page-1', items: [{ id: 'exercise-1', type: 'fill', title: 'Exercise' }] }],
  totalPages: 1,
  totalItems: 1,
  totalExercises: 1,
  isLive: true,
  liveOrder: 0,
  publishedAt: 'now',
  publishedBy: 'admin',
};

function seed(collection: string, id: string, data: Data) {
  if (!mockCollections.has(collection)) mockCollections.set(collection, new Map());
  mockCollections.get(collection)!.set(id, clone(data));
}

function stored(collection: string, id: string) {
  return mockCollections.get(collection)?.get(id);
}

function request(body: unknown) {
  return { json: async () => body } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCollections.clear();
  mockBeforeTransaction = undefined;
  mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin-1' });
  mockRunTransaction.mockImplementation(async callback => {
    mockBeforeTransaction?.();
    mockBeforeTransaction = undefined;
    const writes: Array<() => void> = [];
    const result = await callback({
      get: async (ref: FakeDocumentRef) => ref.get(),
      create: (ref: FakeDocumentRef, data: Data) => {
        writes.push(() => {
          const collection = mockCollections.get(ref.collectionName) ?? new Map<string, Data>();
          if (collection.has(ref.id)) throw new Error('already exists');
          collection.set(ref.id, clone(data));
          mockCollections.set(ref.collectionName, collection);
        });
      },
      set: (ref: FakeDocumentRef, data: Data, options?: { merge?: boolean }) => {
        writes.push(() => {
          const collection = mockCollections.get(ref.collectionName) ?? new Map<string, Data>();
          const next = options?.merge ? { ...(collection.get(ref.id) ?? {}), ...clone(data) } : clone(data);
          collection.set(ref.id, next);
          mockCollections.set(ref.collectionName, collection);
        });
      },
    });
    writes.forEach(write => write());
    return result;
  });
});

describe('exercise progress v4 migration route', () => {
  it('rejects malformed JSON without scanning progress', async () => {
    const response = (await migrateExerciseProgress({
      json: async () => {
        throw new SyntaxError('Invalid JSON');
      },
    } as never)) as unknown as { status: number };

    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('defaults to a read-only dry run and reports an incomplete zero reset', async () => {
    const original = {
      userId: 'user-1',
      lessonId: 'lesson-1',
      status: 'in-progress',
      furthestPageIndex: 0,
      exerciseProgress: [],
      progressSchemaVersion: 2,
      updatedAt: 'student-update',
      lastAccessedAt: 'student-access',
    };
    seed('lessons', 'lesson-1', exerciseLesson);
    seed('userProgress', 'user-1_lesson-1', original);

    const response = (await migrateExerciseProgress(request({}))) as unknown as {
      status: number;
      body: Record<string, number | string | boolean | null>;
    };

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      action: 'dry-run',
      documentsScanned: 1,
      documentsWouldMigrate: 1,
      resetIncompleteProgressToZero: 1,
      hasMore: false,
      nextCursor: null,
    });
    expect(stored('userProgress', 'user-1_lesson-1')).toEqual(original);
    expect(stored('userProgressMigrationV4Backups', 'user-1_lesson-1')).toBeUndefined();
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before apply or rollback', async () => {
    const apply = (await migrateExerciseProgress(request({ action: 'apply' }))) as unknown as { status: number };
    const rollback = (await migrateExerciseProgress(request({ action: 'rollback' }))) as unknown as { status: number };

    expect(apply.status).toBe(400);
    expect(rollback.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('backs up, migrates the latest transactional state, preserves activity timestamps, and reruns idempotently', async () => {
    const original = {
      userId: 'user-1',
      lessonId: 'lesson-1',
      status: 'in-progress',
      furthestPageIndex: 0,
      exerciseProgress: [],
      progressSchemaVersion: 2,
      updatedAt: 'before-query',
      lastAccessedAt: 'before-query',
    };
    const concurrent = {
      ...original,
      exerciseProgress: [{ exerciseId: 'exercise-1', score: 100, completedAt: 'concurrent' }],
      updatedAt: 'concurrent-update',
      lastAccessedAt: 'concurrent-access',
    };
    seed('lessons', 'lesson-1', exerciseLesson);
    seed('userProgress', 'user-1_lesson-1', original);
    mockBeforeTransaction = () => seed('userProgress', 'user-1_lesson-1', concurrent);

    const applied = (await migrateExerciseProgress(
      request({ action: 'apply', confirmWrite: true })
    )) as unknown as { body: Record<string, number> };
    const migrated = stored('userProgress', 'user-1_lesson-1');
    const backup = stored('userProgressMigrationV4Backups', 'user-1_lesson-1');

    expect(applied.body.documentsMigrated).toBe(1);
    expect(migrated).toMatchObject({
      status: 'completed',
      progress: 100,
      completedExerciseCount: 1,
      requiredExerciseCount: 1,
      progressSchemaVersion: 4,
      progressLessonVersion: 7,
      progressMigrationId: 'exercise-progress-v4',
      updatedAt: 'concurrent-update',
      lastAccessedAt: 'concurrent-access',
    });
    expect(backup?.data).toEqual(concurrent);

    const rerun = (await migrateExerciseProgress(
      request({ action: 'apply', confirmWrite: true })
    )) as unknown as { body: Record<string, number> };
    expect(rerun.body.documentsAlreadyCurrent).toBe(1);
    expect(stored('userProgressMigrationV4Backups', 'user-1_lesson-1')?.data).toEqual(concurrent);
  });

  it('does not overwrite or migrate past an unexpected existing backup', async () => {
    const original = {
      userId: 'user-1',
      lessonId: 'lesson-1',
      status: 'in-progress',
      exerciseProgress: [],
      updatedAt: 'student-update',
      lastAccessedAt: 'student-access',
    };
    seed('lessons', 'lesson-1', exerciseLesson);
    seed('userProgress', 'user-1_lesson-1', original);
    seed('userProgressMigrationV4Backups', 'user-1_lesson-1', {
      migrationId: 'other-migration',
      progressDocumentId: 'user-1_lesson-1',
      data: { doNotOverwrite: true },
    });

    const response = (await migrateExerciseProgress(
      request({ action: 'apply', confirmWrite: true })
    )) as unknown as { body: Record<string, number> };

    expect(response.body.documentsSkippedBackupConflict).toBe(1);
    expect(stored('userProgress', 'user-1_lesson-1')).toEqual(original);
    expect(stored('userProgressMigrationV4Backups', 'user-1_lesson-1')?.data).toEqual({
      doNotOverwrite: true,
    });
  });

  it('reports missing, invalid, and deletion-pending lessons without writing', async () => {
    seed('lessons', 'deleted', { ...exerciseLesson, id: 'deleted', _deletionPending: true });
    seed('lessons', 'invalid', { ...exerciseLesson, id: 'invalid', pages: 'not-an-array' });
    seed('userProgress', 'user-1_deleted', {
      userId: 'user-1', lessonId: 'deleted', status: 'in-progress', exerciseProgress: [], lastAccessedAt: 'now',
    });
    seed('userProgress', 'user-1_invalid', {
      userId: 'user-1', lessonId: 'invalid', status: 'in-progress', exerciseProgress: [], lastAccessedAt: 'now',
    });
    seed('userProgress', 'user-1_missing', {
      userId: 'user-1', lessonId: 'missing', status: 'in-progress', exerciseProgress: [], lastAccessedAt: 'now',
    });
    seed('userProgress', 'user-1_mismatched', {
      userId: 'user-1', lessonId: 'lesson-1', status: 'in-progress', exerciseProgress: [], lastAccessedAt: 'now',
    });

    const response = (await migrateExerciseProgress(request({}))) as unknown as { body: Record<string, number> };

    expect(response.body.documentsSkippedDeletionPendingLesson).toBe(1);
    expect(response.body.documentsSkippedInvalidLesson).toBe(1);
    expect(response.body.documentsSkippedMissingLesson).toBe(1);
    expect(response.body.documentsSkippedInvalidProgress).toBe(1);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('paginates deterministically with a resumable document cursor', async () => {
    for (const lessonId of ['lesson-a', 'lesson-b', 'lesson-c']) {
      seed('lessons', lessonId, { ...exerciseLesson, id: lessonId });
      seed('userProgress', `user-1_${lessonId}`, {
        userId: 'user-1',
        lessonId,
        status: 'in-progress',
        exerciseProgress: [],
        lastAccessedAt: 'now',
      });
    }

    const firstPage = (await migrateExerciseProgress(request({ limit: 2 }))) as unknown as {
      body: { documentsScanned: number; hasMore: boolean; nextCursor: string | null };
    };
    expect(firstPage.body).toMatchObject({
      documentsScanned: 2,
      hasMore: true,
      nextCursor: 'user-1_lesson-b',
    });

    const secondPage = (await migrateExerciseProgress(
      request({ limit: 2, cursor: firstPage.body.nextCursor })
    )) as unknown as {
      body: { documentsScanned: number; hasMore: boolean; nextCursor: string | null };
    };
    expect(secondPage.body).toMatchObject({
      documentsScanned: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('refuses rollback after student activity and restores the exact pre-image when unchanged', async () => {
    const original = {
      userId: 'user-1', lessonId: 'lesson-1', status: 'in-progress', exerciseProgress: [],
      furthestPageIndex: 0, progressSchemaVersion: 2, updatedAt: 'original-update', lastAccessedAt: 'original-access',
    };
    seed('lessons', 'lesson-1', exerciseLesson);
    seed('userProgress', 'user-1_lesson-1', original);
    await migrateExerciseProgress(request({ action: 'apply', confirmWrite: true }));

    stored('userProgress', 'user-1_lesson-1')!.updatedAt = 'student-wrote-after-migration';
    const conflict = (await migrateExerciseProgress(
      request({ action: 'rollback', confirmWrite: true })
    )) as unknown as { body: Record<string, number> };
    expect(conflict.body.documentsSkippedConflict).toBe(1);

    stored('userProgress', 'user-1_lesson-1')!.updatedAt = 'original-update';
    const rolledBack = (await migrateExerciseProgress(
      request({ action: 'rollback', confirmWrite: true })
    )) as unknown as { body: Record<string, number> };
    expect(rolledBack.body.documentsRolledBack).toBe(1);
    expect(stored('userProgress', 'user-1_lesson-1')).toEqual(original);
  });

  it('refuses a rollback backup whose document ID does not match its restore target', async () => {
    const original = {
      userId: 'user-1',
      lessonId: 'lesson-1',
      status: 'in-progress',
      exerciseProgress: [],
      updatedAt: 'original-update',
      lastAccessedAt: 'original-access',
    };
    seed('userProgressMigrationV4Backups', 'wrong-backup-id', {
      migrationId: 'exercise-progress-v4',
      progressDocumentId: 'user-1_lesson-1',
      data: original,
    });
    seed('userProgress', 'user-1_lesson-1', {
      ...original,
      progressMigrationId: 'exercise-progress-v4',
    });

    const response = (await migrateExerciseProgress(
      request({ action: 'rollback', confirmWrite: true })
    )) as unknown as { body: Record<string, number> };

    expect(response.body.documentsSkippedMissingBackup).toBe(1);
    expect(stored('userProgress', 'user-1_lesson-1')).toMatchObject({
      progressMigrationId: 'exercise-progress-v4',
    });
  });

  it('returns the admin authorization error before reading migration data', async () => {
    mockVerifyAdminAccess.mockRejectedValueOnce(new AdminAccessError('Unauthorized', 401));

    const response = (await migrateExerciseProgress(request({}))) as unknown as { status: number };

    expect(response.status).toBe(401);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });
});
