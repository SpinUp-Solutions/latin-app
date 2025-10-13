import React, { useMemo } from 'react';
import type { z } from 'zod';
import type { TableGrid, NestedTableGrid } from '@/src/types/schema-introspection';
import type { EditingCell } from '@/src/types/admin-vocabulary';
import { introspectSchema } from '@/src/utils/schema-introspector';
import { buildTableGrid } from '@/src/utils/table-builder';
import { GridTable } from './GridTable';
import { NestedGridTable } from './NestedGridTable';
import { TableToggleButton } from '../shared/TableToggleButton';
import type { EditCallbacks } from './EditableArrayCell';

interface SchemaTableProps {
  schema: z.ZodTypeAny;
  data: unknown;
  tableType: string;
  title: string;
  color?: string;
  isExpanded: boolean;
  onToggle: () => void;
  isEditMode?: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  editCallbacks?: EditCallbacks;
}

function isNestedGrid(grid: TableGrid | NestedTableGrid): grid is NestedTableGrid {
  return 'sections' in grid;
}

export const SchemaTable: React.FC<SchemaTableProps> = ({
  schema,
  data,
  tableType,
  title,
  color = 'text-blue-700',
  isExpanded,
  onToggle,
  isEditMode = false,
  editingCell,
  editingCellValue = '',
  editCallbacks,
}) => {
  const schemaNode = useMemo(() => introspectSchema(schema), [schema]);
  const gridData = buildTableGrid(schemaNode, data);

  return (
    <div className="mt-4 border-t pt-4">
      <TableToggleButton isExpanded={isExpanded} onToggle={onToggle} title={title} color={color} />
      {isExpanded && (
        <div className="mt-3">
          {isNestedGrid(gridData) ? (
            <NestedGridTable
              nestedGrid={gridData}
              tableType={tableType}
              isEditMode={isEditMode}
              editingCell={editingCell}
              editingCellValue={editingCellValue}
              editCallbacks={editCallbacks}
            />
          ) : (
            <GridTable
              grid={gridData}
              tableType={tableType}
              isEditMode={isEditMode}
              editingCell={editingCell}
              editingCellValue={editingCellValue}
              editCallbacks={editCallbacks}
            />
          )}
        </div>
      )}
    </div>
  );
};
