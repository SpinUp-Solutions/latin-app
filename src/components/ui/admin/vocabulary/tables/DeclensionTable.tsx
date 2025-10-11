import React from 'react';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableHead,
  RomanTableRow,
  RomanTableCell,
} from '@/src/components/ui/core/roman-table';
import { TABLE_TYPES } from '@/src/utils/vocabUtils';
import { TableCell } from '../shared/TableCell';
import { TableToggleButton } from '../shared/TableToggleButton';
import { Noun, Pronoun } from '@/src/types/vocabulary/vocabulary-new';
import { TableProps } from '@/src/types/table-props';
import { NOUN_STRUCTURE } from '@/src/types/vocabulary/structure';

export const DeclensionTable: React.FC<TableProps<Noun | Pronoun>> = ({
  word,
  isExpanded,
  onToggle,
  isEditMode = false,
  editingCell,
  editingCellValue = '',
  onCellDoubleClick,
  onCellEditSave,
  onCellEditCancel,
  onEditingCellValueChange,
}) => {
  const declensionTable = word.declension_table;

  return (
    <div className="mt-4 border-t pt-4">
      <TableToggleButton isExpanded={isExpanded} onToggle={onToggle} title="Declension Table" color="text-blue-600" />
      {isExpanded && (
        <div className="mt-3 overflow-x-auto">
          <RomanTable>
            <RomanTableHeader>
              <RomanTableRow>
                <RomanTableHead className="w-24">Case</RomanTableHead>
                <RomanTableHead>Singular</RomanTableHead>
                <RomanTableHead>Plural</RomanTableHead>
              </RomanTableRow>
            </RomanTableHeader>
            <RomanTableBody>
              {NOUN_STRUCTURE.declensionTable.cases.map(caseName => {
                const row = declensionTable?.[caseName];
                return (
                  <RomanTableRow key={caseName} className="hover:bg-gray-50">
                    <RomanTableCell className="font-medium bg-gray-50 capitalize">{caseName}</RomanTableCell>
                    <RomanTableCell className="min-w-32">
                      <TableCell
                        value={row?.singular}
                        rowIndex={0}
                        cellKey={`${caseName}.singular`}
                        tableType={TABLE_TYPES.DECLENSION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="min-w-32">
                      <TableCell
                        value={row?.plural}
                        rowIndex={0}
                        cellKey={`${caseName}.plural`}
                        tableType={TABLE_TYPES.DECLENSION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                  </RomanTableRow>
                );
              })}
            </RomanTableBody>
          </RomanTable>
        </div>
      )}
    </div>
  );
};
