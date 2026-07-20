import { POST } from '@/src/app/api/admin/lessons/update-publish-status/route';

const mockRunTransaction = jest.fn();
const mockCollection = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));

jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  },
}));

interface LessonData {
  type: 'normal' | 'vocab';
  isLive: boolean;
  liveOrder: number | null;
  pages: Array<{ id: string; items: [] }>;
}

function request(body: Record<string, unknown>) {
  return { json: async () => body } as never;
}

function configureFirestore(lessons: Record<string, LessonData>) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const collection = {
    doc: (id: string) => ({ id }),
    where: () => ({
      kind: 'live-lessons-query',
      orderBy: () => ({ kind: 'ordered-live-lessons-query' }),
    }),
  };
  mockCollection.mockReturnValue(collection);

  const snapshot = (id: string) => ({
    id,
    exists: Boolean(lessons[id]),
    data: () => lessons[id],
  });
  const transaction = {
    getAll: jest.fn(async (...refs: Array<{ id: string }>) => refs.map(ref => snapshot(ref.id))),
    get: jest.fn(async () => ({
      docs: Object.entries(lessons)
        .filter(([, lesson]) => lesson.isLive)
        .map(([id]) => snapshot(id)),
    })),
    update: jest.fn((ref: { id: string }, data: Record<string, unknown>) => {
      updates.push({ id: ref.id, data });
    }),
  };
  mockRunTransaction.mockImplementation(async callback => callback(transaction));

  return { transaction, updates };
}

describe('update lesson publish status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unpublishing every live lesson of a type', async () => {
    const { transaction } = configureFirestore({
      normal1: { type: 'normal', isLive: true, liveOrder: 0, pages: [] },
      vocab1: { type: 'vocab', isLive: true, liveOrder: 0, pages: [] },
    });

    const response = (await POST(
      request({
        lessonIds: ['normal1'],
        isLive: false,
        lessonType: 'normal',
        expectedLiveLessonIds: ['normal1'],
      })
    )) as unknown as { status: number; body: unknown };

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'At least one lesson of this type must remain live' });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('allows a subset of a lesson type to be unpublished atomically', async () => {
    const { transaction } = configureFirestore({
      normal1: { type: 'normal', isLive: true, liveOrder: 0, pages: [] },
      normal2: { type: 'normal', isLive: true, liveOrder: 1, pages: [] },
    });

    const response = (await POST(
      request({
        lessonIds: ['normal2'],
        isLive: false,
        lessonType: 'normal',
        expectedLiveLessonIds: ['normal1', 'normal2'],
      })
    )) as unknown as { status: number; body: { success: boolean; processedCount: number } };

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, processedCount: 1 });
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledWith(
      { id: 'normal2' },
      expect.objectContaining({ isLive: false, liveOrder: null, publishedAt: null })
    );
  });

  it('rejects lesson IDs from a different lesson type', async () => {
    const { transaction } = configureFirestore({
      vocab1: { type: 'vocab', isLive: true, liveOrder: 0, pages: [] },
    });

    const response = (await POST(
      request({
        lessonIds: ['vocab1'],
        isLive: false,
        lessonType: 'normal',
        expectedLiveLessonIds: [],
      })
    )) as unknown as { status: number; body: unknown };

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Lesson vocab1 does not belong to the active lesson type',
    });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('rejects updates based on a stale live-lesson set', async () => {
    const { transaction } = configureFirestore({
      normal1: { type: 'normal', isLive: true, liveOrder: 0, pages: [] },
      normal2: { type: 'normal', isLive: true, liveOrder: 1, pages: [] },
    });

    const response = (await POST(
      request({
        lessonIds: ['normal2'],
        isLive: false,
        lessonType: 'normal',
        expectedLiveLessonIds: ['normal1'],
      })
    )) as unknown as { status: number; body: unknown };

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Live lessons changed since the page loaded. Refresh and try again.',
    });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('publishes a lesson when the expected live set still matches', async () => {
    const { transaction } = configureFirestore({
      normal1: { type: 'normal', isLive: true, liveOrder: 0, pages: [] },
      normal2: { type: 'normal', isLive: false, liveOrder: null, pages: [{ id: 'page-1', items: [] }] },
    });

    const response = (await POST(
      request({
        lessonIds: ['normal2'],
        isLive: true,
        lessonType: 'normal',
        expectedLiveLessonIds: ['normal1'],
      })
    )) as unknown as { status: number; body: { success: boolean; processedCount: number } };

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, processedCount: 1 });
    expect(transaction.update).toHaveBeenCalledWith(
      { id: 'normal2' },
      expect.objectContaining({ isLive: true, liveOrder: 1 })
    );
  });
});
