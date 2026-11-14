import React from 'react';
import type { CellDef, NestedTableGrid, TableGrid } from '@/src/types/schema-introspection';
import type { EditingCell } from '@/src/types/admin-vocabulary';
import { GridTable, gridHasVisibleRows } from './GridTable';
import type { EditCallbacks } from './EditableArrayCell';

interface NestedGridTableProps {
  nestedGrid: NestedTableGrid;
  tableType: string;
  isEditMode?: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  editCallbacks?: EditCallbacks;
  renderCell?: (cell: CellDef) => React.ReactNode;
  cellFilter?: (cell: CellDef) => boolean;
}

const isNested = (grid: TableGrid | NestedTableGrid): grid is NestedTableGrid => 'sections' in grid;

const hasVisibleRows = (grid: TableGrid | NestedTableGrid, cellFilter?: (cell: CellDef) => boolean): boolean =>
  isNested(grid)
    ? grid.sections.some(section => section.subsections.some(subsection => hasVisibleRows(subsection.grid, cellFilter)))
    : gridHasVisibleRows(grid, cellFilter);

export const NestedGridTable: React.FC<NestedGridTableProps> = ({
  nestedGrid,
  tableType,
  isEditMode = false,
  editingCell,
  editingCellValue = '',
  editCallbacks,
  renderCell,
  cellFilter,
}) => {
  const sections = cellFilter
    ? nestedGrid.sections.filter(section =>
        section.subsections.some(subsection => hasVisibleRows(subsection.grid, cellFilter))
      )
    : nestedGrid.sections;

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {sections.map(section => (
        <div key={section.sectionKey} className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">{section.sectionLabel}</h3>
          {section.subsections
            .filter(subsection => !cellFilter || hasVisibleRows(subsection.grid, cellFilter))
            .map(subsection => (
              <div key={subsection.key} className="space-y-2">
                {subsection.label ? <h4 className="text-md font-medium text-gray-700">{subsection.label}</h4> : null}
                {isNested(subsection.grid) ? (
                  <NestedGridTable
                    nestedGrid={subsection.grid}
                    tableType={tableType}
                    isEditMode={isEditMode}
                    editingCell={editingCell}
                    editingCellValue={editingCellValue}
                    editCallbacks={editCallbacks}
                    renderCell={renderCell}
                    cellFilter={cellFilter}
                  />
                ) : (
                  <GridTable
                    grid={subsection.grid}
                    tableType={tableType}
                    isEditMode={isEditMode}
                    editingCell={editingCell}
                    editingCellValue={editingCellValue}
                    editCallbacks={editCallbacks}
                    renderCell={renderCell}
                    cellFilter={cellFilter}
                  />
                )}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
};
