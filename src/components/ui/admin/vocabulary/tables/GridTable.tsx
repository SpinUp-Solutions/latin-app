import React from 'react';
import type { TableGrid } from '@/src/types/schema-introspection';
import type { EditingCell } from '@/src/types/admin-vocabulary';
import { TableCell } from '../shared/TableCell';

interface GridTableProps {
  grid: TableGrid;
  tableType: string;
  isEditMode?: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  onCellDoubleClick?: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave?: () => void;
  onCellEditCancel?: () => void;
  onEditingCellValueChange?: (value: string) => void;
}

export const GridTable: React.FC<GridTableProps> = ({
  grid,
  tableType,
  isEditMode = false,
  editingCell,
  editingCellValue = '',
  onCellDoubleClick,
  onCellEditSave,
  onCellEditCancel,
  onEditingCellValueChange,
}) => {
  const { rows, columns, cells } = grid;

  if (rows.length === 0 || columns.length === 0) {
    return null;
  }

  const renderCellContent = (rowIndex: number, colIndex: number) => {
    const cell = cells[rowIndex]?.[colIndex];
    if (!cell) return <span>—</span>;

    if (cell.leafKind === 'string') {
      const stringValue = typeof cell.value === 'string' ? cell.value : null;
      return <span className="text-roman-clay">{stringValue || '—'}</span>;
    }

    const arrayValue = Array.isArray(cell.value) ? cell.value : null;

    if (isEditMode && onCellDoubleClick && onCellEditSave && onCellEditCancel && onEditingCellValueChange) {
      return (
        <TableCell
          value={arrayValue}
          rowIndex={rowIndex}
          cellKey={cell.path}
          tableType={tableType}
          isEditMode={true}
          editingCell={editingCell}
          editingCellValue={editingCellValue}
          onCellDoubleClick={onCellDoubleClick}
          onCellEditSave={onCellEditSave}
          onCellEditCancel={onCellEditCancel}
          onEditingCellValueChange={onEditingCellValueChange}
        />
      );
    }

    if (arrayValue && arrayValue.length > 0) {
      return (
        <span className="text-roman-clay">
          {arrayValue.map((form, idx) => (
            <React.Fragment key={idx}>
              {form}
              {idx < arrayValue.length - 1 && ', '}
            </React.Fragment>
          ))}
        </span>
      );
    }

    return <span>—</span>;
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-300 bg-gray-50 px-4 py-2 text-left text-sm font-semibold"></th>
            {columns.map((col, idx) => (
              <th
                key={idx}
                className="border border-gray-300 bg-gray-50 px-4 py-2 text-center text-sm font-semibold">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              <td className="border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-semibold">{row.label}</td>
              {columns.map((_, colIdx) => (
                <td key={colIdx} className="border border-gray-300 px-4 py-2 text-sm">
                  {renderCellContent(rowIdx, colIdx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
