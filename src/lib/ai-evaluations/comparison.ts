import { TRANSLATION_FEEDBACK_LEVELS } from '../../../shared/openai/types';
import type { TranslationGradingProfileId } from '../../../shared/openai/model-registry';
import type { EvaluationCellResult } from './contracts';

export type GradeAgreement = 'same' | 'close' | 'different';

/** How far apart two models graded the same answer. */
export function gradeAgreement(first: EvaluationCellResult, second: EvaluationCellResult): GradeAgreement | null {
  if (!first.output || !second.output || first.gradingMode !== second.gradingMode) return null;
  let distance: number;
  if (first.gradingMode === 'lesson' && second.gradingMode === 'lesson') {
    distance = Math.abs(
      TRANSLATION_FEEDBACK_LEVELS.indexOf(first.output!.feedbackLevel) -
        TRANSLATION_FEEDBACK_LEVELS.indexOf(second.output!.feedbackLevel)
    );
  } else if (first.gradingMode === 'test' && second.gradingMode === 'test') {
    distance = Math.abs(first.output!.score - second.output!.score);
  } else {
    return null;
  }
  if (distance === 0) return 'same';
  return distance <= 1 ? 'close' : 'different';
}

export interface ProfileFigures {
  profileId: TranslationGradingProfileId;
  averageMs: number;
  averageCost: number;
  totalCost: number;
}

export interface Lead {
  profileId: TranslationGradingProfileId;
  /** How much less the leader needs, as a percentage of the other profile's figure. */
  percent: number;
}

export interface ProfileComparison {
  /** Answers both profiles graded successfully. */
  comparedCount: number;
  /** Answers in this mode, counted once each. */
  answerCount: number;
  agreement: Record<GradeAgreement, number>;
  /** Answers whose cost is known for both profiles; cost figures cover only these. */
  costComparedCount: number;
  figures: [ProfileFigures, ProfileFigures];
  faster: Lead | null;
  cheaper: Lead | null;
}

const leadOf = (
  [first, second]: [ProfileFigures, ProfileFigures],
  value: (figures: ProfileFigures) => number
): Lead | null => {
  const a = value(first);
  const b = value(second);
  if (a === b || Math.max(a, b) <= 0) return null;
  const [winner, loser] = a < b ? [first, second] : [second, first];
  return { profileId: winner.profileId, percent: ((value(loser) - value(winner)) / value(loser)) * 100 };
};

/**
 * Compares two profiles on the answers both graded. Speed uses the original
 * generation time and cost uses the original generation cost, so app-cache
 * hits compare fairly with fresh calls.
 */
export function compareProfiles(
  cells: readonly EvaluationCellResult[],
  profileIds: readonly [TranslationGradingProfileId, TranslationGradingProfileId]
): ProfileComparison {
  const [firstId, secondId] = profileIds;
  const unique = cells.filter(cell => !cell.duplicateWithinRun);
  const answerKeys = [...new Set(unique.map(cell => `${cell.gradingMode}:${cell.answerId}`))];
  const agreement: Record<GradeAgreement, number> = { same: 0, close: 0, different: 0 };
  const time = { [firstId]: 0, [secondId]: 0 } as Record<TranslationGradingProfileId, number>;
  const cost = { [firstId]: 0, [secondId]: 0 } as Record<TranslationGradingProfileId, number>;
  let comparedCount = 0;
  let costComparedCount = 0;

  for (const key of answerKeys) {
    const find = (profileId: TranslationGradingProfileId) =>
      unique.find(cell => `${cell.gradingMode}:${cell.answerId}` === key && cell.profileId === profileId);
    const first = find(firstId);
    const second = find(secondId);
    if (!first?.output || !second?.output) continue;
    comparedCount += 1;
    const level = gradeAgreement(first, second);
    if (level) agreement[level] += 1;
    time[firstId] += first.generationLatencyMs ?? first.latencyMs;
    time[secondId] += second.generationLatencyMs ?? second.latencyMs;
    const knownCost = (cell: EvaluationCellResult) => cell.originalCostStatus !== 'unavailable' && cell.originalCost;
    if (knownCost(first) && knownCost(second)) {
      costComparedCount += 1;
      cost[firstId] += first.originalCost!.totalCost;
      cost[secondId] += second.originalCost!.totalCost;
    }
  }

  const figuresFor = (profileId: TranslationGradingProfileId): ProfileFigures => ({
    profileId,
    averageMs: comparedCount ? time[profileId] / comparedCount : 0,
    averageCost: costComparedCount ? cost[profileId] / costComparedCount : 0,
    totalCost: cost[profileId],
  });
  const figures: [ProfileFigures, ProfileFigures] = [figuresFor(firstId), figuresFor(secondId)];

  return {
    comparedCount,
    answerCount: answerKeys.length,
    agreement,
    costComparedCount,
    figures,
    faster: comparedCount ? leadOf(figures, item => item.averageMs) : null,
    cheaper: costComparedCount ? leadOf(figures, item => item.averageCost) : null,
  };
}
