import React, { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import type { TableGrid, NestedTableGrid } from '@/src/types/schema-introspection';
import { ConjugationTableSchema } from '@/shared/types/vocabulary/schemas/verb-conjugation';
import {
  DeclensionTableSchema,
  AdjectiveDeclensionTableSchema,
  PersonalPronounDeclensionTableSchema,
  DegreesTableSchema,
} from '@/shared/types/vocabulary/schemas';
import { introspectSchema } from '@/src/utils/schema-introspector';
import { buildTableGrid } from '@/src/utils/table-builder';
import { buildEmptyFromSchema } from '@/src/utils/schema-defaults';
import { SelectableGridTable } from './tables/SelectableGridTable';
import { SelectableNestedGridTable } from './tables/SelectableNestedGridTable';
import { getAllPathsFromRow, getAllPathsFromColumn } from '@/src/utils/selection-helpers';
import { shouldUsePersonalPronounSchema } from '@/src/utils/generated/tableType';

interface FormSelectionTableProps {
  partOfSpeech: PartOfSpeech | 'all';
  pronounType?: PronounType | 'all';
  pronounPerson?: PronounPerson | 'all';
  selectedCellPaths: string[];
  onToggleCell: (path: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onTogglePaths: (paths: string[]) => void;
}

function isNestedGrid(grid: TableGrid | NestedTableGrid): grid is NestedTableGrid {
  return 'sections' in grid;
}

export const FormSelectionTable: React.FC<FormSelectionTableProps> = ({
  partOfSpeech,
  pronounType,
  pronounPerson,
  selectedCellPaths,
  onToggleCell,
  onSelectAll,
  onClearSelection,
  onTogglePaths,
}) => {
  const gridData = useMemo(() => {
    if (partOfSpeech === 'verb') {
      const emptyData = buildEmptyFromSchema(ConjugationTableSchema);
      const schemaNode = introspectSchema(ConjugationTableSchema);
      return buildTableGrid(schemaNode, emptyData);
    } else if (partOfSpeech === 'noun') {
      const emptyData = buildEmptyFromSchema(DeclensionTableSchema);
      const schemaNode = introspectSchema(DeclensionTableSchema);
      return buildTableGrid(schemaNode, emptyData);
    } else if (partOfSpeech === 'pronoun') {
      const schema = shouldUsePersonalPronounSchema(pronounType, pronounPerson)
        ? PersonalPronounDeclensionTableSchema
        : AdjectiveDeclensionTableSchema;
      const emptyData = buildEmptyFromSchema(schema);
      const schemaNode = introspectSchema(schema);
      return buildTableGrid(schemaNode, emptyData);
    } else if (partOfSpeech === 'adjective') {
      const emptyData = buildEmptyFromSchema(DegreesTableSchema);
      const schemaNode = introspectSchema(DegreesTableSchema);
      return buildTableGrid(schemaNode, emptyData);
    }
    return null;
  }, [partOfSpeech, pronounType, pronounPerson]);

  if (!gridData || partOfSpeech === 'all') {
    return null;
  }

  const selectedPathsSet = new Set(selectedCellPaths);

  const handleToggleRow = (rowIdx: number, grid: TableGrid) => {
    const paths = getAllPathsFromRow(grid, rowIdx);
    onTogglePaths(paths);
  };

  const handleToggleColumn = (colIdx: number, grid: TableGrid) => {
    const paths = getAllPathsFromColumn(grid, colIdx);
    onTogglePaths(paths);
  };

  const handleSelectSubsection = (paths: string[]) => {
    onTogglePaths(paths);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-md font-serif font-semibold text-gray-800">Select Forms to Display</h3>
          <Badge variant="secondary" className="text-xs">
            {selectedCellPaths.length} selected
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onSelectAll} variant="default" className="bg-roman-red hover:bg-roman-red/90">
            Select All
          </Button>
          <Button size="sm" onClick={onClearSelection} variant="outline">
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isNestedGrid(gridData) ? (
          <SelectableNestedGridTable
            nestedGrid={gridData}
            selectedPaths={selectedPathsSet}
            onToggleCell={onToggleCell}
            onToggleRow={handleToggleRow}
            onToggleColumn={handleToggleColumn}
            onSelectSubsection={handleSelectSubsection}
          />
        ) : (
          <SelectableGridTable
            grid={gridData}
            selectedPaths={selectedPathsSet}
            onToggleCell={onToggleCell}
            onToggleRow={rowIdx => handleToggleRow(rowIdx, gridData)}
            onToggleColumn={colIdx => handleToggleColumn(colIdx, gridData)}
          />
        )}
      </CardContent>
    </Card>
  );
};
