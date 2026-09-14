import { configureStore } from '@reduxjs/toolkit';
import { waitFor } from '@testing-library/react';
import type { VocabularyPool, VocabularyPoolSummary } from '@/src/types/vocabulary-pool';

const mockBaseQuery = jest.fn();
let deferOldestTail = false;
let releaseOldestTail: (() => void) | undefined;

jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));

import { vocabularyPoolApi } from '@/src/store/api/vocabularyPoolApi';

const createdAt = (day: number) => `2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z` as unknown as Date;
const summary = (id: string, name: string, day: number, isActive = true): VocabularyPoolSummary => ({
  id,
  name,
  description: name,
  metadata: {
    createdAt: createdAt(day),
    createdBy: 'admin',
    updatedAt: createdAt(day),
    updatedBy: 'admin',
    wordCount: 1,
    isActive,
    tags: [],
    difficulty: 'beginner',
  },
});

const activePool = summary('active-pool', 'Active pool', 10);
const oldestPool = summary('oldest-pool', 'Oldest pool', 1);
const middlePool = summary('middle-pool', 'Middle pool', 5);
const copiedPool: VocabularyPool = {
  ...summary('copied-pool', 'Copied pool', 20, true),
  wordDocIds: ['word-1'],
};

const createStore = () =>
  configureStore({
    reducer: { [vocabularyPoolApi.reducerPath]: vocabularyPoolApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(vocabularyPoolApi.middleware),
  });

const poolsResponse = (pools: VocabularyPoolSummary[], lastPoolId: string | null = null) => ({
  data: { success: true, data: { pools, hasMore: Boolean(lastPoolId), lastPoolId } },
});

describe.each(['create', 'update', 'add', 'remove'] as const)('vocabulary pool %s cache refresh', mutationKind => {
  const mutate = (store: ReturnType<typeof createStore>) => {
    if (mutationKind === 'update')
      return store.dispatch(
        vocabularyPoolApi.endpoints.updatePool.initiate({ id: 'source-a', data: { wordDocIds: [] } }, { track: false })
      );
    if (mutationKind === 'add')
      return store.dispatch(
        vocabularyPoolApi.endpoints.addWordsToPool.initiate(
          { poolId: 'source-a', wordDocIds: ['word-1'] },
          { track: false }
        )
      );
    if (mutationKind === 'remove')
      return store.dispatch(
        vocabularyPoolApi.endpoints.removeWordsFromPool.initiate(
          { poolId: 'source-a', wordDocIds: ['word-1'] },
          { track: false }
        )
      );
    return store.dispatch(
      vocabularyPoolApi.endpoints.createPoolFromPools.initiate(
        {
          name: 'Combined',
          description: 'Combined words',
          sourcePoolIds: ['source-a'],
          requestId: 'request',
          wordDocIds: [],
          tags: [],
          difficulty: 'beginner',
        },
        { track: false }
      )
    );
  };
  beforeEach(() => {
    jest.clearAllMocks();
    deferOldestTail = false;
    releaseOldestTail = undefined;
    let copied = false;
    mockBaseQuery.mockImplementation(async (request: unknown) => {
      if (typeof request !== 'string') {
        const mutation = request as { url?: string; method?: string };
        if (
          mutation.url?.startsWith('/admin/vocabulary-pools') &&
          ['POST', 'PUT', 'DELETE'].includes(mutation.method ?? '')
        ) {
          copied = true;
          return { data: { success: true, data: { pool: copiedPool } } };
        }
      }

      const url = new URL(String(request), 'https://latin.test');
      if (url.pathname !== '/admin/vocabulary-pools') throw new Error(`Unexpected request: ${String(request)}`);
      const cursor = url.searchParams.get('lastPoolId');
      const oldestFirst = url.searchParams.get('sortOrder') === 'asc';
      const activeOnly = url.searchParams.get('isActive') === 'true';
      if (activeOnly) return poolsResponse([activePool]);
      if (oldestFirst) {
        if (cursor && deferOldestTail) {
          await new Promise<void>(resolve => {
            releaseOldestTail = resolve;
          });
        }
        return cursor ? poolsResponse([middlePool]) : poolsResponse([oldestPool], 'oldest-pool');
      }
      return poolsResponse(copied ? [copiedPool, activePool] : [activePool]);
    });
  });

  it('refreshes every cached filter and sorting variant from page one', async () => {
    const store = createStore();
    const newestArgs = { filters: { sortBy: 'createdAt' as const, sortOrder: 'desc' as const }, lastPoolId: null };
    const activeArgs = {
      filters: { isActive: true, sortBy: 'createdAt' as const, sortOrder: 'desc' as const },
      lastPoolId: null,
    };
    const oldestArgs = { filters: { sortBy: 'createdAt' as const, sortOrder: 'asc' as const }, lastPoolId: null };

    await store.dispatch(vocabularyPoolApi.endpoints.getPools.initiate(newestArgs, { subscribe: false }));
    await store.dispatch(vocabularyPoolApi.endpoints.getPools.initiate(activeArgs, { subscribe: false }));
    await store.dispatch(vocabularyPoolApi.endpoints.getPools.initiate(oldestArgs, { subscribe: false }));
    await store.dispatch(
      vocabularyPoolApi.endpoints.getPools.initiate({ ...oldestArgs, lastPoolId: 'oldest-pool' }, { subscribe: false })
    );

    await mutate(store);

    await waitFor(() => {
      expect(vocabularyPoolApi.endpoints.getPools.select(newestArgs)(store.getState()).data?.pools).toEqual([
        copiedPool,
        activePool,
      ]);
      expect(vocabularyPoolApi.endpoints.getPools.select(activeArgs)(store.getState()).data?.pools).toEqual([
        activePool,
      ]);
      expect(vocabularyPoolApi.endpoints.getPools.select(oldestArgs)(store.getState()).data?.pools).toEqual([
        oldestPool,
      ]);
    });

    const poolRequests = mockBaseQuery.mock.calls
      .map(([request]) => request)
      .filter((request): request is string => typeof request === 'string');
    expect(
      poolRequests.slice(-3).every(url => !new URL(url, 'https://latin.test').searchParams.has('lastPoolId'))
    ).toBe(true);
  });

  it('waits for an in-flight pagination request before refreshing from page one', async () => {
    const store = createStore();
    const oldestArgs = { filters: { sortBy: 'createdAt' as const, sortOrder: 'asc' as const }, lastPoolId: null };
    await store.dispatch(vocabularyPoolApi.endpoints.getPools.initiate(oldestArgs, { subscribe: false }));
    deferOldestTail = true;
    const tailRequest = store.dispatch(
      vocabularyPoolApi.endpoints.getPools.initiate({ ...oldestArgs, lastPoolId: 'oldest-pool' }, { subscribe: false })
    );
    await waitFor(() => expect(releaseOldestTail).toBeDefined());

    const mutation = mutate(store);
    const requestsBeforeTailCompletes = mockBaseQuery.mock.calls
      .map(([request]) => request)
      .filter((request): request is string => typeof request === 'string');
    expect(requestsBeforeTailCompletes).toHaveLength(2);

    releaseOldestTail!();
    await tailRequest;
    await mutation;
    await waitFor(() => {
      expect(vocabularyPoolApi.endpoints.getPools.select(oldestArgs)(store.getState()).data?.pools).toEqual([
        oldestPool,
      ]);
    });
  });

  it('refreshes a pending first search without delaying already-cached lists', async () => {
    let copied = false;
    let releaseFirstSearch!: () => void;
    const searchRequests: URL[] = [];
    mockBaseQuery.mockImplementation(async (request: unknown) => {
      if (typeof request !== 'string') {
        copied = true;
        return { data: { success: true, data: { pool: copiedPool } } };
      }

      const url = new URL(request, 'https://latin.test');
      if (url.searchParams.has('search')) {
        searchRequests.push(url);
        // Capture the server result before the mutation, but delay delivery
        // until after creation succeeds and its cache refresh has started.
        const response = poolsResponse(copied ? [copiedPool] : []);
        if (searchRequests.length === 1) {
          await new Promise<void>(resolve => {
            releaseFirstSearch = resolve;
          });
        }
        return response;
      }
      return poolsResponse(copied ? [copiedPool, activePool] : [activePool]);
    });

    const store = createStore();
    const cachedArgs = { filters: { sortBy: 'createdAt' as const, sortOrder: 'desc' as const }, lastPoolId: null };
    const searchArgs = {
      filters: { search: 'copied', sortBy: 'name' as const, sortOrder: 'asc' as const },
      lastPoolId: null,
    };
    await store.dispatch(vocabularyPoolApi.endpoints.getPools.initiate(cachedArgs, { subscribe: false }));
    const firstSearch = store.dispatch(vocabularyPoolApi.endpoints.getPools.initiate(searchArgs));

    try {
      await waitFor(() => expect(releaseFirstSearch).toBeDefined());
      await mutate(store).unwrap();

      await waitFor(() => {
        expect(vocabularyPoolApi.endpoints.getPools.select(cachedArgs)(store.getState()).data?.pools).toEqual([
          copiedPool,
          activePool,
        ]);
      });
      expect(searchRequests).toHaveLength(1);
      expect(vocabularyPoolApi.endpoints.getPools.select(searchArgs)(store.getState()).status).toBe('pending');

      releaseFirstSearch();
      await firstSearch;
      await waitFor(() => {
        expect(vocabularyPoolApi.endpoints.getPools.select(searchArgs)(store.getState()).data?.pools).toEqual([
          copiedPool,
        ]);
      });
      expect(searchRequests).toHaveLength(2);
      expect(searchRequests[1].search).toBe(searchRequests[0].search);
      expect(searchRequests[1].searchParams.has('lastPoolId')).toBe(false);
    } finally {
      releaseFirstSearch?.();
      firstSearch.unsubscribe();
      store.dispatch(vocabularyPoolApi.util.resetApiState());
    }
  });
});

it('refreshes dependent pool detail, summaries and student playback after a source changes', async () => {
  const store = createStore();
  let changed = false;
  mockBaseQuery.mockImplementation(async (request: unknown) => {
    if (typeof request !== 'string') {
      changed = true;
      return { data: { success: true, data: { pool: copiedPool } } };
    }
    const count = changed ? 2 : 1;
    const pool = {
      ...copiedPool,
      id: 'combined',
      wordDocIds: changed ? ['a', 'b'] : ['a'],
      words: [],
      metadata: { ...copiedPool.metadata, wordCount: count },
    };
    if (request.includes('/pos-summary') || request.includes('/paradigm-summary'))
      return { data: { success: true, data: { totalWords: count } } };
    if (request.startsWith('/vocabulary-pools/'))
      return {
        data: {
          success: true,
          data: {
            id: 'combined',
            name: 'Combined',
            items: changed ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'a' }],
            hasMore: false,
            nextOffset: count,
          },
        },
      };
    return { data: { success: true, data: { pool } } };
  });
  const detail = store.dispatch(vocabularyPoolApi.endpoints.getPool.initiate('combined'));
  const summary = store.dispatch(vocabularyPoolApi.endpoints.getPoolSummary.initiate('combined'));
  const pos = store.dispatch(vocabularyPoolApi.endpoints.getPoolPOSSummary.initiate('combined'));
  const paradigm = store.dispatch(vocabularyPoolApi.endpoints.getPoolParadigmSummary.initiate('combined'));
  const student = store.dispatch(vocabularyPoolApi.endpoints.getStudentPool.initiate('combined'));
  try {
    await Promise.all([detail, summary, pos, paradigm, student]);
    await store
      .dispatch(vocabularyPoolApi.endpoints.updatePool.initiate({ id: 'source', data: { wordDocIds: ['a', 'b'] } }))
      .unwrap();
    await waitFor(() => {
      const state = store.getState();
      expect(vocabularyPoolApi.endpoints.getPool.select('combined')(state).data?.wordDocIds).toEqual(['a', 'b']);
      expect(vocabularyPoolApi.endpoints.getPoolSummary.select('combined')(state).data?.metadata.wordCount).toBe(2);
      expect(vocabularyPoolApi.endpoints.getPoolPOSSummary.select('combined')(state).data?.totalWords).toBe(2);
      expect(vocabularyPoolApi.endpoints.getPoolParadigmSummary.select('combined')(state).data?.totalWords).toBe(2);
      expect(vocabularyPoolApi.endpoints.getStudentPool.select('combined')(state).data?.items).toHaveLength(2);
    });
  } finally {
    [detail, summary, pos, paradigm, student].forEach(query => query.unsubscribe());
    store.dispatch(vocabularyPoolApi.util.resetApiState());
  }
});
