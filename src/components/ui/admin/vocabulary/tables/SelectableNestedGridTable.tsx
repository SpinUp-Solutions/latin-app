import React from 'react';
import { Button } from '@/src/components/ui/button';
import type { NestedTableGrid, TableGrid } from '@/src/types/schema-introspection';
import { SelectableGridTable } from './SelectableGridTable';
import { getAllPathsFromGrid } from '@/src/utils/selection-helpers';

interface SelectableNestedGridTableProps {
  nestedGrid: NestedTableGrid;
  selectedPaths: Set<string>;
  onToggleCell: (path: string) => void;
  onToggleRow: (rowIdx: number, grid: TableGrid) => void;
  onToggleColumn: (colIdx: number, grid: TableGrid) => void;
  onSelectSubsection: (paths: string[]) => void;
}

export const SelectableNestedGridTable: React.FC<SelectableNestedGridTableProps> = ({
  nestedGrid,
  selectedPaths,
  onToggleCell,
  onToggleRow,
  onToggleColumn,
  onSelectSubsection,
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
          {section.subsections.map(subsection => {
            const subsectionPaths = isNested(subsection.grid) ? [] : getAllPathsFromGrid(subsection.grid);
            const allSelected = subsectionPaths.length > 0 && subsectionPaths.every(p => selectedPaths.has(p));

            return (
              <div key={subsection.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  {subsection.label && <h4 className="text-md font-medium text-gray-700">{subsection.label}</h4>}
                  {!isNested(subsection.grid) && subsectionPaths.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSelectSubsection(subsectionPaths)}
                      className="text-xs">
                      {allSelected ? 'Deselect All' : 'Select All'}
                    </Button>
                  )}
                </div>
                {isNested(subsection.grid) ? (
                  <SelectableNestedGridTable
                    nestedGrid={subsection.grid}
                    selectedPaths={selectedPaths}
                    onToggleCell={onToggleCell}
                    onToggleRow={onToggleRow}
                    onToggleColumn={onToggleColumn}
                    onSelectSubsection={onSelectSubsection}
                  />
                ) : (
                  <SelectableGridTable
                    grid={subsection.grid}
                    selectedPaths={selectedPaths}
                    onToggleCell={onToggleCell}
                    onToggleRow={rowIdx => onToggleRow(rowIdx, subsection.grid as TableGrid)}
                    onToggleColumn={colIdx => onToggleColumn(colIdx, subsection.grid as TableGrid)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
