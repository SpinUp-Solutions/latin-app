import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Plus } from 'lucide-react';
import { TableContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import type { Column, TableRow } from '@/src/components/ui/lesson/conjugation-table';

export const TableEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as TableContent);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<TableContent>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const addColumn = () => {
    const newColumn: Column = {
      id: `col-${Date.now()}`,
      header: 'New Column',
    };

    const updatedTableData = {
      ...editingContent.tableData,
      columns: [...editingContent.tableData.columns, newColumn],
      rows: editingContent.tableData.rows.map((row: TableRow) => ({
        ...row,
        cells: { ...row.cells, [newColumn.id]: '' },
      })),
    };

    updateContent({ tableData: updatedTableData });
  };

  const addRow = () => {
    const newRow: TableRow = {
      id: `row-${Date.now()}`,
      cells: editingContent.tableData.columns.reduce((acc: Record<string, string>, col: Column) => {
        acc[col.id] = '';
        return acc;
      }, {}),
    };

    const updatedTableData = {
      ...editingContent.tableData,
      rows: [...editingContent.tableData.rows, newRow],
    };

    updateContent({ tableData: updatedTableData });
  };

  const updateCell = (rowId: string, colId: string, value: string) => {
    const updatedTableData = {
      ...editingContent.tableData,
      rows: editingContent.tableData.rows.map((row: TableRow) =>
        row.id === rowId ? { ...row, cells: { ...row.cells, [colId]: value } } : row
      ),
    };

    updateContent({ tableData: updatedTableData });
  };

  const updateColumnHeader = (columnId: string, header: string) => {
    const updatedTableData = {
      ...editingContent.tableData,
      columns: editingContent.tableData.columns.map((c: Column) => (c.id === columnId ? { ...c, header } : c)),
    };
    updateContent({ tableData: updatedTableData });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Table Title</label>
        <input
          type="text"
          value={editingContent.tableData.title || ''}
          onChange={e =>
            updateContent({
              tableData: { ...editingContent.tableData, title: e.target.value },
            })
          }
          className="w-full p-2 border rounded-md"
          placeholder="Enter table title..."
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Table Data</label>
          <div className="flex gap-2">
            <Button onClick={addColumn} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Add Column
            </Button>
            <Button onClick={addRow} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Add Row
            </Button>
          </div>
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Row</th>
                {editingContent.tableData.columns.map((col: Column) => (
                  <th key={col.id} className="p-2 text-left">
                    <input
                      type="text"
                      value={col.header}
                      onChange={e => updateColumnHeader(col.id, e.target.value)}
                      className="w-full p-1 border rounded text-sm"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editingContent.tableData.rows.map((row: TableRow) => (
                <tr key={row.id} className="border-t">
                  <td className="p-2 text-sm text-gray-500">{row.id}</td>
                  {editingContent.tableData.columns.map((col: Column) => (
                    <td key={col.id} className="p-2">
                      <input
                        type="text"
                        value={row.cells[col.id] || ''}
                        onChange={e => updateCell(row.id, col.id, e.target.value)}
                        className="w-full p-1 border rounded text-sm"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
