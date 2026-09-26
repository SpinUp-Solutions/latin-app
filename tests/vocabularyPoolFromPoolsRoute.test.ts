const mockVerifyAdminAccess = jest.fn();
const mockCreateVocabularyPoolFromPools = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  verifyAdminAccess: (...args: unknown[]) => mockVerifyAdminAccess(...args),
}));
jest.mock('@/src/lib/vocabulary-pools/from-pools.server', () => ({
  createVocabularyPoolFromPools: (...args: unknown[]) => mockCreateVocabularyPoolFromPools(...args),
  VocabularyPoolFromPoolsError: class VocabularyPoolFromPoolsError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

import { POST } from '@/src/app/api/admin/vocabulary-pools/from-pools/route';
import { AdminAccessError } from '@/src/lib/admin-access-error';

const makeRequest = (body: unknown, jsonImplementation?: () => Promise<unknown>) =>
  ({
    json: jsonImplementation ?? (() => Promise.resolve(body)),
  }) as never;

describe('POST /api/admin/vocabulary-pools/from-pools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'verified-admin' });
    mockCreateVocabularyPoolFromPools.mockResolvedValue({
      id: 'copy-1',
      name: 'Combined',
      description: 'Combined words',
      wordDocIds: ['word-1'],
      metadata: {
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
        wordCount: 1,
        isActive: true,
        tags: [],
        difficulty: 'beginner',
      },
    });
  });

  it.each([
    [new AdminAccessError('Authentication required', 401), 401],
    [new AdminAccessError('Admin access required', 403), 403],
  ])('returns %s before reading the body', async (error, status) => {
    mockVerifyAdminAccess.mockRejectedValueOnce(error);
    const json = jest.fn().mockRejectedValue(new Error('body must not be read'));
    const response = (await POST(makeRequest(undefined, json))) as unknown as {
      status: number;
      body: { error: string };
    };

    expect(response.status).toBe(status);
    expect(json).not.toHaveBeenCalled();
    expect(mockCreateVocabularyPoolFromPools).not.toHaveBeenCalled();
  });

  it('returns a stable 400 for invalid JSON', async () => {
    const response = (await POST(
      makeRequest(undefined, () => Promise.reject(new SyntaxError('Unexpected token')))
    )) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_JSON');
    expect(mockCreateVocabularyPoolFromPools).not.toHaveBeenCalled();
  });

  it('maps malformed input through the shared validation response', async () => {
    const response = (await POST(makeRequest({ name: 'Missing source' }))) as unknown as {
      status: number;
      body: { code: string; issues: Array<{ path: string }> };
    };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.issues.some(issue => issue.path === 'sourcePoolIds')).toBe(true);
    expect(mockCreateVocabularyPoolFromPools).not.toHaveBeenCalled();
  });

  it('derives the actor from auth and canonicalizes request arrays before service invocation', async () => {
    const response = (await POST(
      makeRequest({
        name: ' Combined ',
        description: ' Words copied from lessons ',
        difficulty: 'advanced',
        tags: ['Nouns', 'nouns'],
        sourcePoolIds: ['source-a', 'source-a', 'source-b'],
        wordDocIds: ['word-1', 'word-1', 'word-2'],
        requestId: 'request-123',
      })
    )) as unknown as { status: number; body: { success: boolean; data: { pool: { id: string } } } };

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, data: { pool: { id: 'copy-1' } } });
    expect(mockCreateVocabularyPoolFromPools).toHaveBeenCalledWith(
      expect.anything(),
      'verified-admin',
      expect.objectContaining({
        name: 'Combined',
        description: 'Words copied from lessons',
        difficulty: 'advanced',
        tags: ['nouns'],
        sourcePoolIds: ['source-a', 'source-b'],
        wordDocIds: ['word-1', 'word-2'],
        requestId: 'request-123',
      })
    );
    expect(mockCreateVocabularyPoolFromPools.mock.calls[0][2]).not.toHaveProperty('actorUid');
  });

  it('maps service conflicts with their actionable code', async () => {
    mockCreateVocabularyPoolFromPools.mockRejectedValueOnce(
      Object.assign(new Error('Source membership changed; start a fresh copy'), {
        status: 409,
        code: 'VOCABULARY_POOL_SOURCE_MEMBERSHIP_CHANGED',
      })
    );
    const response = (await POST(
      makeRequest({
        name: 'Combined',
        description: 'Words',
        sourcePoolIds: ['source-a'],
        requestId: 'request-123',
      })
    )) as unknown as { status: number; body: { error: string; code: string } };

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Source membership changed; start a fresh copy',
      code: 'VOCABULARY_POOL_SOURCE_MEMBERSHIP_CHANGED',
    });
  });
});
