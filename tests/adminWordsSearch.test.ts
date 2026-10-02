jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/services/firebase-admin', () => ({ adminDb: { collection: jest.fn() } }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: class AdminAccessError extends Error {},
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));

import { GET } from '@/src/app/api/admin/words/route';

const mockCollection = jest.requireMock('@/src/services/firebase-admin').adminDb.collection as jest.Mock;

function mockWordsQuery() {
  const where = jest.fn();
  const query = {
    select: () => query,
    orderBy: () => query,
    where: (...args: unknown[]) => {
      where(...args);
      return query;
    },
    limit: () => query,
    get: async () => ({
      docs: [{ id: 'abeo', data: () => ({ word: 'abeō', sort_key: 'abeo' }) }],
      size: 1,
      empty: false,
    }),
  };
  mockCollection.mockReturnValue(query);
  return where;
}

const list = (search: string) =>
  GET({ url: `http://localhost/api/admin/words?search=${encodeURIComponent(search)}` } as never) as unknown as Promise<{
    status: number;
    body: { data: { words: { id: string }[]; filters: { search: string | null } } };
  }>;

describe('admin word search', () => {
  beforeEach(() => mockCollection.mockReset());

  it('ignores surrounding whitespace in the search prefix', async () => {
    const where = mockWordsQuery();

    const response = await list(' abeō ');

    expect(response.status).toBe(200);
    expect(where).toHaveBeenCalledWith('sort_key', '>=', 'abeo');
    expect(where).toHaveBeenCalledWith('sort_key', '<=', 'abeo');
    expect(response.body.data.filters.search).toBe('abeō');
    expect(response.body.data.words.map(word => word.id)).toEqual(['abeo']);
  });

  it('treats a whitespace-only search as no search', async () => {
    const where = mockWordsQuery();

    const response = await list('   ');

    expect(response.status).toBe(200);
    expect(where).not.toHaveBeenCalledWith('sort_key', expect.anything(), expect.anything());
    expect(response.body.data.filters.search).toBeNull();
  });
});
