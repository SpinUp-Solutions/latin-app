import type { VocabularyWordWithId } from '@/src/types/vocabulary/index';
import { type TableType, getTableFieldName } from '@/src/utils/schema-helpers';

export function getCellValueAtPath(word: VocabularyWordWithId, tableType: TableType, path: string): string[] {
  const rootField = getTableFieldName(tableType);
  const fullPath = `${rootField}.${path}`;

  const keys = fullPath.split('.');
  let value: unknown = word;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return [];
    }
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((v): v is string => v !== null && v !== undefined && typeof v === 'string');
  }

  return [];
}

export function collectSelectedForms(
  word: VocabularyWordWithId,
  tableType: TableType,
  selectedPaths: string[]
): string[] {
  const allForms = selectedPaths.flatMap(path => getCellValueAtPath(word, tableType, path));
  return Array.from(new Set(allForms));
}

export function pickRandomForm(
  word: VocabularyWordWithId,
  tableType: TableType,
  selectedPaths: string[]
): { form: string; path: string } | null {
  // Try each path and collect forms with their paths
  const formsWithPaths: Array<{ form: string; path: string }> = [];

  for (const path of selectedPaths) {
    const forms = getCellValueAtPath(word, tableType, path);
    for (const form of forms) {
      formsWithPaths.push({ form, path });
    }
  }

  if (formsWithPaths.length === 0) {
    return null;
  }

  // Pick a random form-path pair
  return formsWithPaths[Math.floor(Math.random() * formsWithPaths.length)];
}
