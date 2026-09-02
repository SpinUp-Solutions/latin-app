import {
  getCachedEvaluationResult,
  getEvaluationCacheExpiry,
  setCachedEvaluationResult,
} from '@/src/lib/ai-evaluations/cache';

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromMillis: (value: number) => ({ toMillis: () => value }) },
}));

describe('AI evaluation cache', () => {
  it('round-trips derived lesson output through the Firestore cache', async () => {
    const values = new Map<string, Record<string, unknown>>();
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          set: async (value: Record<string, unknown>) => values.set(`${name}/${id}`, value),
          get: async () => ({
            exists: values.has(`${name}/${id}`),
            data: () => values.get(`${name}/${id}`),
            ref: { delete: async () => values.delete(`${name}/${id}`) },
          }),
        }),
      }),
    };
    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
    const output = {
      feedbackLevel: 'Good' as const,
      notes: 'Good work.',
      suggestedText: 'All Gaul is divided.',
      breakdown: [],
      grammaticalBreakdown: [],
      isPassing: true,
    };

    await setCachedEvaluationResult(
      {
        cacheKey: 'lesson-key',
        gradingMode: 'lesson',
        model: 'gpt-5.4-mini',
        actualModel: 'gpt-5.4-mini-2026-08-01',
        output,
        usage,
        cost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03, tokens: usage },
        latencyMs: 100,
        generatedAt: new Date().toISOString(),
        expiresAt: getEvaluationCacheExpiry(),
      },
      db as never
    );

    await expect(getCachedEvaluationResult('lesson-key', 'lesson', db as never)).resolves.toMatchObject({
      output,
    });
  });
});
