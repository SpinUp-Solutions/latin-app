import { PUT } from '@/src/app/api/admin/lessons/route';

const setLesson = jest.fn();
let existingLessonData: Record<string, unknown>;
let learningPathData: Record<string, unknown> | undefined;
const getDocument = jest.fn(async (target: { collection?: string; id?: string }) => {
  if (target.collection === 'content_sync_locks') {
    return { id: target.id, exists: false, data: () => undefined };
  }
  if (target.collection === 'learningPaths') {
    return {
      id: 'default',
      exists: Boolean(learningPathData),
      data: () => learningPathData,
    };
  }
  return {
    id: target.id ?? 'lesson-1',
    exists: true,
    data: () => existingLessonData,
  };
});

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  ...jest.requireActual('@/src/lib/verifyAdminAccess'),
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));

jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    runTransaction: (callback: (transaction: unknown) => unknown) => callback({ get: getDocument, set: setLesson }),
    collection: (collection: string) => ({
      doc: (id: string) => ({ collection, id, get: getDocument, set: setLesson }),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  existingLessonData = {
    isLive: true,
    createdAt: '2026-01-01',
    createdBy: 'admin-1',
    version: 1,
  };
  learningPathData = undefined;
});

afterEach(() => jest.restoreAllMocks());

describe('live lesson progression validation', () => {
  it('rejects progression-unsafe edits to an already-live lesson', async () => {
    const response = (await PUT({
      json: async () => ({
        id: 'lesson-1',
        title: 'Live lesson',
        type: 'normal',
        pages: [],
      }),
    } as never)) as unknown as {
      body: { error: string; progressionErrors: string[] };
      status: number;
    };

    expect(response.status).toBe(400);
    expect(response.body.progressionErrors).toEqual(['Lesson must contain at least one page.']);
    expect(setLesson).not.toHaveBeenCalled();
  });

  it('rejects an incomplete edit to a placed lesson even when its legacy isLive flag is false', async () => {
    existingLessonData = {
      isLive: false,
      createdAt: '2026-01-01',
      createdBy: 'admin-1',
      version: 1,
    };
    learningPathData = {
      revision: 4,
      unitIds: ['lesson-1'],
      updatedAt: 'now',
      updatedBy: 'admin-1',
    };

    const response = (await PUT({
      json: async () => ({
        id: 'lesson-1',
        title: 'Placed lesson',
        type: 'normal',
        pages: [],
      }),
    } as never)) as unknown as {
      body: { code: string };
      status: number;
    };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PLACED_UNIT_INVALID');
    expect(setLesson).not.toHaveBeenCalled();
  });

  it('rejects changing a placed normal lesson into a practice lesson', async () => {
    existingLessonData = {
      isLive: false,
      createdAt: '2026-01-01',
      createdBy: 'admin-1',
      version: 1,
    };
    learningPathData = {
      revision: 4,
      unitIds: ['lesson-1'],
      updatedAt: 'now',
      updatedBy: 'admin-1',
    };

    const response = (await PUT({
      json: async () => ({
        id: 'lesson-1',
        title: 'Placed lesson',
        type: 'vocab',
        pages: [{ id: 'page-1', items: [] }],
      }),
    } as never)) as unknown as {
      body: { code: string };
      status: number;
    };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PLACED_UNIT_INVALID');
    expect(setLesson).not.toHaveBeenCalled();
  });
});
