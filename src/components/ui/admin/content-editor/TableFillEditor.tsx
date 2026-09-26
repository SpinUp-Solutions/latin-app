import React from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import { TableFillExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import type { TableFillColumn, TableFillRow, TableFillCell } from '@/src/types/exercises/table-fill';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { cn } from '@/src/lib/utils';
import { ExerciseHeaderFields } from './ExerciseHeaderFields';
import { EditableTableGrid } from './EditableTableGrid';
import { TableFootnotesEditor } from './TableFootnotesEditor';

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

    updateData({
      columns: [...editingContent.data.columns, newColumn],
      rows: editingContent.data.rows.map((row: TableFillRow) => ({
        ...row,
        cells: {
          ...row.cells,
          [newColumn.id]: { content: '', isBlank: false },
        },
      })),
    });
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
    updateData({
      columns: editingContent.data.columns.filter((col: TableFillColumn) => col.id !== columnId),
      rows: editingContent.data.rows.map((row: TableFillRow) => {
        const newCells = { ...row.cells };
        delete newCells[columnId];
        return { ...row, cells: newCells };
      }),
    });
  };

  const removeRow = (rowId: string) => {
    updateData({
      rows: editingContent.data.rows.filter((row: TableFillRow) => row.id !== rowId),
    });
  };

  const updateCell = (rowId: string, colId: string, updates: Partial<TableFillCell>) => {
    updateData({
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
    });
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
      <ExerciseHeaderFields
        title={editingContent.title || ''}
        instructions={editingContent.instructions || ''}
        onTitleChange={value => updateContent({ title: value })}
        onInstructionsChange={value => updateContent({ instructions: value })}
        audioPath={editingContent.audioPath}
        onAudioPathChange={audioPath => updateContent({ audioPath })}
        contentItemId={editingContent.id}
      />

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

        <EditableTableGrid
          columns={editingContent.data.columns}
          rows={editingContent.data.rows}
          containerClassName="overflow-hidden"
          onAddColumn={addColumn}
          onRemoveColumn={removeColumn}
          onUpdateColumnHeader={updateColumnHeader}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          renderCell={(row, col) => {
            const cell = row.cells[col.id];
            return (
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
                    title={cell?.isBlank ? 'Make this a normal cell' : 'Make this a blank for students to fill'}>
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
            );
          }}
        />
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

      <TableFootnotesEditor
        footnotes={editingContent.data.footnotes}
        addButton="outline"
        onChange={footnotes => updateData({ footnotes })}
      />

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
      />
    </div>
  );
};
