import { BaseExercise } from './base';

export interface TableFillCell {
  content: string;
  isBlank: boolean;
  answer?: string;
}

export interface TableFillColumn {
  id: string;
  header: string;
  className?: string;
}

export interface TableFillRow {
  id: string;
  cells: Record<string, TableFillCell>;
}

export interface TableFillExercise extends BaseExercise {
  type: 'table-fill';
  data: {
    title?: string;
    columns: TableFillColumn[];
    rows: TableFillRow[];
    footnotes?: string[];
    hint?: string;
    explanation?: string;
  };
}
