import { configureStore } from '@reduxjs/toolkit';
import { waitFor } from '@testing-library/react';

const mockBaseQuery = jest.fn();

jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));

import { appApi } from '@/src/store/api/appApi';
import { vocabularyApi } from '@/src/store/api/vocabularyApi';
import { vocabularyPoolApi } from '@/src/store/api/vocabularyPoolApi';

const updatedWord = {
  id: 'word-1',
  word: 'et',
  part_of_speech: 'conjunction',
  translation: 'and also',
  definitions: [],
  etymology: null,
  pronunciation: null,
  type: 'core',
  alternate_form: null,
  dictionary_entry: null,
  sort_key: 'et',
  random_index: 0.5,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
};

const createStore = () =>
  configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(appApi.middleware),
  });

const mutations = {
  update: (store: ReturnType<typeof createStore>) =>
    store.dispatch(
      vocabularyApi.endpoints.updateWord.initiate({ wordId: 'word-1', updates: { translation: 'and also' } })
    ),
  delete: (store: ReturnType<typeof createStore>) =>
    store.dispatch(vocabularyApi.endpoints.deleteWord.initiate({ wordId: 'word-1' })),
};

beforeEach(() => mockBaseQuery.mockReset());

it.each(['update', 'delete'] as const)('refreshes student pool playback after a word %s', async mutation => {
  let translation = 'and';
  mockBaseQuery.mockImplementation(async (request: unknown) => {
    if (typeof request === 'string')
      return {
        data: {
          success: true,
          data: { id: 'pool-1', name: 'Pool', items: [{ id: 'word-1', translation }], hasMore: false, nextOffset: 1 },
        },
      };
    translation = 'and also';
    return { data: { success: true, updatedData: updatedWord } };
  });
  const store = createStore();
  const student = store.dispatch(vocabularyPoolApi.endpoints.getStudentPool.initiate('pool-1'));
  const playback = () => vocabularyPoolApi.endpoints.getStudentPool.select('pool-1')(store.getState()).data?.items;

  try {
    await student;
    expect(playback()).toEqual([{ id: 'word-1', translation: 'and' }]);

    await mutations[mutation](store).unwrap();

    await waitFor(() => expect(playback()).toEqual([{ id: 'word-1', translation: 'and also' }]));
  } finally {
    student.unsubscribe();
  }
});

it('sends a word deletion confirmation token in the request body, never the URL', async () => {
  mockBaseQuery.mockResolvedValue({ data: { success: true } });

  await createStore()
    .dispatch(vocabularyApi.endpoints.deleteWord.initiate({ wordId: 'word-1', confirmationToken: 'one-time-secret' }))
    .unwrap();

  expect(mockBaseQuery.mock.calls[0][0]).toEqual({
    url: '/admin/words/word-1',
    method: 'DELETE',
    body: { confirmationToken: 'one-time-secret' },
  });
});
