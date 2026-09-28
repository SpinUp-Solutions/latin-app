import { isSelectableMorphologyForm } from '@/src/utils/morphologyForms';

const isLeaf = (value: unknown): value is string | (string | null)[] | null =>
  value === null ||
  typeof value === 'string' ||
  (Array.isArray(value) && value.every(entry => typeof entry === 'string' || entry === null));

function collectMatchingPaths(
  table: Record<string, unknown>,
  targetForm: string,
  prefix: string[],
  matches: string[]
): string[] {
  for (const [key, value] of Object.entries(table)) {
    const path = [...prefix, key];
    if (isLeaf(value)) {
      if (value === targetForm || (Array.isArray(value) && value.includes(targetForm))) matches.push(path.join('.'));
    } else if (value && typeof value === 'object') {
      collectMatchingPaths(value as Record<string, unknown>, targetForm, path, matches);
    }
  }
  return matches;
}

/** Dot paths of every cell in an inflection table that contains `targetForm`. */
export function scanTableForMatchingForms(table: unknown, targetForm: string): string[] {
  if (!table || !isSelectableMorphologyForm(targetForm)) return [];
  return collectMatchingPaths(table as Record<string, unknown>, targetForm, [], []);
}

export function categorizeMatchingPaths(
  allMatchingPaths: string[],
  adminSelectedPaths: string[]
): { primaryPaths: string[]; optionalPaths: string[] } {
  const adminSelected = new Set(adminSelectedPaths);
  return {
    primaryPaths: allMatchingPaths.filter(path => adminSelected.has(path)),
    optionalPaths: allMatchingPaths.filter(path => !adminSelected.has(path)),
  };
}
