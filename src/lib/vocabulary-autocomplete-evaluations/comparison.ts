import type { VocabularyAutocompleteProfileId } from '@/shared/openai/model-registry';
import { compareEntryForms, emptyCounts, type FormCounts } from '@/src/utils/vocabulary/word-diff';
import { leadOf, type Lead } from '../ai-evaluations/comparison';
import type { VocabularyEvaluationCell } from './contracts';

export interface VocabularyProfileFigures {
  profileId: VocabularyAutocompleteProfileId;
  completed: number;
  failed: number;
  /** Failures where the model ran out of output tokens. */
  tokenBudgetFailures: number;
  averageMs: number;
  averageCost: number;
  totalCost: number;
  averageOutputTokens: number;
  /** The largest share of the output cap any one word used, 0–1. */
  peakOutputShare: number;
  peakOutputWord?: string;
}

export interface VocabularyRunSummary {
  entryCount: number;
  /** Words both models completed; speed, cost and forms cover only these. */
  comparedCount: number;
  costComparedCount: number;
  forms: FormCounts;
  /** Compared words where every form matches exactly. */
  identicalEntries: number;
  figures: [VocabularyProfileFigures, VocabularyProfileFigures];
  faster: Lead<VocabularyAutocompleteProfileId> | null;
  cheaper: Lead<VocabularyAutocompleteProfileId> | null;
}

export function summarizeVocabularyRun(
  cells: readonly VocabularyEvaluationCell[],
  profileIds: readonly [VocabularyAutocompleteProfileId, VocabularyAutocompleteProfileId]
): VocabularyRunSummary {
  const entryIds = [...new Set(cells.map(cell => cell.entryId))];
  const forms = emptyCounts();
  const time = [0, 0];
  const cost = [0, 0];
  const outputTokens = [0, 0];
  let comparedCount = 0;
  let costComparedCount = 0;
  let identicalEntries = 0;

  for (const entryId of entryIds) {
    const pair = profileIds.map(id => cells.find(cell => cell.entryId === entryId && cell.profileId === id));
    const [first, second] = pair;
    if (!first?.output || !second?.output) continue;
    comparedCount += 1;
    const { counts } = compareEntryForms(first.output, second.output);
    for (const key of Object.keys(forms) as Array<keyof FormCounts>) forms[key] += counts[key];
    if (counts.total === counts.same) identicalEntries += 1;
    pair.forEach((cell, index) => {
      time[index] += cell!.generationLatencyMs;
      outputTokens[index] += cell!.usage?.completionTokens ?? 0;
    });
    if (first.cost && second.cost) {
      costComparedCount += 1;
      cost[0] += first.cost.totalCost;
      cost[1] += second.cost.totalCost;
    }
  }

  const figuresFor = (profileId: VocabularyAutocompleteProfileId, index: number): VocabularyProfileFigures => {
    const own = cells.filter(cell => cell.profileId === profileId);
    let peakOutputShare = 0;
    let peakOutputWord: string | undefined;
    for (const cell of own) {
      const share = (cell.usage?.completionTokens ?? 0) / cell.maxOutputTokens;
      if (share > peakOutputShare) {
        peakOutputShare = share;
        peakOutputWord = cell.word;
      }
    }
    return {
      profileId,
      completed: own.filter(cell => cell.output).length,
      failed: own.filter(cell => !cell.output).length,
      tokenBudgetFailures: own.filter(cell => cell.errorCode === 'token-budget').length,
      averageMs: comparedCount ? time[index] / comparedCount : 0,
      averageCost: costComparedCount ? cost[index] / costComparedCount : 0,
      totalCost: cost[index],
      averageOutputTokens: comparedCount ? outputTokens[index] / comparedCount : 0,
      peakOutputShare,
      peakOutputWord,
    };
  };
  const figures: [VocabularyProfileFigures, VocabularyProfileFigures] = [
    figuresFor(profileIds[0], 0),
    figuresFor(profileIds[1], 1),
  ];

  return {
    entryCount: entryIds.length,
    comparedCount,
    costComparedCount,
    forms,
    identicalEntries,
    figures,
    faster: comparedCount ? leadOf(figures, item => item.averageMs) : null,
    cheaper: costComparedCount ? leadOf(figures, item => item.averageCost) : null,
  };
}
