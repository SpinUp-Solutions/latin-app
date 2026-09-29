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

  const exercise = {
    type: 'generated-translation' as const,
    data: {
      generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters' as const, count: 1 },
      posConfigs: { noun: { enabled: true, filters: {} } },
    },
  };

  it.each([
    [
      'lesson playback through the student endpoint',
      { kind: 'lesson' as const, lessonId: 'lesson-1', pageIndex: 2, itemIndex: 3, exerciseId: 'exercise-1' },
      {
        url: '/words/generated-exercise',
        body: { lessonId: 'lesson-1', pageIndex: 2, itemIndex: 3, exerciseId: 'exercise-1' },
      },
    ],
    [
      'admin previews through the admin endpoint',
      { kind: 'admin-preview' as const },
      { url: '/admin/exercises/generated-preview', body: exercise },
    ],
  ])('loads server-resolved questions for %s', async (_, source, request) => {
    const items = [{ text: 'amo', acceptedAnswers: ['love'] }];
    mockBaseQuery.mockResolvedValue({ data: { items } });
    const store = createStore();

    const result = await store.dispatch(
      advancedVocabularyApi.endpoints.getGeneratedExerciseItems.initiate({ exercise, source })
    );

    expect(result.data).toEqual({ items });
    expect(mockBaseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ ...request, method: 'POST' }),
      expect.anything(),
      undefined
    );
  });
});
