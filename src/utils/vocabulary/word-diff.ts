/**
 * Shared vocabulary comparison and highlighting. Reviews compare authored values
 * exactly (with empty editor values treated alike); model evaluations also
 * classify macron differences and compare alternative forms as sets.
 */
import type { WordChangeSummary } from '@/shared/types/vocabulary/update-requests';

/** Fields the server derives or keeps from the live word; an update never changes them. */
const IGNORED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'sort_key', 'random_index']);

export const WORD_TABLE_FIELDS = ['declension_table', 'conjugation_table', 'degrees_table'] as const;

type Plain = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Plain => !!value && typeof value === 'object' && !Array.isArray(value);

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.every(isEmptyValue);
  if (isPlainObject(value)) return Object.values(value).every(isEmptyValue);
  return false;
};

/** Whether two stored values show the same thing in the editor. */
export function sameWordValue(left: unknown, right: unknown): boolean {
  if (isEmptyValue(left) && isEmptyValue(right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameWordValue(entry, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every(key => sameWordValue(left[key], right[key]));
  }
  return left === right;
}

/** Authored top-level fields whose value differs, sorted by name. */
export function changedWordFields(current: Plain, proposed: Plain): string[] {
  const keys = new Set([...Object.keys(current), ...Object.keys(proposed)]);
  return [...keys]
    .filter(key => !IGNORED_FIELDS.has(key) && !key.startsWith('_') && !sameWordValue(current[key], proposed[key]))
    .sort();
}

/**
 * Paths of the table cells whose forms differ, relative to the table, such as
 * "indicative.active.present.singular.first". A branch that exists on one side
 * only counts every filled cell under it.
 */
export function changedTableCells(current: unknown, proposed: unknown): string[] {
  const left = entryLeaves(current);
  const right = entryLeaves(proposed);
  return [...new Set([...left.keys(), ...right.keys()])].filter(
    key => !sameWordValue(left.get(key)?.value, right.get(key)?.value)
  );
}

/** What a proposal changes, for list rows and headers. */
export function summarizeWordChanges(current: Plain, proposed: Plain): WordChangeSummary {
  const changed = changedWordFields(current, proposed);
  const tableFields = new Set<string>(WORD_TABLE_FIELDS);
  return {
    fields: changed.filter(field => !tableFields.has(field)),
    tableCells: WORD_TABLE_FIELDS.reduce(
      (total, field) => total + changedTableCells(current[field], proposed[field]).length,
      0
    ),
  };
}

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

export const emptyCounts = (): FormCounts => ({ same: 0, macrons: 0, missing: 0, different: 0, total: 0 });

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
function entryLeaves(value: unknown) {
  const leaves = new Map<string, { path: string[]; value: unknown }>();
  const walk = (node: unknown, nodePath: string[]) => {
    if (isPrimitive(node) || (Array.isArray(node) && node.every(isPrimitive))) {
      leaves.set(nodePath.join('.'), { path: nodePath, value: node });
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

export const normalizeWordSearch = (text: string) =>
  text.normalize('NFD').replace(/[̄̆]/g, '').normalize('NFC').toLowerCase();

const sameSet = (left: string[], right: string[], normalize: (text: string) => string) => {
  const a = [...new Set(left.map(normalize))].sort();
  const b = [...new Set(right.map(normalize))].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
};

export function formAgreement(left: string[], right: string[]): FormAgreement | null {
  if (left.length === 0 && right.length === 0) return null;
  if (left.length === 0 || right.length === 0) return 'missing';
  if (sameSet(left, right, text => text)) return 'same';
  if (sameSet(left, right, normalizeWordSearch)) return 'macrons';
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
  const left = entryLeaves(grammar(first));
  const right = entryLeaves(grammar(second));
  const keys = [...new Set([...left.keys(), ...right.keys()])];
  const counts = emptyCounts();
  const rows: FormRow[] = [];
  for (const key of keys) {
    const leftValues = toValues(left.get(key)?.value);
    const rightValues = toValues(right.get(key)?.value);
    const agreement = formAgreement(leftValues, rightValues);
    if (!agreement) continue;
    const [field, ...path] = (left.get(key) ?? right.get(key))!.path;
    rows.push({ key, field, path, values: [leftValues, rightValues], agreement });
    counts[agreement] += 1;
    counts.total += 1;
  }
  return { rows, counts };
}

/**
 * Splits `text` into the part it shares with `other` at the start, the part
 * that differs, and the part it shares at the end, so a table can mark only
 * the letters that changed (amāverītis against amāveritis marks "ī").
 */
export function differingSpan(text: string, other: string): [string, string, string] {
  let start = 0;
  while (start < text.length && start < other.length && text[start] === other[start]) start += 1;
  let end = 0;
  while (
    end < text.length - start &&
    end < other.length - start &&
    text[text.length - 1 - end] === other[other.length - 1 - end]
  ) {
    end += 1;
  }
  return [text.slice(0, start), text.slice(start, text.length - end), text.slice(text.length - end)];
}

const searchText = (text: string) =>
  normalizeWordSearch(text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.]/g, ' ')).replace(/\s+/g, ' ');

/**
 * Whether a form matches a search: every word of the query must start a word
 * of the form's path or of either model's value, ignoring case and macrons, so
 * "subj perf pl" finds the perfect subjunctive plurals (not the imperfect or
 * pluperfect) and "amaver" finds amāverītis.
 */
export function formMatchesQuery(row: FormRow, query: string) {
  const words = searchText(query).trim().split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = searchText([row.field, ...row.path, ...row.values.flat()].join(' ')).split(' ');
  return words.every(word => haystack.some(item => item.startsWith(word)));
}
