import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { renderHook, waitFor } from '@testing-library/react';

const mockBaseQuery = jest.fn();

jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));

import { appApi } from '@/src/store/api/appApi';
import { useGetWordsQuery, vocabularyApi } from '@/src/store/api/vocabularyApi';
import { useGetStudentPoolQuery, vocabularyPoolApi } from '@/src/store/api/vocabularyPoolApi';
import { vocabularyWordRequestsApi } from '@/src/store/api/vocabularyWordRequestsApi';

const createStore = () =>
  configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }).concat(appApi.middleware),
  });

const word = (id: string, translation: string) => ({
  id,
  word: id,
  part_of_speech: 'adverb' as const,
  translation,
  definitions: [],
  etymology: null,
  pronunciation: null,
  type: 'core' as const,
  alternate_form: null,
  dictionary_entry: id,
  sort_key: id,
  random_index: 0.5,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const urlOf = (request: unknown) => (typeof request === 'string' ? request : (request as { url: string }).url);
const methodOf = (request: unknown) => (typeof request === 'string' ? 'GET' : (request as { method?: string }).method);

type MutationOutcome = { data: unknown } | { error: { status: number; data: unknown } };

/** Serves a student pool whose content changes each time it is loaded, plus one configurable word mutation. */
const serve = (mutation: MutationOutcome) => {
  let poolLoads = 0;
  mockBaseQuery.mockImplementation(async (request: unknown) => {
    const url = urlOf(request);
    if (url.startsWith('/vocabulary-pools/')) {
      poolLoads += 1;
      return {
        data: {
          success: true,
          data: { id: 'pool-1', name: 'Pool', items: [{ id: `load-${poolLoads}` }], hasMore: false, nextOffset: 1 },
        },
      };
    }
    if (methodOf(request) !== 'GET') return mutation;
    if (url.startsWith('/admin/words')) {
      return {
        data: { success: true, data: { words: [word('bene', 'well')], hasMore: false, lastWordId: null, filters: {} } },
      };
    }
    return { data: { success: true, data: { requests: [] } } };
  });
  return { poolLoads: () => poolLoads };
};

const loadStudentPool = (store: ReturnType<typeof createStore>) =>
  store.dispatch(vocabularyPoolApi.endpoints.getStudentPool.initiate('pool-1'));

beforeEach(() => mockBaseQuery.mockReset());

describe('student pool playback after a word changes', () => {
  it('reloads a loaded student pool after a word is edited', async () => {
    const store = createStore();
    const served = serve({ data: { success: true, updatedData: word('bene', 'rightly') } });
    const pool = loadStudentPool(store);
    try {
      await pool;
      await store.dispatch(
        vocabularyApi.endpoints.updateWord.initiate({ wordId: 'bene', updates: { translation: 'rightly' } })
      );
      await waitFor(() => expect(served.poolLoads()).toBe(2));
      expect(vocabularyPoolApi.endpoints.getStudentPool.select('pool-1')(store.getState()).data?.items).toEqual([
        { id: 'load-2' },
      ]);
    } finally {
      pool.unsubscribe();
    }
  });

  it('reloads a loaded student pool after a word is deleted', async () => {
    const store = createStore();
    const served = serve({ data: { success: true } });
    const pool = loadStudentPool(store);
    try {
      await pool;
      await store.dispatch(vocabularyApi.endpoints.deleteWord.initiate({ wordId: 'bene', confirmationToken: 'token' }));
      await waitFor(() => expect(served.poolLoads()).toBe(2));
    } finally {
      pool.unsubscribe();
    }
  });

  type Store = ReturnType<typeof createStore>;
  it.each([
    [
      'a failed edit',
      (store: Store) => store.dispatch(vocabularyApi.endpoints.updateWord.initiate({ wordId: 'bene', updates: {} })),
    ],
    [
      'a deletion that still needs confirmation',
      (store: Store) => store.dispatch(vocabularyApi.endpoints.deleteWord.initiate({ wordId: 'bene' })),
    ],
  ])('keeps the loaded student pool after %s', async (_name, mutate) => {
    const store = createStore();
    const served = serve({ error: { status: 409, data: { success: false, warning: true } } });
    const pool = loadStudentPool(store);
    try {
      await pool;
      await mutate(store);
      // Any invalidation would already have queued the reload by the time the mutation settled.
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(served.poolLoads()).toBe(1);
    } finally {
      pool.unsubscribe();
    }
  });
});

describe('word list edits', () => {
  it('shows an edit in every loaded word list and rolls it back when the save fails', async () => {
    const store = createStore();
    let failSave: (() => void) | undefined;
    serve({ data: null });
    const allWords = store.dispatch(vocabularyApi.endpoints.getWords.initiate({}));
    const nouns = store.dispatch(vocabularyApi.endpoints.getWords.initiate({ wordType: 'noun' }));
    try {
      await Promise.all([allWords, nouns]);
      const listRequest = mockBaseQuery.getMockImplementation()!;
      mockBaseQuery.mockImplementation((request: unknown) =>
        methodOf(request) === 'PUT'
          ? new Promise(resolve => {
              failSave = () => resolve({ error: { status: 500, data: { error: 'Failed' } } });
            })
          : listRequest(request)
      );

      const save = store.dispatch(
        vocabularyApi.endpoints.updateWord.initiate({ wordId: 'bene', updates: { translation: 'rightly' } })
      );
      const translations = () =>
        [{}, { wordType: 'noun' }].map(
          args => vocabularyApi.endpoints.getWords.select(args)(store.getState()).data?.words[0].translation
        );
      await waitFor(() => expect(failSave).toBeDefined());
      expect(translations()).toEqual(['rightly', 'rightly']);

      failSave!();
      await save;
      await waitFor(() => expect(translations()).toEqual(['well', 'well']));
    } finally {
      allWords.unsubscribe();
      nouns.unsubscribe();
    }
  });
});

describe('signing out', () => {
  it('clears vocabulary words, pools and word requests with the one application cache reset', async () => {
    const store = createStore();
    serve({ data: null });
    const queries = [
      store.dispatch(vocabularyApi.endpoints.getWords.initiate({})),
      loadStudentPool(store),
      store.dispatch(vocabularyWordRequestsApi.endpoints.getVocabularyWordRequests.initiate({})),
    ];
    await Promise.all(queries);
    expect(Object.keys(store.getState()[appApi.reducerPath].queries)).toHaveLength(3);

    queries.forEach(query => query.unsubscribe());
    store.dispatch(appApi.util.resetApiState());

    expect(store.getState()[appApi.reducerPath].queries).toEqual({});
  });
});

describe('refetch policy inside the shared cache', () => {
  it('refetches word lists when the tab regains focus but leaves a loaded student pool alone', async () => {
    const store = createStore();
    const served = serve({ data: null });
    const wordListLoads = () =>
      mockBaseQuery.mock.calls.filter(([request]) => urlOf(request).startsWith('/admin/words')).length;
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result, unmount } = renderHook(
      () => ({ words: useGetWordsQuery({}), pool: useGetStudentPoolQuery('pool-1') }),
      {
        wrapper,
      }
    );
    try {
      await waitFor(() => expect(result.current.words.isSuccess && result.current.pool.isSuccess).toBe(true));
      expect([wordListLoads(), served.poolLoads()]).toEqual([1, 1]);

      store.dispatch(appApi.internalActions.onFocus());

      await waitFor(() => expect(wordListLoads()).toBe(2));
      expect(served.poolLoads()).toBe(1);
    } finally {
      unmount();
    }
  });
});
