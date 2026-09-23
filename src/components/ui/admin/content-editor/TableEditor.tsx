import React from 'react';
import { TableContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import type { Column, TableRow } from '@/src/components/ui/lesson/conjugation-table';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { AudioUploadSection } from './AudioUploadSection';
import { EditableTableGrid } from './EditableTableGrid';
import { TableFootnotesEditor } from './TableFootnotesEditor';

export const TableEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lessonEditor.editingContent?.content as TableContent);

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
              title: value,
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
        <EditableTableGrid<TableRow>
          columns={editingContent.tableData.columns}
          rows={editingContent.tableData.rows}
          onAddColumn={addColumn}
          onRemoveColumn={removeColumn}
          onUpdateColumnHeader={updateColumnHeader}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          renderCell={(row, col) => (
            <SimpleRichEditor
              content={row.cells[col.id] || ''}
              onChange={value => updateCell(row.id, col.id, value)}
              className="w-full text-sm"
              singleLine={true}
            />
          )}
        />
      </div>

      <TableFootnotesEditor
        footnotes={editingContent.tableData.footnotes}
        addButton="text"
        onChange={footnotes =>
          updateContent({
            tableData: {
              ...editingContent.tableData,
              footnotes,
            },
          })
        }
      />
    </div>
  );
};
