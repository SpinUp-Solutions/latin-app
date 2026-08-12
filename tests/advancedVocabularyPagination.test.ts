import {
  fetchGeneratedWordPages,
  getPoolQueryParams,
  normalizeAdvancedVocabularyCollection,
} from '@/src/store/api/advancedVocabularyApi';

const response = (ids: string[], hasMore: boolean, pagination: { lastWordId?: string; nextPoolOffset?: number }) => ({
  data: {
    success: true,
    data: {
      words: ids.map(id => ({ id })),
      hasMore,
      lastWordId: pagination.lastWordId ?? null,
      nextPoolOffset: pagination.nextPoolOffset,
      limit: 200,
      filters: {},
      collection: 'vocabulary_words_v5',
    },
  },
});

describe('generated vocabulary pagination compatibility', () => {
  it('normalizes legacy editor preview collections to the configured vocabulary collection', () => {
    expect(normalizeAdvancedVocabularyCollection('vocabulary_words_v4')).toBe('vocabulary_words_v5');
  });
  it('uses bounded per-page limits for legacy pool requests', () => {
    expect(getPoolQueryParams('pool-1', 201, 'seed').get('limit')).toBe('200');
    expect(getPoolQueryParams('pool-1', 5_000, 'seed').get('limit')).toBe('200');
  });

  it('paginates until a saved pool limit above the endpoint ceiling is satisfied', async () => {
    const baseQuery = jest
      .fn()
      .mockResolvedValueOnce(
        response(
          Array.from({ length: 200 }, (_, index) => `word-${index}`),
          true,
          {
            nextPoolOffset: 200,
          }
        )
      )
      .mockResolvedValueOnce(
        response(
          Array.from({ length: 200 }, (_, index) => `word-${index + 200}`),
          true,
          { nextPoolOffset: 400 }
        )
      )
      .mockResolvedValueOnce(
        response(
          Array.from({ length: 100 }, (_, index) => `word-${index + 400}`),
          false,
          { nextPoolOffset: 500 }
        )
      );
    const params = getPoolQueryParams('pool-1', 500, 'stable-seed');

    const result = await fetchGeneratedWordPages(baseQuery, params, true, 500);

    expect(result.data?.data.words).toHaveLength(500);
    expect(baseQuery).toHaveBeenCalledTimes(3);
    expect(baseQuery.mock.calls[2][0].url).toContain('poolOffset=400');
    expect(baseQuery.mock.calls[2][0].url).toContain('limit=100');
  });

  it('limits filtered pool paging by sampled IDs rather than matching-word count', async () => {
    const baseQuery = jest.fn().mockResolvedValueOnce(
      response(
        Array.from({ length: 20 }, (_, index) => `noun-${index}`),
        true,
        { nextPoolOffset: 100 }
      )
    );
    const params = getPoolQueryParams('pool-1', 100, 'shared-seed');
    params.set('wordType', 'noun');

    const result = await fetchGeneratedWordPages(baseQuery, params, true, 100);

    expect(result.data?.data.words).toHaveLength(20);
    expect(baseQuery).toHaveBeenCalledTimes(1);
  });

  it('loads every bounded pool page for legacy all-word configs', async () => {
    const baseQuery = jest
      .fn()
      .mockResolvedValueOnce(response(['word-1'], true, { nextPoolOffset: 200 }))
      .mockResolvedValueOnce(response(['word-2'], false, { nextPoolOffset: 250 }));
    const params = getPoolQueryParams('pool-1', null, 'stable-seed');
    params.set('exerciseMode', 'true');

    const result = await fetchGeneratedWordPages(baseQuery, params, true);

    expect(result.data?.data.words.map(word => word.id)).toEqual(['word-1', 'word-2']);
    expect(baseQuery.mock.calls[1][0].url).toContain('poolOffset=200');
  });

  it('loads every cursor page for legacy filter-mode all configs', async () => {
    const baseQuery = jest
      .fn()
      .mockResolvedValueOnce(response(['word-1'], true, { lastWordId: 'word-1' }))
      .mockResolvedValueOnce(response(['word-2'], false, { lastWordId: 'word-2' }));
    const params = new URLSearchParams({ exerciseMode: 'true', limit: '200' });

    const result = await fetchGeneratedWordPages(baseQuery, params, true);

    expect(result.data?.data.words.map(word => word.id)).toEqual(['word-1', 'word-2']);
    expect(baseQuery.mock.calls[1][0].url).toContain('lastWordId=word-1');
  });
});
