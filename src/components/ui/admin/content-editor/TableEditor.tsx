import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TableContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import type { Column, TableRow } from '@/src/components/ui/lesson/conjugation-table';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { AudioUploadSection } from './AudioUploadSection';

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

  const removeColumn = (columnId: string) => {
    const updatedTableData = {
      ...editingContent.tableData,
      columns: editingContent.tableData.columns.filter((col: Column) => col.id !== columnId),
      rows: editingContent.tableData.rows.map((row: TableRow) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [columnId]: _, ...remainingCells } = row.cells;
        return { ...row, cells: remainingCells };
      }),
    };

    updateContent({ tableData: updatedTableData });
  };

  const removeRow = (rowId: string) => {
    const updatedTableData = {
      ...editingContent.tableData,
      rows: editingContent.tableData.rows.filter((row: TableRow) => row.id !== rowId),
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
        <SimpleRichEditor
          content={editingContent.tableData.title || ''}
          onChange={value =>
            updateContent({
              tableData: { ...editingContent.tableData, title: value },
            })
          }
          className="w-full"
          placeholder="Enter table title..."
          singleLine={true}
        />
      </div>

      <AudioUploadSection
        audioPath={editingContent.audioPath}
        onAudioPathChange={audioPath => updateContent({ audioPath })}
        contentItemId={editingContent.id}
      />

      <div>
        <label className="block text-sm font-medium mb-2">Table Data</label>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left w-16">Row</th>
                {editingContent.tableData.columns.map((col: Column) => (
                  <th key={col.id} className="p-2 text-left relative group">
                    <div className="flex items-center gap-2">
                      <SimpleRichEditor
                        content={col.header}
                        onChange={value => updateColumnHeader(col.id, value)}
                        className="w-full text-sm"
                        singleLine={true}
                      />
                      {editingContent.tableData.columns.length > 1 && (
                        <button
                          onClick={() => removeColumn(col.id)}
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
                    onClick={addColumn}
                    className="w-full h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Add column">
                    <Plus className="h-4 w-4" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {editingContent.tableData.rows.map((row: TableRow) => (
                <tr key={row.id} className="border-t group">
                  <td className="p-2 text-sm text-gray-500 relative">
                    <div className="flex items-center gap-2">
                      <span className="flex-1">{row.id}</span>
                      {editingContent.tableData.rows.length > 1 && (
                        <button
                          onClick={() => removeRow(row.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                          title="Remove row">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  {editingContent.tableData.columns.map((col: Column) => (
                    <td key={col.id} className="p-2">
                      <SimpleRichEditor
                        content={row.cells[col.id] || ''}
                        onChange={value => updateCell(row.id, col.id, value)}
                        className="w-full text-sm"
                        singleLine={true}
                      />
                    </td>
                  ))}
                  <td className="p-2"></td>
                </tr>
              ))}
              <tr className="border-t">
                <td className="p-2">
                  <button
                    onClick={addRow}
                    className="w-full h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Add row">
                    <Plus className="h-4 w-4" />
                  </button>
                </td>
                {editingContent.tableData.columns.map((col: Column) => (
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
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Footnotes</label>
        <div className="space-y-2">
          {(editingContent.tableData.footnotes || []).map((footnote: string, index: number) => (
            <div key={index} className="flex items-start gap-2">
              <span className="text-sm text-gray-500 pt-2 min-w-[20px]">{index + 1}.</span>

              <SimpleRichEditor
                content={footnote}
                onChange={value =>
                  updateContent({
                    tableData: {
                      ...editingContent.tableData,
                      footnotes:
                        editingContent.tableData.footnotes?.map((f: string, i: number) => (i === index ? value : f)) ||
                        [],
                    },
                  })
                }
                className="flex-1 text-sm"
                placeholder="Enter footnote text..."
                rows={2}
              />
              <button
                onClick={() =>
                  updateContent({
                    tableData: {
                      ...editingContent.tableData,
                      footnotes:
                        editingContent.tableData.footnotes?.filter((_: string, i: number) => i !== index) || [],
                    },
                  })
                }
                className="mt-1 text-red-500 hover:text-red-700 transition-colors"
                title="Remove footnote">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              updateContent({
                tableData: {
                  ...editingContent.tableData,
                  footnotes: [...(editingContent.tableData.footnotes || []), ''],
                },
              })
            }
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors">
            <Plus className="h-4 w-4" />
            Add Footnote
          </button>
        </div>
      </div>
    </div>
  );
};
