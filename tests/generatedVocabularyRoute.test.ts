const mockVerifyAuthenticatedAccess = jest.fn();
const query = {
  select: jest.fn(),
  orderBy: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
  get: jest.fn(),
};
query.select.mockReturnValue(query);
query.orderBy.mockReturnValue(query);
query.where.mockReturnValue(query);
query.limit.mockReturnValue(query);
jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));
jest.mock('@/src/services/firebase-admin', () => ({ adminDb: { collection: jest.fn() } }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: class AdminAccessError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
  verifyAdminAccess: jest.fn(),
  verifyAuthenticatedAccess: (...args: unknown[]) => mockVerifyAuthenticatedAccess(...args),
}));

import { GET } from '@/src/app/api/words/generated/route';

const mockCollection = jest.requireMock('@/src/services/firebase-admin').adminDb.collection as jest.Mock;

describe('student generated vocabulary route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.select.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.limit.mockReturnValue(query);
  });

  it('allows an authenticated student and returns only exercise-safe fields', async () => {
    mockVerifyAuthenticatedAccess.mockResolvedValue({ uid: 'student-1' });
    mockCollection.mockReturnValue(query);
    query.get.mockResolvedValue({
      docs: [
        {
          id: 'word-1',
          data: () => ({
            word: 'amo',
            sort_key: 'amo',
            part_of_speech: 'verb',
            translation: 'love',
            internalSecret: 'do-not-return',
          }),
        },
      ],
      size: 1,
      empty: false,
    });
    const request = {
      url: 'http://localhost/api/words/generated?collection=vocabulary_words_v5&exerciseMode=true&limit=1',
      headers: new Headers({ authorization: 'Bearer student-token' }),
    } as never;

    const response = await GET(request);
    expect(response.status).toBe(200);
    const payload = (response as unknown as { body: { data: { words: Array<Record<string, unknown>> } } }).body;
    expect(payload.data.words).toEqual([
      expect.objectContaining({
        id: 'word-1',
        root_word: 'amo',
        selected_form: 'amo',
        part_of_speech: 'verb',
        translation: 'love',
      }),
    ]);
    expect(payload.data.words[0]).not.toHaveProperty('internalSecret');
    expect(payload.data.words[0]).not.toHaveProperty('sort_key');
  });

  it('loads pool-backed exercises from the immutable archive after pool deletion', async () => {
    mockVerifyAuthenticatedAccess.mockResolvedValue({ uid: 'student-1' });
    query.get.mockResolvedValue({
      docs: [
        {
          id: 'word-1',
          data: () => ({ word: 'amo', part_of_speech: 'verb', translation: 'love' }),
        },
      ],
      size: 1,
      empty: false,
    });
    const archiveRef = { collection: jest.fn(() => query) };
    mockCollection.mockImplementation((name: string) => ({
      ...(name === 'vocabulary_pool_archives' ? archiveRef : {}),
      doc: (id: string) => ({
        get: async () => {
          if (name === 'vocabulary_pools') return { id, exists: false, data: () => undefined };
          if (name === 'deleted_vocabulary_pools') {
            return { id, exists: true, data: () => ({ archiveId: 'archive-1' }) };
          }
          if (name === 'vocabulary_pool_archives') {
            return {
              id,
              exists: true,
              data: () => ({ wordDocIds: ['word-1'] }),
              ref: archiveRef,
            };
          }
          throw new Error(`Unexpected collection ${name}`);
        },
      }),
    }));
    const request = {
      url: 'http://localhost/api/words/generated?collection=vocabulary_words_v5&exerciseMode=true&poolId=archived-pool&limit=200',
      headers: new Headers({ authorization: 'Bearer student-token' }),
    } as never;

    const response = await GET(request);
    expect(response.status).toBe(200);
    const payload = (response as unknown as { body: { data: { words: Array<Record<string, unknown>> } } }).body;
    expect(payload.data.words).toEqual([
      expect.objectContaining({ id: 'word-1', root_word: 'amo', translation: 'love' }),
    ]);
    expect(archiveRef.collection).toHaveBeenCalledWith('words');
  });

  it('filters incompatible selected verb forms before choosing a generated form', async () => {
    mockVerifyAuthenticatedAccess.mockResolvedValue({ uid: 'student-1' });
    mockCollection.mockReturnValue(query);
    query.get.mockResolvedValue({
      docs: [
        {
          id: 'word-1',
          data: () => ({
            word: 'amo',
            part_of_speech: 'verb',
            conjugation: '1',
            conjugation_table: {
              indicative: { active: { present: { singular: { first: ['amo'] } } } },
              gerund: { genitive: ['amandi'] },
            },
          }),
        },
      ],
      size: 1,
      empty: false,
    });

    const response = await GET({
      url: 'http://localhost/api/words/generated?collection=vocabulary_words_v5&exerciseMode=true&limit=1&tableType=conjugation&cellPaths=indicative.active.present.singular.first,gerund.genitive&steps=mood',
      headers: new Headers({ authorization: 'Bearer student-token' }),
    } as never);

    expect(response.status).toBe(200);
    const payload = (response as unknown as { body: { data: { words: Array<Record<string, unknown>> } } }).body;
    expect(payload.data.words).toHaveLength(1);
    expect(payload.data.words[0]).toMatchObject({
      selected_form: 'amo',
      form_path: { verb_form: 'finite' },
    });
    expect(payload.data.words[0].primary_form_paths).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ verb_form: 'gerund' })])
    );
  });

  it.each([
    ['fetchAll', 'exerciseMode=true&fetchAll=true'],
    ['oversized limit', 'exerciseMode=true&limit=201'],
    ['invalid limit', 'exerciseMode=true&limit=nope'],
    [
      'oversized cell paths',
      `exerciseMode=true&cellPaths=${Array.from({ length: 101 }, (_, i) => `path${i}`).join(',')}`,
    ],
    [
      'oversized filters',
      `exerciseMode=true&verbConjugation=${Array.from({ length: 31 }, (_, i) => `v${i}`).join(',')}`,
    ],
  ])('rejects unsafe generated request parameters: %s', async (_label, params) => {
    mockVerifyAuthenticatedAccess.mockResolvedValue({ uid: 'student-1' });
    const response = await GET({
      url: `http://localhost/api/words/generated?collection=vocabulary_words_v5&${params}`,
      headers: new Headers({ authorization: 'Bearer student-token' }),
    } as never);

    expect(response.status).toBe(400);
    expect(mockCollection).not.toHaveBeenCalled();
  });
});
