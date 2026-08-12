const mockVerifyAuthenticatedAccess = jest.fn();
const mockGetReadableVocabularyPool = jest.fn();
const mockLoadVocabularyPoolWords = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: jest.requireActual('@/src/lib/verifyAdminAccess').AdminAccessError,
  verifyAuthenticatedAccess: (...args: unknown[]) => mockVerifyAuthenticatedAccess(...args),
}));
jest.mock('@/src/lib/vocabulary-pools/archive.server', () => ({
  getReadableVocabularyPool: (...args: unknown[]) => mockGetReadableVocabularyPool(...args),
  loadVocabularyPoolWords: (...args: unknown[]) => mockLoadVocabularyPoolWords(...args),
}));

import { GET } from '@/src/app/api/vocabulary-pools/[poolId]/words/route';
import { AdminAccessError } from '@/src/lib/verifyAdminAccess';

describe('student vocabulary pool route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAuthenticatedAccess.mockResolvedValue({ uid: 'student-1' });
    mockGetReadableVocabularyPool.mockResolvedValue({
      data: { name: 'Chapter words', wordDocIds: ['word-1'] },
      source: 'archive',
    });
    mockLoadVocabularyPoolWords.mockResolvedValue([
      {
        id: 'word-1',
        data: () => ({ word: 'puella', translation: 'girl', part_of_speech: 'noun' }),
      },
    ]);
  });

  it('serves sanitized archived study content to an authenticated non-admin student', async () => {
    const request = { url: 'http://localhost/api/vocabulary-pools/pool-1/words' } as never;
    const response = (await GET(request, { params: Promise.resolve({ poolId: 'pool-1' }) })) as unknown as {
      status: number;
      body: { data: { id: string; name: string; items: Array<Record<string, unknown>> } };
    };

    expect(response.status).toBe(200);
    expect(mockVerifyAuthenticatedAccess).toHaveBeenCalledWith(request);
    expect(response.body.data).toEqual({
      id: 'pool-1',
      name: 'Chapter words',
      items: [expect.objectContaining({ latin: 'puella', english: 'girl' })],
      totalCount: 1,
      hasMore: false,
      nextOffset: 1,
    });
    expect(response.body.data.items[0]).not.toHaveProperty('definitions');
  });

  it('rejects unauthenticated requests', async () => {
    mockVerifyAuthenticatedAccess.mockRejectedValueOnce(new AdminAccessError('Unauthorized', 401));
    const response = (await GET({ url: 'http://localhost/api/vocabulary-pools/pool-1/words' } as never, {
      params: Promise.resolve({ poolId: 'pool-1' }),
    })) as unknown as { status: number; body: { error: string } };

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
    expect(mockGetReadableVocabularyPool).not.toHaveBeenCalled();
  });

  it.each(['active', 'archive'])('paginates %s pools without silently truncating words', async source => {
    const ids = Array.from({ length: 250 }, (_, index) => `word-${index}`);
    mockGetReadableVocabularyPool.mockResolvedValue({
      data: { name: 'Large pool', wordDocIds: ids },
      source,
    });
    mockLoadVocabularyPoolWords.mockImplementation(async (_pool, selectedIds: string[]) =>
      selectedIds.map(id => ({ id, data: () => ({ word: id, translation: id, part_of_speech: 'noun' }) }))
    );

    const response = (await GET(
      { url: 'http://localhost/api/vocabulary-pools/pool-1/words?limit=200&offset=200' } as never,
      { params: Promise.resolve({ poolId: 'pool-1' }) }
    )) as unknown as {
      status: number;
      body: { data: { items: unknown[]; totalCount: number; hasMore: boolean; nextOffset: number } };
    };

    expect(response.status).toBe(200);
    expect(mockLoadVocabularyPoolWords).toHaveBeenCalledWith(expect.anything(), ids.slice(200));
    expect(response.body.data).toMatchObject({ totalCount: 250, hasMore: false, nextOffset: 250 });
    expect(response.body.data.items).toHaveLength(50);
  });
});
