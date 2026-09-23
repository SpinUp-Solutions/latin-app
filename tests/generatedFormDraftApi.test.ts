import { configureStore } from '@reduxjs/toolkit';
import { waitFor } from '@testing-library/react';
import { advancedVocabularyApi, type GeneratedExerciseWordsQueryArgs } from '@/src/store/api/advancedVocabularyApi';

const mockBaseQuery = jest.fn();
jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));

const queryArgs: GeneratedExerciseWordsQueryArgs = {
  exercise: {
    type: 'generated-form-identification',
    data: {
      mode: 'single-field',
      generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count: 2 },
      paradigmConfigs: {},
    },
  },
  source: {
    kind: 'lesson',
    lessonId: 'lesson-1',
    lessonVersion: 36,
    pageIndex: 11,
    itemIndex: 0,
    exerciseId: 'form-1',
  },
};

it('keeps the real RTK query cache in sync after saving and resetting a draft', async () => {
  mockBaseQuery.mockImplementation(async ({ method }: { method?: string }) => {
    if (method === 'PUT') return { data: { draftAnswers: { 'word-1': 'present' } } };
    if (method === 'DELETE') return { data: { draftAnswers: {} } };
    return {
      data: {
        words: [],
        draftItems: [],
        draftAnswers: {},
        diagnostics: [],
        requestedCount: 2,
        collected: 2,
        globalScanLimitReached: false,
      },
    };
  });
  const store = configureStore({
    reducer: { [advancedVocabularyApi.reducerPath]: advancedVocabularyApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(advancedVocabularyApi.middleware),
  });

  await store.dispatch(advancedVocabularyApi.endpoints.getGeneratedExerciseWords.initiate(queryArgs)).unwrap();
  expect(mockBaseQuery.mock.calls[0][0]).toEqual({ url: '/lesson-exercise-drafts/lesson-1/form-1' });

  await store
    .dispatch(
      advancedVocabularyApi.endpoints.saveGeneratedFormDraft.initiate({
        queryArgs,
        itemId: 'word-1',
        answer: 'present',
      })
    )
    .unwrap();
  await waitFor(() =>
    expect(
      advancedVocabularyApi.endpoints.getGeneratedExerciseWords.select(queryArgs)(store.getState()).data?.draftAnswers
    ).toEqual({ 'word-1': 'present' })
  );

  await store.dispatch(advancedVocabularyApi.endpoints.resetGeneratedFormDraft.initiate(queryArgs)).unwrap();
  await waitFor(() =>
    expect(
      advancedVocabularyApi.endpoints.getGeneratedExerciseWords.select(queryArgs)(store.getState()).data?.draftAnswers
    ).toEqual({})
  );
  if (queryArgs.source.kind !== 'lesson') throw new Error('Expected a lesson source');
  const revisedArgs: GeneratedExerciseWordsQueryArgs = {
    ...queryArgs,
    source: { ...queryArgs.source, lessonVersion: 37 },
  };
  await store.dispatch(advancedVocabularyApi.endpoints.getGeneratedExerciseWords.initiate(revisedArgs)).unwrap();
  expect(mockBaseQuery.mock.calls.map(call => call[0].method ?? 'GET')).toEqual(['GET', 'PUT', 'DELETE', 'GET']);
  store.dispatch(advancedVocabularyApi.util.resetApiState());
});
