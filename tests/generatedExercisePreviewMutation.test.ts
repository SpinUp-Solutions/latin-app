const mockBaseQuery = jest.fn();

jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));

import { configureStore } from '@reduxjs/toolkit';
import { advancedVocabularyApi } from '@/src/store/api/advancedVocabularyApi';

const createStore = () =>
  configureStore({
    reducer: { [advancedVocabularyApi.reducerPath]: advancedVocabularyApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(advancedVocabularyApi.middleware),
  });

describe('generated exercise preview mutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the draft body to the dedicated preview endpoint', async () => {
    mockBaseQuery.mockResolvedValue({
      data: {
        words: [{ id: 'noun-1' }],
        diagnostics: [{ specId: 'noun', collected: 1, scanned: 1, exhausted: true, scanLimitReached: false }],
        requestedCount: 10,
        collected: 1,
        globalScanLimitReached: false,
      },
    });
    const store = createStore();
    const body = {
      type: 'generated-translation' as const,
      data: {
        generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters' as const, count: 10 },
        posConfigs: { noun: { enabled: true, filters: {} } },
      },
    };

    const result = await store.dispatch(advancedVocabularyApi.endpoints.previewGeneratedExercise.initiate(body));

    expect('data' in result && result.data?.collected).toBe(1);
    expect(mockBaseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/admin/exercises/generated-preview',
        method: 'POST',
        body,
      }),
      expect.anything(),
      undefined
    );
  });

  it('posts lesson playback collection through the student collector endpoint', async () => {
    mockBaseQuery.mockResolvedValue({
      data: {
        words: [{ id: 'noun-1' }],
        diagnostics: [{ specId: 'noun', collected: 1, scanned: 1, exhausted: true, scanLimitReached: false }],
        requestedCount: 10,
        collected: 1,
        globalScanLimitReached: false,
      },
    });
    const store = createStore();
    const body = {
      type: 'generated-translation' as const,
      data: {
        generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters' as const, count: 10 },
        posConfigs: { noun: { enabled: true, filters: {} } },
      },
    };

    const result = await store.dispatch(advancedVocabularyApi.endpoints.getGeneratedExerciseWords.initiate(body));

    expect('data' in result && result.data?.collected).toBe(1);
    expect(mockBaseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/words/generated-exercise',
        method: 'POST',
        body,
      }),
      expect.anything(),
      undefined
    );
  });
});
