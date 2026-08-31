import {
  calculateProfileCost,
  calculateModelCost,
  calculateTokenUsageCost,
  normalizeOpenAIUsage,
  OPENAI_MODEL_CATALOG,
  parseOpenAIUsage,
  TRANSLATION_GRADING_PROFILES,
} from '@/shared/openai/model-registry';
import { createEvaluationCacheKey } from '@/src/lib/ai-evaluations/cache-key';
import { createTranslationGradingBehaviorFingerprint } from '@/shared/openai/translation-grading-fingerprint';
import { getTranslationGradingTask } from '@/shared/openai/translation-grading-tasks';
import { evaluationCaseInputSchema, missingEvaluationCriteria } from '@/src/lib/ai-evaluations/contracts';
import { parseEvaluationCaseSnapshot } from '@/src/lib/ai-evaluations/persistence';

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
      gradingMode: 'lesson' as const,
      profileId: 'baseline',
      model: 'gpt-5.4-mini',
      reasoningEffort: 'low' as const,
      behaviorFingerprint: 'behavior-a',
      schemaVersion: 'ai-translation-evaluation-v3',
    };

    expect(createEvaluationCacheKey(base)).toBe(createEvaluationCacheKey({ ...base }));
    expect(createEvaluationCacheKey(base)).not.toBe(
      createEvaluationCacheKey({ ...base, behaviorFingerprint: 'behavior-b' })
    );
    expect(createEvaluationCacheKey(base)).not.toBe(
      createEvaluationCacheKey({ ...base, model: 'gpt-5.6-luna', reasoningEffort: 'high' })
    );
    expect(createEvaluationCacheKey(base)).not.toBe(createEvaluationCacheKey({ ...base, gradingMode: 'test' }));
    expect(createEvaluationCacheKey(base)).not.toBe(createEvaluationCacheKey({ ...base, profileId: 'candidate' }));
  });

  it('derives behavior fingerprints from prompts, schemas, and execution profiles', () => {
    const task = getTranslationGradingTask('lesson');
    const profile = TRANSLATION_GRADING_PROFILES.baseline;
    const fingerprint = createTranslationGradingBehaviorFingerprint(task, profile);

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(createTranslationGradingBehaviorFingerprint(task, profile)).toBe(fingerprint);
    expect(
      createTranslationGradingBehaviorFingerprint({ ...task, systemPrompt: `${task.systemPrompt}\nChanged.` }, profile)
    ).not.toBe(fingerprint);
    expect(createTranslationGradingBehaviorFingerprint(task, TRANSLATION_GRADING_PROFILES.candidateLow)).not.toBe(
      fingerprint
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

  it('requires grading modes for callers and persisted cases', () => {
    const input = {
      title: 'Case',
      direction: 'latin-to-english' as const,
      sourceText: 'Gallia est omnis divisa.',
      answers: [{ id: 'one', label: 'A', text: 'Gaul is divided.' }],
    };
    expect(evaluationCaseInputSchema.safeParse(input).success).toBe(false);
    expect(() =>
      parseEvaluationCaseSnapshot({
        exists: true,
        id: 'case-without-modes',
        data: () => ({
          ...input,
          createdAt: '2026-08-01T00:00:00.000Z',
          createdBy: 'admin',
          updatedAt: '2026-08-01T00:00:00.000Z',
          updatedBy: 'admin',
        }),
      } as never)
    ).toThrow('contains invalid persisted data');
  });

  it('resolves every grading profile from its catalog model', () => {
    for (const profile of Object.values(TRANSLATION_GRADING_PROFILES)) {
      const model = OPENAI_MODEL_CATALOG[profile.modelId];
      expect(profile.model).toBe(model.model);
      expect(profile.pricing).toBe(model.pricing);
      expect(profile.label).toContain(model.label);
    }
  });

  it('canonicalizes evaluation modes and rejects duplicates', () => {
    const input = {
      title: 'Case',
      direction: 'latin-to-english' as const,
      sourceText: 'Gallia est omnis divisa.',
      answers: [{ id: 'one', label: 'A', text: 'Gaul is divided.' }],
    };
    expect(evaluationCaseInputSchema.parse({ ...input, modes: ['test', 'lesson'] }).modes).toEqual(['lesson', 'test']);
    expect(evaluationCaseInputSchema.safeParse({ ...input, modes: ['lesson', 'lesson'] }).success).toBe(false);
  });

  it('requires explicit per-mode expectations before a case can run', () => {
    const input = evaluationCaseInputSchema.parse({
      title: 'Case',
      direction: 'latin-to-english',
      sourceText: 'Gallia est omnis divisa.',
      answers: [{ id: 'one', label: 'A', text: 'Gaul is divided.', expectations: {} }],
      modes: ['lesson', 'test'],
    });

    expect(missingEvaluationCriteria(input)).toEqual(['A: expected lesson pass/fail', 'A: expected test score range']);
    expect(
      evaluationCaseInputSchema.safeParse({
        ...input,
        answers: [
          {
            ...input.answers[0],
            expectations: { lesson: { passing: true }, test: { minScore: 9, maxScore: 8 } },
          },
        ],
      }).success
    ).toBe(false);
  });
});
