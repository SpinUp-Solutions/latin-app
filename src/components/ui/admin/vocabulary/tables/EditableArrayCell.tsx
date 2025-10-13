import React from 'react';
import type { EditingCell } from '@/src/types/admin-vocabulary';
import { TableCell } from '../shared/TableCell';

export interface EditCallbacks {
  onCellDoubleClick: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave: () => void;
  onCellEditCancel: () => void;
  onEditingCellValueChange: (value: string) => void;
}

interface EditableArrayCellProps {
  value: unknown;
  rowIndex: number;
  cellKey: string;
  tableType: string;
  editingCell: EditingCell | null;
  editingCellValue: string;
  editCallbacks: EditCallbacks;
}

export const EditableArrayCell: React.FC<EditableArrayCellProps> = ({
  value,
  rowIndex,
  cellKey,
  tableType,
  editingCell,
  editingCellValue,
  editCallbacks,
}) => {
  const arrayValue = Array.isArray(value) ? value : null;

  return (
    <TableCell
      value={arrayValue}
      rowIndex={rowIndex}
      cellKey={cellKey}
      tableType={tableType}
      isEditMode={true}
      editingCell={editingCell}
      editingCellValue={editingCellValue}
      onCellDoubleClick={editCallbacks.onCellDoubleClick}
      onCellEditSave={editCallbacks.onCellEditSave}
      onCellEditCancel={editCallbacks.onCellEditCancel}
      onEditingCellValueChange={editCallbacks.onEditingCellValueChange}
    />
  );
};
