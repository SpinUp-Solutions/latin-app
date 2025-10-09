import React from 'react';
import { EditingCell } from '@/src/types/admin-vocabulary';
import { formatCellValue } from '@/src/utils/vocabUtils';
import SimpleRichDisplay from '../../../core/simple-rich-display';
import { EditableCell } from './EditableCell';

interface TableCellProps {
  value: string[] | undefined;
  rowIndex: number;
  cellKey: string;
  tableType: string;
  isEditMode: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  onCellDoubleClick?: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave?: () => void;
  onCellEditCancel?: () => void;
  onEditingCellValueChange?: (value: string) => void;
}

export const TableCell: React.FC<TableCellProps> = ({
  value,
  rowIndex,
  cellKey,
  tableType,
  isEditMode,
  editingCell,
  editingCellValue = '',
  onCellDoubleClick,
  onCellEditSave,
  onCellEditCancel,
  onEditingCellValueChange,
}) => {
  const cellValue = value || [];

  if (isEditMode && onCellDoubleClick && onCellEditSave && onCellEditCancel && onEditingCellValueChange) {
    return (
      <EditableCell
        value={cellValue}
        rowIndex={rowIndex}
        cellKey={cellKey}
        tableType={tableType}
        editingCell={editingCell || null}
        editingCellValue={editingCellValue}
        onCellDoubleClick={onCellDoubleClick}
        onCellEditSave={onCellEditSave}
        onCellEditCancel={onCellEditCancel}
        onEditingCellValueChange={onEditingCellValueChange}
      />
    );
  }

  return <SimpleRichDisplay content={formatCellValue(cellValue) || '—'} />;
};
