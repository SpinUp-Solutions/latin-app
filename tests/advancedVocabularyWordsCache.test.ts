import { configureStore } from '@reduxjs/toolkit';
import { advancedVocabularyApi } from '@/src/store/api/advancedVocabularyApi';
import type { PoolFilters } from '@/src/types/pool-filters';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

const mockQuery = jest.fn();
jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockQuery(...args),
}));

const baseFilters: PoolFilters = {
  partOfSpeech: 'noun',
  search: '',
  verbConjugation: 'all',
  isDeponent: 'both',
  nounDeclension: ['1'],
  adjectiveDeclension: 'all',
  pronounType: 'all',
  pronounPerson: 'all',
};

const page = (ids: string[], lastWordId: string | null) => ({
  data: { success: true, data: { words: ids.map(id => ({ id })), hasMore: lastWordId !== null, lastWordId } },
});

const createStore = () =>
  configureStore({
    reducer: { [advancedVocabularyApi.reducerPath]: advancedVocabularyApi.reducer },
    middleware: getDefault => getDefault().concat(advancedVocabularyApi.middleware),
  });

const requestedParams = (call: number) =>
  new URLSearchParams((mockQuery.mock.calls[call][0] as { url: string }).url.split('?')[1]);

const cacheKeys = (store: ReturnType<typeof createStore>) =>
  Object.keys(store.getState()[advancedVocabularyApi.reducerPath].queries);

beforeEach(() => mockQuery.mockReset());

it('sends only the filters that apply to the selected part of speech', async () => {
  mockQuery.mockResolvedValue(page(['a'], null));
  const store = createStore();

  await store.dispatch(
    advancedVocabularyApi.endpoints.getAdvancedWords.initiate({
      collection: VOCABULARY_WORDS_COLLECTION,
      filters: { ...baseFilters, search: ' amo ', verbConjugation: ['1'] },
      limit: 20,
      fetchAll: false,
      cellPaths: ['singular.nominative'],
      tableType: 'declension',
    })
  );

  expect(Object.fromEntries(requestedParams(0))).toEqual({
    wordType: 'noun',
    search: 'amo',
    nounDeclension: '1',
    limit: '20',
    collection: VOCABULARY_WORDS_COLLECTION,
    cellPaths: 'singular.nominative',
    tableType: 'declension',
  });
});

it('appends a cursor page into the first page cache and ignores filters that do not apply', async () => {
  const store = createStore();
  const args = { collection: VOCABULARY_WORDS_COLLECTION, filters: baseFilters, limit: 2, fetchAll: false };

  mockQuery.mockResolvedValueOnce(page(['a', 'b'], 'b'));
  await store.dispatch(advancedVocabularyApi.endpoints.getAdvancedWords.initiate({ ...args, lastWordId: null }));
  mockQuery.mockResolvedValueOnce(page(['b', 'c'], null));
  const cursor = await store.dispatch(
    advancedVocabularyApi.endpoints.getAdvancedWords.initiate({ ...args, lastWordId: 'b' })
  );

  expect(requestedParams(1).get('lastWordId')).toBe('b');
  expect(cursor.data?.words.map(word => word.id)).toEqual(['a', 'b', 'c']);
  expect(cacheKeys(store)).toHaveLength(1);

  const irrelevant = await store.dispatch(
    advancedVocabularyApi.endpoints.getAdvancedWords.initiate({
      ...args,
      filters: { ...baseFilters, verbConjugation: ['2'] },
      lastWordId: 'b',
    })
  );
  expect(irrelevant.data?.words.map(word => word.id)).toEqual(['a', 'b', 'c']);
  expect(cacheKeys(store)).toHaveLength(1);
});

it('replaces the cache for a filtered variant and for fetch-all', async () => {
  const store = createStore();
  const args = { collection: VOCABULARY_WORDS_COLLECTION, filters: baseFilters, limit: 2, lastWordId: null };

  mockQuery.mockResolvedValueOnce(page(['a', 'b'], 'b'));
  await store.dispatch(advancedVocabularyApi.endpoints.getAdvancedWords.initiate(args));
  mockQuery.mockResolvedValueOnce(page(['x'], null));
  const filtered = await store.dispatch(
    advancedVocabularyApi.endpoints.getAdvancedWords.initiate({
      ...args,
      filters: { ...baseFilters, nounDeclension: ['2'] },
    })
  );
  mockQuery.mockResolvedValueOnce(page(['a', 'b', 'c'], null));
  const all = await store.dispatch(
    advancedVocabularyApi.endpoints.getAdvancedWords.initiate({ ...args, limit: undefined, fetchAll: true })
  );

  expect(filtered.data?.words.map(word => word.id)).toEqual(['x']);
  expect(requestedParams(2).get('fetchAll')).toBe('true');
  expect(requestedParams(2).has('limit')).toBe(false);
  expect(all.data?.words.map(word => word.id)).toEqual(['a', 'b', 'c']);
  expect(cacheKeys(store)).toHaveLength(3);
});
