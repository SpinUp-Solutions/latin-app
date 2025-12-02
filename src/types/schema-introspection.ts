export type LeafKind = 'string' | 'string[]' | 'unknown';

export interface LeafNode {
  kind: 'leaf';
  leafKind: LeafKind;
}

export interface ObjectNode {
  kind: 'object';
  keys: readonly string[];
  children: Record<string, SchemaNode>;
  uniform: boolean;
}

export type SchemaNode = ObjectNode | LeafNode;

export interface RowDef {
  key: string;
  label: string;
}

export interface ColumnDef {
  path: string[];
  label: string;
  className?: string;
}

export interface CellDef {
  path: string;
  value: string | string[] | null;
  rowKey: string;
  colKey: string;
  leafKind: LeafKind;
}

export interface TableGrid {
  rows: RowDef[];
  columns: ColumnDef[];
  cells: CellDef[][];
}

export interface SubsectionGrid {
  key: string;
  label: string;
  grid: TableGrid | NestedTableGrid;
}

export interface SectionGrid {
  sectionKey: string;
  sectionLabel: string;
  subsections: SubsectionGrid[];
}

export interface NestedTableGrid {
  sections: SectionGrid[];
}
