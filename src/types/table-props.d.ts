import { EditingCell } from './admin-vocabulary';

export interface TableProps<TWord> {
  word: TWord & { id: string };
  isExpanded: boolean;
  onToggle: () => void;
  isEditMode?: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  onCellDoubleClick?: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave?: () => void;
  onCellEditCancel?: () => void;
  onEditingCellValueChange?: (value: string) => void;
}
