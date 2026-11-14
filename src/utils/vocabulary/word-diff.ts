/**
 * Compares two versions of a vocabulary word the way the admin editor shows
 * them: an empty string, an empty list and null all read as "—", so they are
 * the same value here. Shared by the staging service and the review page.
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

const isTableLeaf = (value: unknown) => !isPlainObject(value);

/**
 * Paths of the table cells whose forms differ, relative to the table, such as
 * "indicative.active.present.singular.first". A branch that exists on one side
 * only counts every filled cell under it.
 */
export function changedTableCells(current: unknown, proposed: unknown, path = ''): string[] {
  if (isTableLeaf(current) && isTableLeaf(proposed)) {
    return sameWordValue(current, proposed) ? [] : [path];
  }
  const left = isPlainObject(current) ? current : {};
  const right = isPlainObject(proposed) ? proposed : {};
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.flatMap(key => changedTableCells(left[key], right[key], path ? `${path}.${key}` : key));
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
