import { compareProfiles, gradeAgreement } from '@/src/lib/ai-evaluations/comparison';
import type { EvaluationCellResult } from '@/src/lib/ai-evaluations/contracts';

type CellOptions = {
  answerId?: string;
  profileId: 'baseline' | 'candidate';
  score?: number;
  feedbackLevel?: 'Excellent' | 'Very good' | 'Good' | 'Adequate' | 'Not quite right';
  latencyMs?: number;
  generationLatencyMs?: number;
  cost?: number;
  error?: string;
  duplicateWithinRun?: boolean;
};

const cell = ({
  answerId = 'a1',
  profileId,
  score,
  feedbackLevel,
  latencyMs = 5,
  generationLatencyMs,
  cost,
  error,
  duplicateWithinRun = false,
}: CellOptions): EvaluationCellResult => {
  const base = {
    answerId,
    answerLabel: answerId,
    profileId,
    requestedModel: profileId,
    reasoningEffort: 'low' as const,
    error,
    latencyMs,
    generationLatencyMs,
    cacheStatus: 'fresh-api' as const,
    appCacheHit: false,
    openAIPromptCacheHit: false,
    coalescedDuplicate: false,
    duplicateWithinRun,
    originalCostStatus: cost === undefined ? ('unavailable' as const) : ('measured' as const),
    originalCost:
      cost === undefined
        ? undefined
        : {
            inputCost: 0,
            outputCost: cost,
            totalCost: cost,
            tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          },
    costIncurredThisRunStatus: 'measured' as const,
  };
  if (feedbackLevel) {
    return {
      ...base,
      gradingMode: 'lesson',
      output: error
        ? undefined
        : { feedbackLevel, isPassing: true, notes: '', suggestedText: '', breakdown: [], grammaticalBreakdown: [] },
    };
  }
  return { ...base, gradingMode: 'test', output: error ? undefined : { score: score ?? 0, feedback: '' } };
};

describe('gradeAgreement', () => {
  it('compares lesson feedback levels by distance', () => {
    const excellent = cell({ profileId: 'baseline', feedbackLevel: 'Excellent' });
    expect(gradeAgreement(excellent, cell({ profileId: 'candidate', feedbackLevel: 'Excellent' }))).toBe('same');
    expect(gradeAgreement(excellent, cell({ profileId: 'candidate', feedbackLevel: 'Very good' }))).toBe('close');
    expect(gradeAgreement(excellent, cell({ profileId: 'candidate', feedbackLevel: 'Good' }))).toBe('different');
  });

  it('treats test scores within one point as close', () => {
    const eight = cell({ profileId: 'baseline', score: 8 });
    expect(gradeAgreement(eight, cell({ profileId: 'candidate', score: 8 }))).toBe('same');
    expect(gradeAgreement(eight, cell({ profileId: 'candidate', score: 9 }))).toBe('close');
    expect(gradeAgreement(eight, cell({ profileId: 'candidate', score: 6.5 }))).toBe('different');
  });

  it('returns null when either model failed', () => {
    expect(
      gradeAgreement(cell({ profileId: 'baseline', score: 8 }), cell({ profileId: 'candidate', error: 'Timed out' }))
    ).toBeNull();
  });
});

describe('compareProfiles', () => {
  it('reports how much faster and cheaper the leader is on answers both models graded', () => {
    const comparison = compareProfiles(
      [
        cell({
          answerId: 'a1',
          profileId: 'baseline',
          score: 8,
          generationLatencyMs: 1_000,
          latencyMs: 2,
          cost: 0.004,
        }),
        cell({ answerId: 'a1', profileId: 'candidate', score: 8, generationLatencyMs: 3_000, cost: 0.001 }),
        cell({ answerId: 'a2', profileId: 'baseline', score: 9, generationLatencyMs: 1_000, cost: 0.004 }),
        cell({ answerId: 'a2', profileId: 'candidate', score: 5, generationLatencyMs: 1_000, cost: 0.001 }),
        // A failed answer is left out of every figure.
        cell({ answerId: 'a3', profileId: 'baseline', score: 9, generationLatencyMs: 50_000, cost: 1 }),
        cell({ answerId: 'a3', profileId: 'candidate', error: 'Timed out' }),
        // A repeated identical request is counted once.
        cell({
          answerId: 'a1',
          profileId: 'baseline',
          score: 8,
          generationLatencyMs: 1_000,
          cost: 0.004,
          duplicateWithinRun: true,
        }),
      ],
      ['baseline', 'candidate']
    );

    expect(comparison.answerCount).toBe(3);
    expect(comparison.comparedCount).toBe(2);
    expect(comparison.agreement).toEqual({ same: 1, close: 0, different: 1 });
    expect(comparison.figures[0]).toMatchObject({ averageMs: 1_000, totalCost: 0.008 });
    expect(comparison.figures[1]).toMatchObject({ averageMs: 2_000 });
    expect(comparison.figures[1].averageCost).toBeCloseTo(0.001, 12);
    expect(comparison.faster).toEqual({ profileId: 'baseline', percent: 50 });
    expect(comparison.cheaper?.profileId).toBe('candidate');
    expect(comparison.cheaper?.percent).toBeCloseTo(75, 9);
  });

  it('leaves cost out when either cost is unknown and reports no leader on a tie', () => {
    const comparison = compareProfiles(
      [
        cell({ profileId: 'baseline', score: 8, generationLatencyMs: 500 }),
        cell({ profileId: 'candidate', score: 8, generationLatencyMs: 500, cost: 0.002 }),
      ],
      ['baseline', 'candidate']
    );
    expect(comparison.costComparedCount).toBe(0);
    expect(comparison.cheaper).toBeNull();
    expect(comparison.faster).toBeNull();
  });
});
