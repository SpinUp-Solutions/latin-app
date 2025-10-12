import React from 'react';
import type { NestedTableGrid, TableGrid } from '@/src/types/schema-introspection';
import type { EditingCell } from '@/src/types/admin-vocabulary';
import { GridTable } from './GridTable';

interface NestedGridTableProps {
  nestedGrid: NestedTableGrid;
  tableType: string;
  isEditMode?: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  onCellDoubleClick?: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave?: () => void;
  onCellEditCancel?: () => void;
  onEditingCellValueChange?: (value: string) => void;
}

export const NestedGridTable: React.FC<NestedGridTableProps> = ({
  nestedGrid,
  tableType,
  isEditMode = false,
  editingCell,
  editingCellValue = '',
  onCellDoubleClick,
  onCellEditSave,
  onCellEditCancel,
  onEditingCellValueChange,
}) => {
  const { sections } = nestedGrid;

  if (sections.length === 0) {
    return null;
  }

  const isNested = (grid: TableGrid | NestedTableGrid): grid is NestedTableGrid => 'sections' in grid;

  return (
    <div className="space-y-6">
      {sections.map(section => (
        <div key={section.sectionKey} className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">{section.sectionLabel}</h3>
          {section.subsections.map(subsection => (
            <div key={subsection.key} className="space-y-2">
              {subsection.label ? <h4 className="text-md font-medium text-gray-700">{subsection.label}</h4> : null}
              {isNested(subsection.grid) ? (
                <NestedGridTable
                  nestedGrid={subsection.grid}
                  tableType={tableType}
                  isEditMode={isEditMode}
                  editingCell={editingCell}
                  editingCellValue={editingCellValue}
                  onCellDoubleClick={onCellDoubleClick}
                  onCellEditSave={onCellEditSave}
                  onCellEditCancel={onCellEditCancel}
                  onEditingCellValueChange={onEditingCellValueChange}
                />
              ) : (
                <GridTable
                  grid={subsection.grid}
                  tableType={tableType}
                  isEditMode={isEditMode}
                  editingCell={editingCell}
                  editingCellValue={editingCellValue}
                  onCellDoubleClick={onCellDoubleClick}
                  onCellEditSave={onCellEditSave}
                  onCellEditCancel={onCellEditCancel}
                  onEditingCellValueChange={onEditingCellValueChange}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
