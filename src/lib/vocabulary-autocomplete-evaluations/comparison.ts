import type { VocabularyAutocompleteProfileId } from '../../../shared/openai/model-registry';
import type { VocabularyEvaluationCell } from './contracts';

/** Free-text fields: shown side by side, never scored, because wording always differs. */
export const PROSE_FIELDS = ['translation', 'definitions', 'etymology', 'pronunciation'] as const;

/**
 * How two models' values for one form compare. `macrons` means the letters
 * match but vowel length marks or capitals differ; `missing` means only one
 * model filled the form.
 */
export type FormAgreement = 'same' | 'macrons' | 'missing' | 'different';

export interface FormRow {
  key: string;
  field: string;
  /** The path below the field, e.g. ["indicative", "active", "present", "singular", "first"]. */
  path: string[];
  values: [string[], string[]];
  agreement: FormAgreement;
}

export interface FormCounts extends Record<FormAgreement, number> {
  total: number;
}

export interface EntryComparison {
  rows: FormRow[];
  counts: FormCounts;
}

const emptyCounts = (): FormCounts => ({ same: 0, macrons: 0, missing: 0, different: 0, total: 0 });

const isPrimitive = (value: unknown) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value) || value === undefined;

const toValues = (value: unknown): string[] => {
  const items = Array.isArray(value) ? value : [value];
  return items
    .filter(item => item !== null && item !== undefined)
    .map(item => String(item).normalize('NFC').trim())
    .filter(Boolean);
};

/** Flattens an entry into its individual forms, keyed by path. Lists of plain values are one form. */
export function flattenEntry(value: unknown) {
  const leaves = new Map<string, { path: string[]; values: string[] }>();
  const walk = (node: unknown, nodePath: string[]) => {
    if (isPrimitive(node) || (Array.isArray(node) && node.every(isPrimitive))) {
      leaves.set(nodePath.join('.'), { path: nodePath, values: toValues(node) });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...nodePath, String(index + 1)]));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) walk(child, [...nodePath, key]);
  };
  walk(value, []);
  return leaves;
}

const stripMarks = (text: string) => text.normalize('NFD').replace(/[̄̆]/g, '').toLowerCase();

const sameSet = (left: string[], right: string[], normalize: (text: string) => string) => {
  const a = [...new Set(left.map(normalize))].sort();
  const b = [...new Set(right.map(normalize))].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
};

export function formAgreement(left: string[], right: string[]): FormAgreement | null {
  if (left.length === 0 && right.length === 0) return null;
  if (left.length === 0 || right.length === 0) return 'missing';
  if (sameSet(left, right, text => text)) return 'same';
  if (sameSet(left, right, stripMarks)) return 'macrons';
  return 'different';
}

/**
 * Compares the grammatical fields of two autocompleted entries form by form.
 * Forms both models left empty (a locative most words lack) are not counted.
 */
export function compareEntryForms(first: Record<string, unknown>, second: Record<string, unknown>): EntryComparison {
  const grammar = (output: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(output).filter(([field]) => !(PROSE_FIELDS as readonly string[]).includes(field))
    );
  const left = flattenEntry(grammar(first));
  const right = flattenEntry(grammar(second));
  const keys = [...new Set([...left.keys(), ...right.keys()])];
  const counts = emptyCounts();
  const rows: FormRow[] = [];
  for (const key of keys) {
    const leftValues = left.get(key)?.values ?? [];
    const rightValues = right.get(key)?.values ?? [];
    const agreement = formAgreement(leftValues, rightValues);
    if (!agreement) continue;
    const [field, ...path] = (left.get(key) ?? right.get(key))!.path;
    rows.push({ key, field, path, values: [leftValues, rightValues], agreement });
    counts[agreement] += 1;
    counts.total += 1;
  }
  return { rows, counts };
}

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
  faster: { profileId: VocabularyAutocompleteProfileId; ratio: number } | null;
  cheaper: { profileId: VocabularyAutocompleteProfileId; ratio: number } | null;
}

const leadOf = (
  figures: [VocabularyProfileFigures, VocabularyProfileFigures],
  value: (item: VocabularyProfileFigures) => number
) => {
  const [a, b] = figures.map(value);
  if (a === b || Math.min(a, b) <= 0) return null;
  const [winner, loser] = a < b ? [figures[0], figures[1]] : [figures[1], figures[0]];
  return { profileId: winner.profileId, ratio: value(loser) / value(winner) };
};

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
