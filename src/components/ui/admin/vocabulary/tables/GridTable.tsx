import React from 'react';
import type { TableGrid } from '@/src/types/schema-introspection';
import type { EditingCell } from '@/src/types/admin-vocabulary';
import { getCellType } from './cell-utils';
import { StringCellContent } from './StringCellContent';
import { ArrayCellContent } from './ArrayCellContent';
import { EditableArrayCell, type EditCallbacks } from './EditableArrayCell';

interface GridTableProps {
  grid: TableGrid;
  tableType: string;
  isEditMode?: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  editCallbacks?: EditCallbacks;
}

export const GridTable: React.FC<GridTableProps> = ({
  grid,
  tableType,
  isEditMode = false,
  editingCell,
  editingCellValue = '',
  editCallbacks,
}) => {
  const { rows, columns, cells } = grid;

  if (rows.length === 0 || columns.length === 0) {
    return null;
  }

  const renderCellContent = (rowIndex: number, colIndex: number) => {
    const cell = cells[rowIndex]?.[colIndex];
    const cellType = getCellType(cell);

    if (cellType === 'empty') {
      return <span>—</span>;
    }

    if (cellType === 'string') {
      return <StringCellContent value={cell!.value} />;
    }

    if (isEditMode && editCallbacks) {
      return (
        <EditableArrayCell
          value={cell!.value}
          rowIndex={rowIndex}
          cellKey={cell!.path}
          tableType={tableType}
          editingCell={editingCell ?? null}
          editingCellValue={editingCellValue}
          editCallbacks={editCallbacks}
        />
      );
    }

    return <ArrayCellContent value={cell!.value} />;
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-300 bg-gray-50 px-4 py-2 text-left text-sm font-semibold"></th>
            {columns.map((col, idx) => (
              <th key={idx} className="border border-gray-300 bg-gray-50 px-4 py-2 text-center text-sm font-semibold">
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
