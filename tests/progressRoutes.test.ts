import { POST as migrateProgress } from '@/src/app/api/admin/progress/migrate-stable-ids/route';
import { POST as updateProgress } from '@/src/app/api/progress/[userId]/[lessonId]/route';
import { POST as finishLesson } from '@/src/app/api/progress/[userId]/[lessonId]/complete/route';

const mockTransactionSet = jest.fn();
const mockVerifyAdminAccess = jest.fn(async () => ({ uid: 'admin-1' }));
const mockVerifyIdToken = jest.fn(async () => ({ uid: 'user-1' }));
const mockRunTransaction = jest.fn();
const mockGetLessonProgressAccess = jest.fn(async (..._args: unknown[]) => 'allowed');
const mockCollection = jest.fn((collection: string) => ({
  doc: (id: string) => ({ collection, id }),
}));

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('firebase-admin', () => ({
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

jest.mock('@/src/lib/verifyAdminAccess', () => {
  class AdminAccessError extends Error {
    status = 401;
  }

  return {
    AdminAccessError,
    verifyAdminAccess: () => mockVerifyAdminAccess(),
  };
});

jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (collection: string) => mockCollection(collection),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  },
}));

jest.mock('@/src/lib/learning-units/progression-access', () => ({
  getLessonProgressAccessInTransaction: (...args: unknown[]) => mockGetLessonProgressAccess(...args),
}));

const lesson = {
  title: 'Lesson',
  type: 'normal',
  pages: [
    {
      id: 'page-1',
      items: [{ id: 'exercise-1', type: 'fill', title: 'Required exercise' }],
    },
    { id: 'page-2', items: [{ id: 'text-2', type: 'text', content: 'Finish' }] },
  ],
};

const passiveLesson = {
  title: 'Passive',
  type: 'normal',
  pages: [
    { id: 'page-1', items: [{ id: 'text-1', type: 'text', content: 'Read' }] },
    { id: 'page-2', items: [{ id: 'text-2', type: 'text', content: 'End' }] },
  ],
};

function request(body: unknown) {
  return {
    headers: { get: () => 'Bearer token' },
    json: async () => body,
  } as never;
}

function configureTransaction(
  progressData: Record<string, unknown> | undefined,
  lessonData: Record<string, unknown> = lesson
) {
  mockRunTransaction.mockImplementation(async callback =>
    callback({
      get: async (ref: { collection: string; id: string }) =>
        ref.collection === 'lessons'
          ? { exists: true, id: ref.id, data: () => lessonData }
          : { exists: Boolean(progressData), id: ref.id, data: () => progressData },
      set: mockTransactionSet,
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' });
  mockGetLessonProgressAccess.mockResolvedValue('allowed');
});

describe('progress update route', () => {
  it('rejects a request for another user', async () => {
    const response = (await updateProgress(request({ action: 'visit-page', pageId: 'page-1' }), {
      params: Promise.resolve({ userId: 'user-2', lessonId: 'lesson-1' }),
    })) as unknown as { status: number };

    expect(response.status).toBe(401);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid exercise score before starting a transaction', async () => {
    const response = (await updateProgress(
      request({ action: 'complete-exercise', exerciseId: 'exercise-1', score: '20' }),
      { params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }) }
    )) as unknown as { body: { error: string }; status: number };

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid progress request');
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('rejects progress writes to a server-locked lesson', async () => {
    configureTransaction(undefined);
    mockGetLessonProgressAccess.mockResolvedValue('locked');

    const response = (await updateProgress(request({ action: 'visit-page', pageId: 'page-1' }), {
      params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }),
    })) as unknown as { body: { error: string }; status: number };

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Lesson is locked');
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockGetLessonProgressAccess).toHaveBeenCalledWith(
      expect.objectContaining({ get: expect.any(Function), set: mockTransactionSet }),
      expect.anything(),
      expect.objectContaining({ id: 'lesson-1' }),
      'user-1',
      false
    );
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it('silently marks the lesson complete when the final required exercise is recorded', async () => {
    configureTransaction({
      userId: 'user-1',
      lessonId: 'lesson-1',
      status: 'in-progress',
      furthestPageIndex: 0,
      progressSchemaVersion: 2,
      exerciseProgress: [],
    });

    const response = (await updateProgress(
      request({
        action: 'complete-exercise',
        exerciseId: 'exercise-1',
        score: 20,
      }),
      { params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }) }
    )) as unknown as {
      body: { success: boolean; lessonCompleted: boolean };
      status: number;
    };

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      lessonCompleted: true,
      progress: 100,
      completedExerciseCount: 1,
      requiredExerciseCount: 1,
    });
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'completed',
        progressSchemaVersion: 3,
        progress: 100,
        completedExerciseCount: 1,
        requiredExerciseCount: 1,
      }),
      { merge: true }
    );
  });

  it('counts a zero score as a recorded exercise completion', async () => {
    configureTransaction({
      status: 'in-progress',
      exerciseProgress: [],
      progressSchemaVersion: 2,
    });

    const response = (await updateProgress(
      request({ action: 'complete-exercise', exerciseId: 'exercise-1', score: 0 }),
      { params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }) }
    )) as unknown as { body: { lessonCompleted: boolean; progress: number }; status: number };

    expect(response.status).toBe(200);
    expect(response.body.lessonCompleted).toBe(true);
    expect(response.body.progress).toBe(100);
  });

  it('rejects scores outside 0-100 before starting a transaction', async () => {
    const tooLow = (await updateProgress(
      request({ action: 'complete-exercise', exerciseId: 'exercise-1', score: -1 }),
      { params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }) }
    )) as unknown as { status: number };
    const tooHigh = (await updateProgress(
      request({ action: 'complete-exercise', exerciseId: 'exercise-1', score: 101 }),
      { params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }) }
    )) as unknown as { status: number };

    expect(tooLow.status).toBe(400);
    expect(tooHigh.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['non-number', '80'],
    ['missing', undefined],
  ])('rejects malformed score (%s) before starting a transaction', async (_label, score) => {
    const response = (await updateProgress(
      request({ action: 'complete-exercise', exerciseId: 'exercise-1', score }),
      { params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }) }
    )) as unknown as { status: number };

    expect(response.status).toBe(400);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('completes a passive-only lesson when the final page is visited', async () => {
    configureTransaction({ status: 'in-progress', furthestPageIndex: 0, progressSchemaVersion: 2 }, passiveLesson);

    const response = (await updateProgress(request({ action: 'visit-page', pageId: 'page-2' }), {
      params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }),
    })) as unknown as {
      body: {
        success: boolean;
        lessonCompleted: boolean;
        progress: number;
        furthestPageIndex: number;
        completedExerciseCount: number;
        requiredExerciseCount: number;
      };
    };

    expect(response.body).toEqual({
      success: true,
      lessonCompleted: true,
      progress: 100,
      furthestPageIndex: 1,
      completedExerciseCount: 0,
      requiredExerciseCount: 0,
    });
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'completed', progressSchemaVersion: 3, progress: 100 }),
      { merge: true }
    );
  });

  it('lazily upgrades an old record that already contains every required exercise', async () => {
    configureTransaction({
      status: 'in-progress',
      furthestPageIndex: 0,
      progressSchemaVersion: 2,
      exerciseProgress: [{ exerciseId: 'exercise-1', score: 80, completedAt: '2026-01-01T00:00:00.000Z' }],
    });

    const response = (await updateProgress(request({ action: 'visit-page', pageId: 'page-1' }), {
      params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }),
    })) as unknown as { body: { lessonCompleted: boolean; progress: number } };

    expect(response.body.lessonCompleted).toBe(true);
    expect(response.body.progress).toBe(100);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'completed', progressSchemaVersion: 3 }),
      { merge: true }
    );
  });

  it('does not lazily complete from malformed persisted exercise scores', async () => {
    configureTransaction({
      status: 'in-progress',
      furthestPageIndex: 0,
      progressSchemaVersion: 2,
      exerciseProgress: [{ exerciseId: 'exercise-1', score: 101, completedAt: '2026-01-01T00:00:00.000Z' }],
    });

    const response = (await updateProgress(request({ action: 'visit-page', pageId: 'page-1' }), {
      params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }),
    })) as unknown as { body: { lessonCompleted: boolean; progress: number }; status: number };

    expect(response.status).toBe(200);
    expect(response.body.lessonCompleted).toBe(false);
    expect(response.body.progress).toBe(50);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'in-progress', progressSchemaVersion: 3, progress: 50 }),
      { merge: true }
    );
  });

  it('never regresses the furthest page', async () => {
    configureTransaction({ status: 'in-progress', furthestPageIndex: 1, progressSchemaVersion: 2 });

    const response = (await updateProgress(request({ action: 'visit-page', pageId: 'page-1' }), {
      params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }),
    })) as unknown as { body: { furthestPageIndex: number } };

    expect(response.body.furthestPageIndex).toBe(1);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ furthestPageIndex: 1, progressSchemaVersion: 3 }),
      { merge: true }
    );
  });
});

describe('progress migration route', () => {
  it('rejects malformed JSON instead of starting a collection scan', async () => {
    const response = (await migrateProgress({
      headers: { get: () => 'Bearer token' },
      json: async () => {
        throw new SyntaxError('Invalid JSON');
      },
    } as never)) as unknown as { body: { error: string }; status: number };

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid migration request');
    expect(mockCollection).not.toHaveBeenCalled();
  });
});

describe('finish route', () => {
  it('returns missing exercise details for an incomplete exercise lesson', async () => {
    configureTransaction({ status: 'in-progress', exerciseProgress: [], progressSchemaVersion: 2 });

    const response = (await finishLesson(request({ finalPageId: 'page-2' }), {
      params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }),
    })) as unknown as {
      body: { missingExercises: Array<{ exerciseId: string; pageIndex: number }> };
      status: number;
    };

    expect(response.status).toBe(422);
    expect(response.body.missingExercises).toEqual([
      expect.objectContaining({ exerciseId: 'exercise-1', pageIndex: 0 }),
    ]);
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it('is idempotent for an already-completed lesson', async () => {
    configureTransaction({ status: 'completed', completedAt: '2026-01-01', exerciseProgress: [] });

    const response = (await finishLesson(request({ finalPageId: 'page-2' }), {
      params: Promise.resolve({ userId: 'user-1', lessonId: 'lesson-1' }),
    })) as unknown as { body: { success: boolean; alreadyCompleted: boolean }; status: number };

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      lessonCompleted: true,
      alreadyCompleted: true,
      progress: 100,
      completedExerciseCount: 0,
      requiredExerciseCount: 1,
    });
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'completed', completedAt: '2026-01-01', progressSchemaVersion: 3 }),
      { merge: true }
    );
  });
});
