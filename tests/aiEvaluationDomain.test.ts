import {
  calculateProfileCost,
  calculateModelCost,
  calculateTokenUsageCost,
  normalizeOpenAIUsage,
  parseOpenAIUsage,
  TRANSLATION_GRADING_PROFILES,
} from '@/shared/openai/model-registry';
import { createEvaluationCacheKey } from '@/src/lib/ai-evaluations/cache-key';
import { evaluationCaseInputSchema } from '@/src/lib/ai-evaluations/contracts';

describe('AI evaluation pricing and cache contracts', () => {
  it('separates ordinary, cached, cache-write, output, and reasoning usage', () => {
    const usage = {
      input_tokens: 1_000,
      output_tokens: 500,
      total_tokens: 1_500,
      input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
      output_tokens_details: { reasoning_tokens: 120 },
    };

    expect(normalizeOpenAIUsage(usage)).toEqual({
      promptTokens: 1_000,
      completionTokens: 500,
      totalTokens: 1_500,
      ordinaryInputTokens: 700,
      cachedInputTokens: 200,
      cacheWriteTokens: 100,
      reasoningTokens: 120,
    });

    const cost = calculateProfileCost(usage, TRANSLATION_GRADING_PROFILES.candidate);
    expect(cost.tokens.reasoningTokens).toBe(120);
    expect(cost.inputCost).toBeCloseTo((700 * 0.2 + 200 * 0.02 + 100 * 0.25) / 1_000_000);
    expect(cost.outputCost).toBeCloseTo((500 * 1.2) / 1_000_000);
    expect(cost.totalCost).toBeCloseTo(cost.inputCost + cost.outputCost);
    expect(cost.pricingVersion).toBe('2026-08-01');
  });

  it('rejects malformed or inconsistent provider usage instead of billing zeroes', () => {
    expect(parseOpenAIUsage({ input_tokens: -1, output_tokens: 20, total_tokens: 19 })).toBeUndefined();
    expect(
      parseOpenAIUsage({
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
        input_tokens_details: { cached_tokens: 11 },
      })
    ).toBeUndefined();
    expect(
      parseOpenAIUsage({
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 99,
      })
    ).toBeUndefined();
  });

  it('treats GPT-5.4-mini cache writes as ordinary input pricing', () => {
    const cost = calculateProfileCost(
      {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_tokens_details: { cached_tokens: 40, cache_write_tokens: 30 },
      },
      TRANSLATION_GRADING_PROFILES.baseline
    );

    expect(cost.inputCost).toBeCloseTo((30 * 0.75 + 40 * 0.075 + 30 * 0.75) / 1_000_000);
    expect(cost.tokens.ordinaryInputTokens).toBe(30);
  });

  it('prices all prompt tokens as ordinary input when optional usage details are absent', () => {
    const cost = calculateTokenUsageCost(
      { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      TRANSLATION_GRADING_PROFILES.baseline.pricing
    );

    expect(cost.inputCost).toBeCloseTo((100 * 0.75) / 1_000_000);
    expect(cost.outputCost).toBeCloseTo((20 * 4.5) / 1_000_000);
  });

  it('does not silently apply baseline pricing to an unknown model', () => {
    expect(
      calculateModelCost({ input_tokens: 100, output_tokens: 20, total_tokens: 120 }, 'future-model')
    ).toBeUndefined();
  });

  it('invalidates deterministic cache keys when version or model inputs change', () => {
    const base = {
      direction: 'latin-to-english' as const,
      sourceText: 'Gallia est omnis divisa in partes tres.',
      answerText: 'All Gaul is divided into three parts.',
      model: 'gpt-5.4-mini',
      reasoningEffort: 'low' as const,
      promptVersion: 'translation-grading-v2',
      profileVersion: 'translation-grading-v2:baseline',
      schemaVersion: 'ai-translation-evaluation-v1',
    };

    expect(createEvaluationCacheKey(base)).toBe(createEvaluationCacheKey({ ...base }));
    expect(createEvaluationCacheKey(base)).not.toBe(
      createEvaluationCacheKey({ ...base, promptVersion: 'translation-grading-v3' })
    );
    expect(createEvaluationCacheKey(base)).not.toBe(
      createEvaluationCacheKey({ ...base, profileVersion: 'translation-grading-v2:baseline-reasoning-high' })
    );
    expect(createEvaluationCacheKey(base)).not.toBe(
      createEvaluationCacheKey({ ...base, model: 'gpt-5.6-luna', reasoningEffort: 'high' })
    );
  });

  it('rejects unknown fields and duplicate answer ids', () => {
    const invalid = evaluationCaseInputSchema.safeParse({
      title: 'Case',
      direction: 'latin-to-english',
      sourceText: 'Gallia est omnis divisa.',
      answers: [
        { id: 'one', label: 'A', text: 'Gaul is divided.' },
        { id: 'one', label: 'B', text: 'Gaul is split.' },
      ],
      model: 'gpt-5.6-luna',
    });

    expect(invalid.success).toBe(false);
  });
});
