import React from 'react';
import type { TableGrid } from '@/src/types/schema-introspection';

interface SelectableGridTableProps {
  grid: TableGrid;
  selectedPaths: Set<string>;
  onToggleCell: (path: string) => void;
  onToggleRow?: (rowIdx: number) => void;
  onToggleColumn?: (colIdx: number) => void;
}

export const SelectableGridTable: React.FC<SelectableGridTableProps> = ({
  grid,
  selectedPaths,
  onToggleCell,
  onToggleRow,
  onToggleColumn,
}) => {
  const { rows, columns, cells } = grid;

  if (rows.length === 0 || columns.length === 0) {
    return null;
  }

  const handleCellClick = (path: string) => {
    if (path) {
      onToggleCell(path);
    }
  };

  const handleRowHeaderClick = (rowIdx: number) => {
    if (onToggleRow) {
      onToggleRow(rowIdx);
    }
  };

  const handleColumnHeaderClick = (colIdx: number) => {
    if (onToggleColumn) {
      onToggleColumn(colIdx);
    }
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
                className="border border-gray-300 bg-gray-50 px-4 py-2 text-center text-sm font-semibold cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleColumnHeaderClick(idx)}
                title="Click to select/deselect entire column">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              <td
                className="border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleRowHeaderClick(rowIdx)}
                title="Click to select/deselect entire row">
                {row.label}
              </td>
              {columns.map((_, colIdx) => {
                const cell = cells[rowIdx]?.[colIdx];
                const isSelected = cell && cell.path && selectedPaths.has(cell.path);

                return (
                  <td
                    key={colIdx}
                    className={`border px-4 py-2 text-sm cursor-pointer transition-all ${
                      isSelected ? 'bg-blue-100 border-blue-500 border-2' : 'border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => cell && cell.path && handleCellClick(cell.path)}
                    title={cell && cell.path ? `Click to select: ${cell.path}` : undefined}>
                    <span className="text-gray-500">—</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
