import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

interface EditableTableColumn {
  id: string;
  header: string;
}

interface EditableTableRow {
  id: string;
}

interface EditableTableGridProps<TRow extends EditableTableRow> {
  columns: EditableTableColumn[];
  rows: TRow[];
  onAddColumn: () => void;
  onRemoveColumn: (columnId: string) => void;
  onUpdateColumnHeader: (columnId: string, header: string) => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: string) => void;
  renderCell: (row: TRow, column: EditableTableColumn) => React.ReactNode;
  containerClassName?: string;
}

export function EditableTableGrid<TRow extends EditableTableRow>({
  columns,
  rows,
  onAddColumn,
  onRemoveColumn,
  onUpdateColumnHeader,
  onAddRow,
  onRemoveRow,
  renderCell,
  containerClassName = 'overflow-x-auto',
}: EditableTableGridProps<TRow>) {
  return (
    <div className={`border rounded-md ${containerClassName}`}>
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left w-16">Row</th>
            {columns.map(col => (
              <th key={col.id} className="p-2 text-left relative group">
                <div className="flex items-center gap-2">
                  <SimpleRichEditor
                    content={col.header}
                    onChange={value => onUpdateColumnHeader(col.id, value)}
                    className="w-full text-sm"
                    singleLine={true}
                  />
                  {columns.length > 1 && (
                    <button
                      onClick={() => onRemoveColumn(col.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                      title="Remove column">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </th>
            ))}
            <th className="p-2 w-12">
              <button
                onClick={onAddColumn}
                className="w-full h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Add column">
                <Plus className="h-4 w-4" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="border-t group">
              <td className="p-2 text-sm text-gray-500 relative">
                <div className="flex items-center gap-2">
                  <span className="flex-1">{row.id}</span>
                  {rows.length > 1 && (
                    <button
                      onClick={() => onRemoveRow(row.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                      title="Remove row">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </td>
              {columns.map(col => (
                <td key={col.id} className="p-2">
                  {renderCell(row, col)}
                </td>
              ))}
              <td className="p-2"></td>
            </tr>
          ))}
          <tr className="border-t">
            <td className="p-2">
              <button
                onClick={onAddRow}
                className="w-full h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Add row">
                <Plus className="h-4 w-4" />
              </button>
            </td>
            {columns.map(col => (
              <td key={col.id} className="p-2">
                <div className="h-8 border border-dashed border-gray-200 rounded flex items-center justify-center text-gray-400">
                  <Plus className="h-3 w-3" />
                </div>
              </td>
            ))}
            <td className="p-2"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
