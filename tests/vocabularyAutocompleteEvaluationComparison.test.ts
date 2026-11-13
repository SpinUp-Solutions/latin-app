import {
  compareEntryForms,
  formAgreement,
  summarizeVocabularyRun,
} from '@/src/lib/vocabulary-autocomplete-evaluations/comparison';
import type { VocabularyEvaluationCell } from '@/src/lib/vocabulary-autocomplete-evaluations/contracts';

describe('vocabulary autocomplete form comparison', () => {
  it('classifies forms as same, macrons only, one model only or different', () => {
    expect(formAgreement(['amō'], ['amō'])).toBe('same');
    expect(formAgreement(['amāris', 'amāre'], ['amāre', 'amāris'])).toBe('same');
    expect(formAgreement(['amō'], ['amo'])).toBe('macrons');
    expect(formAgreement(['amō'], [])).toBe('missing');
    expect(formAgreement(['amō'], ['amāvī'])).toBe('different');
    expect(formAgreement([], [])).toBeNull();
  });

  it('compares grammar form by form, skips prose and forms neither model filled', () => {
    const first = {
      translation: 'to love',
      definitions: ['to love', 'to like'],
      principal_parts: [
        { full_form: 'amō', shortened_form: 'amō' },
        { full_form: 'amāre', shortened_form: '-āre' },
      ],
      conjugation_table: {
        indicative: { active: { present: { singular: { first: ['amō'], second: ['amās'], third: null } } } },
      },
      is_deponent: false,
    };
    const second = {
      translation: 'love',
      definitions: ['to be fond of'],
      principal_parts: [
        { full_form: 'amo', shortened_form: 'amo' },
        { full_form: 'amāre', shortened_form: '-āre' },
      ],
      conjugation_table: {
        indicative: { active: { present: { singular: { first: ['amō'], second: ['amat'], third: null } } } },
      },
      is_deponent: null,
    };

    const { rows, counts } = compareEntryForms(first, second);

    expect(rows.map(row => row.field)).not.toContain('translation');
    expect(rows.map(row => row.field)).not.toContain('definitions');
    expect(counts).toEqual({ same: 3, macrons: 2, missing: 1, different: 1, total: 7 });
    expect(rows.find(row => row.agreement === 'different')).toMatchObject({
      field: 'conjugation_table',
      path: ['indicative', 'active', 'present', 'singular', 'second'],
      values: [['amās'], ['amat']],
    });
    expect(rows.find(row => row.agreement === 'missing')).toMatchObject({
      field: 'is_deponent',
      values: [['false'], []],
    });
  });
});

describe('vocabulary autocomplete run summary', () => {
  const cell = (
    profileId: 'baseline' | 'candidate',
    entryId: string,
    overrides: Partial<VocabularyEvaluationCell> = {}
  ): VocabularyEvaluationCell => ({
    entryId,
    word: entryId,
    partOfSpeech: 'verb',
    profileId,
    requestedModel: profileId === 'baseline' ? 'gpt-5.4-mini' : 'gpt-6.1-terra',
    reasoningEffort: profileId === 'baseline' ? 'low' : 'medium',
    maxOutputTokens: 32_000,
    output: { conjugation: '1st' },
    generationLatencyMs: profileId === 'baseline' ? 20_000 : 40_000,
    appCacheHit: false,
    usage: { promptTokens: 2_000, completionTokens: 8_000, totalTokens: 10_000, reasoningTokens: 1_000 },
    cost: {
      inputCost: 0,
      outputCost: 0,
      totalCost: profileId === 'baseline' ? 0.04 : 0.1,
      tokens: { promptTokens: 2_000, completionTokens: 8_000, totalTokens: 10_000 },
    },
    ...overrides,
  });

  it('compares speed and cost on words both models completed and reports token exhaustion', () => {
    const summary = summarizeVocabularyRun(
      [
        cell('baseline', 'amo'),
        cell('candidate', 'amo'),
        cell('baseline', 'fero'),
        cell('candidate', 'fero', {
          output: undefined,
          error: 'OpenAI started the vocabulary JSON but did not finish it.',
          errorCode: 'token-budget',
          usage: { promptTokens: 2_000, completionTokens: 32_000, totalTokens: 34_000, reasoningTokens: 20_000 },
        }),
      ],
      ['baseline', 'candidate']
    );

    expect(summary).toMatchObject({ entryCount: 2, comparedCount: 1, costComparedCount: 1, identicalEntries: 1 });
    expect(summary.cheaper?.profileId).toBe('baseline');
    expect(summary.cheaper?.ratio).toBeCloseTo(2.5, 12);
    expect(summary.faster).toEqual({ profileId: 'baseline', ratio: 2 });
    expect(summary.figures[1]).toMatchObject({
      completed: 1,
      failed: 1,
      tokenBudgetFailures: 1,
      peakOutputShare: 1,
      peakOutputWord: 'fero',
    });
    expect(summary.figures[0].peakOutputShare).toBeCloseTo(0.25, 12);
  });
});
