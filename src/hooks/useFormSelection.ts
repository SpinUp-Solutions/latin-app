import { useCallback } from 'react';
import type { TableGrid, NestedTableGrid } from '@/src/types/schema-introspection';
import type { FormSelection } from '@/src/types/exercises/base';
import { ConjugationTableSchema } from '@/src/types/vocabulary/schemas/verb-conjugation';
import { DeclensionTableSchema, DegreesTableSchema } from '@/src/types/vocabulary/schemas';
import { introspectSchema } from '@/src/utils/schema-introspector';
import { buildTableGrid } from '@/src/utils/table-builder';
import { buildEmptyFromSchema } from '@/src/utils/schema-defaults';
import { getAllPathsFromGrid, getAllPathsFromNestedGrid } from '@/src/utils/selection-helpers';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';

interface FormSelectionHelpers {
  toggleCell: (path: string, currentPaths: string[]) => string[];
  togglePaths: (paths: string[], currentPaths: string[]) => string[];
  getAllPaths: (partOfSpeech: string) => string[];
}

export const useFormSelection = (): FormSelectionHelpers => {
  const toggleCell = useCallback((path: string, currentPaths: string[]): string[] => {
    const index = currentPaths.indexOf(path);
    return index === -1 ? [...currentPaths, path] : currentPaths.filter(p => p !== path);
  }, []);

  const togglePaths = useCallback((paths: string[], currentPaths: string[]): string[] => {
    const selectedSet = new Set(currentPaths);
    const allSelected = paths.every(p => selectedSet.has(p));

    return allSelected
      ? currentPaths.filter(p => !paths.includes(p))
      : [...currentPaths, ...paths.filter(p => !selectedSet.has(p))];
  }, []);

  const getAllPaths = useCallback((partOfSpeech: string): string[] => {
    if (partOfSpeech === 'verb') {
      const emptyData = buildEmptyFromSchema(ConjugationTableSchema);
      const schemaNode = introspectSchema(ConjugationTableSchema);
      const grid = buildTableGrid(schemaNode, emptyData);
      return getAllPathsFromNestedGrid(grid as NestedTableGrid);
    } else if (partOfSpeech === 'noun') {
      const emptyData = buildEmptyFromSchema(DeclensionTableSchema);
      const schemaNode = introspectSchema(DeclensionTableSchema);
      const grid = buildTableGrid(schemaNode, emptyData);
      return getAllPathsFromGrid(grid as TableGrid);
    } else if (partOfSpeech === 'adjective') {
      const emptyData = buildEmptyFromSchema(DegreesTableSchema);
      const schemaNode = introspectSchema(DegreesTableSchema);
      const grid = buildTableGrid(schemaNode, emptyData);
      return getAllPathsFromNestedGrid(grid as NestedTableGrid);
    }
    return [];
  }, []);

  return {
    toggleCell,
    togglePaths,
    getAllPaths,
  };
};

export const useFormSelectionControls = (
  partOfSpeech: string | undefined,
  formSelection: FormSelection | undefined,
  onChange: (selection: FormSelection) => void
) => {
  const { toggleCell, togglePaths, getAllPaths } = useFormSelection();

  const resolveTableType = useCallback(() => {
    if (formSelection?.tableType) {
      return formSelection.tableType;
    }
    if (!partOfSpeech || partOfSpeech === 'all') {
      return undefined;
    }
    return deriveTableTypeFromPOS(partOfSpeech);
  }, [formSelection?.tableType, partOfSpeech]);

  const updateSelection = useCallback(
    (paths: string[]) => {
      const tableType = resolveTableType();
      if (!tableType) {
        return;
      }
      onChange({
        tableType,
        selectedCellPaths: paths,
      });
    },
    [onChange, resolveTableType]
  );

  const handleToggleCell = useCallback(
    (path: string) => {
      const nextPaths = toggleCell(path, formSelection?.selectedCellPaths ?? []);
      updateSelection(nextPaths);
    },
    [formSelection?.selectedCellPaths, toggleCell, updateSelection]
  );

  const handleTogglePaths = useCallback(
    (paths: string[]) => {
      const nextPaths = togglePaths(paths, formSelection?.selectedCellPaths ?? []);
      updateSelection(nextPaths);
    },
    [formSelection?.selectedCellPaths, togglePaths, updateSelection]
  );

  const handleSelectAll = useCallback(() => {
    if (!partOfSpeech || partOfSpeech === 'all') {
      return;
    }
    const allPaths = getAllPaths(partOfSpeech);
    updateSelection(allPaths);
  }, [getAllPaths, partOfSpeech, updateSelection]);

  const handleClearSelection = useCallback(() => {
    updateSelection([]);
  }, [updateSelection]);

  return {
    handleToggleCell,
    handleTogglePaths,
    handleSelectAll,
    handleClearSelection,
  };
};
