import { PUT } from '@/src/app/api/admin/lessons/route';

const setLesson = jest.fn();
const getLesson = jest.fn(async () => ({
  exists: true,
  data: () => ({ isLive: true, createdAt: '2026-01-01', createdBy: 'admin-1', version: 1 }),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status || 200 }),
  },
}));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));

jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    runTransaction: (callback: (transaction: unknown) => unknown) =>
      callback({ get: getLesson, set: setLesson }),
    collection: () => ({
      doc: () => ({ get: getLesson, set: setLesson }),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

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
});
