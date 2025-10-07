import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Save, X } from 'lucide-react';
import { EditingCell } from '@/src/types/admin-vocabulary';
import { formatCellValue } from '@/src/utils/vocabUtils';
import SimpleRichDisplay from '../../../core/simple-rich-display';
import SimpleRichEditor from '../../../core/simple-rich-editor';

interface EditableCellProps {
  value: string[];
  rowIndex: number;
  cellKey: string;
  tableType: string;
  editingCell: EditingCell | null;
  editingCellValue: string;
  onCellDoubleClick: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave: () => void;
  onCellEditCancel: () => void;
  onEditingCellValueChange: (value: string) => void;
}

export const EditableCell: React.FC<EditableCellProps> = ({
  value,
  rowIndex,
  cellKey,
  tableType,
  editingCell,
  editingCellValue,
  onCellDoubleClick,
  onCellEditSave,
  onCellEditCancel,
  onEditingCellValueChange,
}) => {
  const isEditing =
    editingCell?.rowIndex === rowIndex && editingCell?.cellKey === cellKey && editingCell?.tableType === tableType;

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <div
          className="flex-1"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCellEditSave();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCellEditCancel();
            }
          }}>
          <SimpleRichEditor
            content={editingCellValue}
            onChange={onEditingCellValueChange}
            className="text-sm min-w-0"
            placeholder="Enter value..."
            singleLine={true}
          />
        </div>
        <Button size="sm" variant="outline" onClick={onCellEditSave} className="h-8 w-8 p-0" title="Save">
          <Save className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" onClick={onCellEditCancel} className="h-8 w-8 p-0" title="Cancel">
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  const displayValue = formatCellValue(value) || '—';

  return (
    <span
      className="cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors block min-h-[2rem] flex items-center"
      onDoubleClick={() => onCellDoubleClick(rowIndex, cellKey, tableType, displayValue)}
      title="Double-click to edit"
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCellDoubleClick(rowIndex, cellKey, tableType, displayValue);
        }
      }}>
      <SimpleRichDisplay content={displayValue} />
    </span>
  );
};
