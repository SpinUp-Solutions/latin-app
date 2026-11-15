import { runVocabularyAutocomplete } from '@/shared/openai/autocomplete';
import {
  getCachedVocabularyResult,
  setCachedVocabularyResult,
} from '@/src/lib/vocabulary-autocomplete-evaluations/cache';
import type { VocabularyEvaluationCase } from '@/src/lib/vocabulary-autocomplete-evaluations/contracts';
import {
  countVocabularyEvaluationCells,
  runVocabularyEvaluationCase,
} from '@/src/lib/vocabulary-autocomplete-evaluations/execution';

jest.mock('@/shared/openai/autocomplete', () => ({ runVocabularyAutocomplete: jest.fn() }));
jest.mock('@/src/lib/vocabulary-autocomplete-evaluations/cache', () => ({
  createVocabularyCacheKey: jest.fn((profile: { model: string }, word: string) => `${profile.model}:${word}`),
  getCachedVocabularyResult: jest.fn(),
  setCachedVocabularyResult: jest.fn(),
}));

const mockedRun = jest.mocked(runVocabularyAutocomplete);
const mockedGetCached = jest.mocked(getCachedVocabularyResult);
const mockedSetCached = jest.mocked(setCachedVocabularyResult);
const db = {} as never;

const evaluationCase: VocabularyEvaluationCase = {
  id: 'case-1',
  title: 'Verbs',
  entries: [{ id: 'fero', word: 'ferō', partOfSpeech: 'verb' }],
  createdAt: '2026-11-13T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2026-11-13T00:00:00.000Z',
  updatedBy: 'admin',
};
const usage = { promptTokens: 1_000, completionTokens: 9_000, totalTokens: 10_000, ordinaryInputTokens: 1_000 };
const cost = (totalCost: number) => ({ inputCost: 0, outputCost: totalCost, totalCost, tokens: usage });

describe('vocabulary autocomplete evaluation run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetCached.mockResolvedValue(null);
  });

  it('autocompletes each word with both profiles and keeps a token-budget failure with its cost', async () => {
    mockedRun.mockImplementation(async (_request, profileId) =>
      profileId === 'baseline'
        ? {
            success: true,
            structured: { principal_parts: [] },
            requestedModel: 'gpt-5.4-mini',
            model: 'gpt-5.4-mini',
            maxOutputTokens: 32_000,
            usage,
            cost: cost(0.04),
            latencyMs: 30_000,
          }
        : {
            success: false,
            code: 'token-budget',
            error: 'OpenAI started the vocabulary JSON but did not finish it.',
            incompleteReason: 'max_output_tokens',
            requestedModel: 'gpt-6.1-terra',
            model: 'gpt-6.1-terra',
            maxOutputTokens: 32_000,
            usage,
            cost: cost(0.16),
            latencyMs: 200_000,
          }
    );

    const result = await runVocabularyEvaluationCase(evaluationCase, false, db);

    expect(countVocabularyEvaluationCells(evaluationCase)).toBe(2);
    expect(mockedRun.mock.calls.map(([request, profileId, options]) => [request, profileId, options])).toEqual([
      [{ word: 'ferō', part_of_speech: 'verb' }, 'baseline', { timeout: 450_000, maxRetries: 0 }],
      [{ word: 'ferō', part_of_speech: 'verb' }, 'candidate', { timeout: 450_000, maxRetries: 0 }],
    ]);
    expect(result.cells[1]).toMatchObject({
      profileId: 'candidate',
      reasoningEffort: 'medium',
      errorCode: 'token-budget',
      incompleteReason: 'max_output_tokens',
      costThisRun: { totalCost: 0.16 },
    });
    expect(result.cells[1].output).toBeUndefined();
    // Only the successful result is cached.
    expect(mockedSetCached).toHaveBeenCalledTimes(1);
    expect(mockedSetCached.mock.calls[0][0]).toBe('gpt-5.4-mini:ferō');
  });

  it('reuses a cached result at no cost this run and reprices it from stored usage', async () => {
    mockedGetCached.mockImplementation(async key =>
      key === 'gpt-6.1-terra:ferō'
        ? {
            model: 'gpt-6.1-terra',
            actualModel: 'gpt-6.1-terra',
            output: { principal_parts: [] },
            usage,
            latencyMs: 90_000,
            generatedAt: '2026-11-12T00:00:00.000Z',
          }
        : null
    );
    mockedRun.mockResolvedValue({
      success: true,
      structured: {},
      requestedModel: 'gpt-5.4-mini',
      maxOutputTokens: 32_000,
      latencyMs: 10,
    });

    const result = await runVocabularyEvaluationCase(evaluationCase, false, db);
    const cached = result.cells.find(cell => cell.profileId === 'candidate')!;

    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(cached.appCacheHit).toBe(true);
    expect(cached.costThisRun?.totalCost).toBe(0);
    // 1,000 input at $1/M plus 9,000 output at $5/M.
    expect(cached.cost?.totalCost).toBeCloseTo(0.046, 12);
    expect(cached.generationLatencyMs).toBe(90_000);
  });

  it('skips the cache when forced', async () => {
    mockedRun.mockResolvedValue({
      success: true,
      structured: {},
      requestedModel: 'gpt-5.4-mini',
      maxOutputTokens: 32_000,
      latencyMs: 10,
    });

    await runVocabularyEvaluationCase(evaluationCase, true, db);

    expect(mockedGetCached).not.toHaveBeenCalled();
    expect(mockedRun).toHaveBeenCalledTimes(2);
  });
});
