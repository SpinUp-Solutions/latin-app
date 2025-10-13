import type { CellDef } from '@/src/types/schema-introspection';

export type CellType = 'empty' | 'string' | 'array';

export function getCellType(cell: CellDef | undefined): CellType {
  if (!cell) return 'empty';
  if (cell.leafKind === 'string') return 'string';
  return 'array';
}
