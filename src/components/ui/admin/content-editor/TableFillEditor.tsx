import React from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { TableFillExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import type { TableFillColumn, TableFillRow, TableFillCell } from '@/src/types/exercises/table-fill';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { AudioUploadSection } from './AudioUploadSection';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { Button } from '../../button';
import { cn } from '@/src/lib/utils';

export const TableFillEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lessonEditor.editingContent?.content as TableFillExercise);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<TableFillExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<TableFillExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const addColumn = () => {
    const newColumn: TableFillColumn = {
      id: `col-${Date.now()}`,
      header: 'New Column',
    };

    const updatedData = {
      ...editingContent.data,
      columns: [...editingContent.data.columns, newColumn],
      rows: editingContent.data.rows.map((row: TableFillRow) => ({
        ...row,
        cells: {
          ...row.cells,
          [newColumn.id]: { content: '', isBlank: false },
        },
      })),
    };

    updateData(updatedData);
  };

  const addRow = () => {
    const newRow: TableFillRow = {
      id: `row-${Date.now()}`,
      cells: editingContent.data.columns.reduce((acc: Record<string, TableFillCell>, col: TableFillColumn) => {
        acc[col.id] = { content: '', isBlank: false };
        return acc;
      }, {}),
    };

    updateData({
      rows: [...editingContent.data.rows, newRow],
    });
  };

  const removeColumn = (columnId: string) => {
    const updatedData = {
      ...editingContent.data,
      columns: editingContent.data.columns.filter((col: TableFillColumn) => col.id !== columnId),
      rows: editingContent.data.rows.map((row: TableFillRow) => {
        const newCells = { ...row.cells };
        delete newCells[columnId];
        return { ...row, cells: newCells };
      }),
    };

    updateData(updatedData);
  };

  const removeRow = (rowId: string) => {
    updateData({
      rows: editingContent.data.rows.filter((row: TableFillRow) => row.id !== rowId),
    });
  };

  const updateCell = (rowId: string, colId: string, updates: Partial<TableFillCell>) => {
    const updatedData = {
      ...editingContent.data,
      rows: editingContent.data.rows.map((row: TableFillRow) =>
        row.id === rowId
          ? {
              ...row,
              cells: {
                ...row.cells,
                [colId]: { ...row.cells[colId], ...updates },
              },
            }
          : row
      ),
    };

    updateData(updatedData);
  };

  const updateColumnHeader = (columnId: string, header: string) => {
    updateData({
      columns: editingContent.data.columns.map((c: TableFillColumn) => (c.id === columnId ? { ...c, header } : c)),
    });
  };

  const toggleCellBlank = (rowId: string, colId: string) => {
    const row = editingContent.data.rows.find((r: TableFillRow) => r.id === rowId);
    const cell = row?.cells[colId];

    if (!cell) return;

    const updates: Partial<TableFillCell> = {
      isBlank: !cell.isBlank,
    };

    if (!cell.isBlank) {
      updates.answer = '';
    }

    updateCell(rowId, colId, updates);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Exercise Title</label>
          <SimpleRichEditor
            content={editingContent.title || ''}
            onChange={value => updateContent({ title: value })}
            placeholder="Enter exercise title..."
            singleLine={true}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Instructions</label>
          <SimpleRichEditor
            content={editingContent.instructions || ''}
            onChange={value => updateContent({ instructions: value })}
            placeholder="Provide instructions for students..."
            rows={3}
            className="w-full"
          />
        </div>

        <AudioUploadSection
          audioPath={editingContent.audioPath}
          onAudioPathChange={audioPath => updateContent({ audioPath })}
          contentItemId={editingContent.id}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Table Title</label>
        <SimpleRichEditor
          content={editingContent.data.title || ''}
          onChange={value => updateData({ title: value })}
          className="w-full"
          placeholder="Enter table title..."
          singleLine={true}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Table Data</label>
        <p className="text-sm text-gray-600 mb-3">
          Use the toggle buttons to mark cells as blanks that students will fill in.
        </p>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left w-16">Row</th>
                {editingContent.data.columns.map((col: TableFillColumn) => (
                  <th key={col.id} className="p-2 text-left relative group">
                    <div className="flex items-center gap-2">
                      <SimpleRichEditor
                        content={col.header}
                        onChange={value => updateColumnHeader(col.id, value)}
                        className="w-full text-sm"
                        singleLine={true}
                      />
                      {editingContent.data.columns.length > 1 && (
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
              {editingContent.data.rows.map((row: TableFillRow) => (
                <tr key={row.id} className="border-t group">
                  <td className="p-2 text-sm text-gray-500 relative">
                    <div className="flex items-center gap-2">
                      <span className="flex-1">{row.id}</span>
                      {editingContent.data.rows.length > 1 && (
                        <button
                          onClick={() => removeRow(row.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                          title="Remove row">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  {editingContent.data.columns.map((col: TableFillColumn) => {
                    const cell = row.cells[col.id];
                    return (
                      <td key={col.id} className="p-2">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              onClick={() => toggleCellBlank(row.id, col.id)}
                              className={cn(
                                'flex items-center gap-1 text-xs px-2 py-1 rounded',
                                cell?.isBlank
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              )}
                              title={
                                cell?.isBlank ? 'Make this a normal cell' : 'Make this a blank for students to fill'
                              }>
                              {cell?.isBlank ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
                              {cell?.isBlank ? 'Blank' : 'Normal'}
                            </button>
                          </div>

                          {!cell?.isBlank && (
                            <SimpleRichEditor
                              content={cell?.content || ''}
                              onChange={value => updateCell(row.id, col.id, { content: value })}
                              className="w-full text-sm"
                              placeholder="Cell content"
                              singleLine={true}
                            />
                          )}

                          {cell?.isBlank && (
                            <div className="space-y-2 p-2 bg-blue-50 rounded">
                              <input
                                type="text"
                                value={cell.answer || ''}
                                onChange={e => updateCell(row.id, col.id, { answer: e.target.value })}
                                placeholder="Correct answer (plain text)"
                                className="w-full p-2 text-sm border rounded"
                              />
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
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
                {editingContent.data.columns.map((col: TableFillColumn) => (
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

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Exercise Hint</label>
          <SimpleRichEditor
            content={editingContent.data.hint || ''}
            onChange={value => updateData({ hint: value })}
            placeholder="Optional hint shown when students make mistakes..."
            rows={2}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Explanation</label>
          <SimpleRichEditor
            content={editingContent.data.explanation || ''}
            onChange={value => updateData({ explanation: value })}
            placeholder="Optional explanation shown after correct completion..."
            rows={3}
            className="w-full"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Footnotes</label>
        <div className="space-y-2">
          {(editingContent.data.footnotes || []).map((footnote: string, index: number) => (
            <div key={index} className="flex items-start gap-2">
              <span className="text-sm text-gray-500 pt-2 min-w-[20px]">{index + 1}.</span>
              <SimpleRichEditor
                content={footnote}
                onChange={value =>
                  updateData({
                    footnotes:
                      editingContent.data.footnotes?.map((f: string, i: number) => (i === index ? value : f)) || [],
                  })
                }
                className="flex-1 text-sm"
                placeholder="Enter footnote text..."
                rows={2}
              />
              <button
                onClick={() =>
                  updateData({
                    footnotes: editingContent.data.footnotes?.filter((_: string, i: number) => i !== index) || [],
                  })
                }
                className="mt-1 text-red-500 hover:text-red-700 transition-colors"
                title="Remove footnote">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button
            onClick={() =>
              updateData({
                footnotes: [...(editingContent.data.footnotes || []), ''],
              })
            }
            variant="outline"
            size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Footnote
          </Button>
        </div>
      </div>

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
      />
    </div>
  );
};
