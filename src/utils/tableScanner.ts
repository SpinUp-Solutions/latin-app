import { z } from 'zod';
import type { TableType } from '@/src/utils/schema-helpers';
import {
  ConjugationTableSchema,
  DeclensionTableSchema,
  AdjectiveDeclensionTableSchema,
  DegreesTableSchema,
} from '@/shared/types/vocabulary/schemas';

type ConjugationTable = z.infer<typeof ConjugationTableSchema>;
type DeclensionTable = z.infer<typeof DeclensionTableSchema>;
type DegreesTable = z.infer<typeof DegreesTableSchema>;
type AdjectiveDeclensionTable = z.infer<typeof AdjectiveDeclensionTableSchema>;

export interface MatchingPath {
  path: string;
}

function isLeafNode(value: unknown): value is string[] | string | null {
  if (value === null) return true;
  if (typeof value === 'string') return true;
  if (Array.isArray(value) && value.every(v => typeof v === 'string' || v === null)) return true;
  return false;
}

function leafContainsForm(leaf: string[] | string | null, targetForm: string): boolean {
  if (leaf === null) return false;
  if (typeof leaf === 'string') return leaf === targetForm;
  return leaf.includes(targetForm);
}

function scanObjectForForm(
  obj: Record<string, unknown>,
  targetForm: string,
  currentPath: string[] = []
): MatchingPath[] {
  const results: MatchingPath[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const newPath = [...currentPath, key];

    if (isLeafNode(value)) {
      if (leafContainsForm(value as string[] | string | null, targetForm)) {
        results.push({ path: newPath.join('.') });
      }
    } else if (value && typeof value === 'object') {
      results.push(...scanObjectForForm(value as Record<string, unknown>, targetForm, newPath));
    }
  }

  return results;
}

export function scanDeclensionTable(table: DeclensionTable, targetForm: string): MatchingPath[] {
  return scanObjectForForm(table as unknown as Record<string, unknown>, targetForm);
}

export function scanAdjectiveDeclensionTable(table: AdjectiveDeclensionTable, targetForm: string): MatchingPath[] {
  return scanObjectForForm(table as unknown as Record<string, unknown>, targetForm);
}

export function scanDegreesTable(table: DegreesTable, targetForm: string): MatchingPath[] {
  return scanObjectForForm(table as unknown as Record<string, unknown>, targetForm);
}

export function scanConjugationTable(table: ConjugationTable, targetForm: string): MatchingPath[] {
  return scanObjectForForm(table as unknown as Record<string, unknown>, targetForm);
}

export function scanTableForMatchingForms(table: unknown, targetForm: string, tableType: TableType): MatchingPath[] {
  if (!table || !targetForm) return [];

  switch (tableType) {
    case 'conjugation':
      return scanConjugationTable(table as ConjugationTable, targetForm);
    case 'declension':
      return scanDeclensionTable(table as DeclensionTable, targetForm);
    case 'adjective-declension':
      return scanDegreesTable(table as DegreesTable, targetForm);
    default:
      return [];
  }
}

export function categorizeMatchingPaths(
  allMatchingPaths: MatchingPath[],
  adminSelectedPaths: string[]
): { primaryPaths: string[]; optionalPaths: string[] } {
  const adminSelectedSet = new Set(adminSelectedPaths);

  const primaryPaths: string[] = [];
  const optionalPaths: string[] = [];

  for (const match of allMatchingPaths) {
    if (adminSelectedSet.has(match.path)) {
      primaryPaths.push(match.path);
    } else {
      optionalPaths.push(match.path);
    }
  }

  return { primaryPaths, optionalPaths };
}
