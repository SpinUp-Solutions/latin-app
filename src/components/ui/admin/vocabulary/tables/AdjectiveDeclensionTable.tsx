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
import { Adjective } from '@/src/types/vocabulary/vocabulary-new';
import { TableProps } from '@/src/types/table-props';
import { ADJECTIVE_STRUCTURE } from '@/src/types/vocabulary/structure';

export const AdjectiveDeclensionTable: React.FC<TableProps<Adjective>> = ({
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
  const adjectiveDeclensionTable = word.adjective_declension_table;

  return (
    <div className="mt-4 border-t pt-4">
      <TableToggleButton
        isExpanded={isExpanded}
        onToggle={onToggle}
        title="Adjective Declension Table"
        color="text-purple-600"
      />
      {isExpanded && (
        <div className="mt-3 overflow-x-auto">
          <RomanTable>
            <RomanTableHeader>
              <RomanTableRow>
                <RomanTableHead className="w-20">Case</RomanTableHead>
                <RomanTableHead className="text-center">Masc. Sing.</RomanTableHead>
                <RomanTableHead className="text-center">Fem. Sing.</RomanTableHead>
                <RomanTableHead className="text-center">Neut. Sing.</RomanTableHead>
                <RomanTableHead className="text-center">Masc. Plur.</RomanTableHead>
                <RomanTableHead className="text-center">Fem. Plur.</RomanTableHead>
                <RomanTableHead className="text-center">Neut. Plur.</RomanTableHead>
              </RomanTableRow>
            </RomanTableHeader>
            <RomanTableBody>
              {ADJECTIVE_STRUCTURE.declensionTable.cases.map(caseName => {
                const row = adjectiveDeclensionTable?.[caseName];
                return (
                  <RomanTableRow key={caseName} className="hover:bg-gray-50">
                    <RomanTableCell className="font-medium bg-gray-50 capitalize">{caseName}</RomanTableCell>
                    <RomanTableCell className="min-w-24 text-center">
                      <TableCell
                        value={row?.masculine?.singular}
                        rowIndex={0}
                        cellKey={`${caseName}.masculine.singular`}
                        tableType={TABLE_TYPES.ADJECTIVE_DECLENSION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="min-w-24 text-center">
                      <TableCell
                        value={row?.feminine?.singular}
                        rowIndex={0}
                        cellKey={`${caseName}.feminine.singular`}
                        tableType={TABLE_TYPES.ADJECTIVE_DECLENSION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="min-w-24 text-center">
                      <TableCell
                        value={row?.neuter?.singular}
                        rowIndex={0}
                        cellKey={`${caseName}.neuter.singular`}
                        tableType={TABLE_TYPES.ADJECTIVE_DECLENSION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="min-w-24 text-center">
                      <TableCell
                        value={row?.masculine?.plural}
                        rowIndex={0}
                        cellKey={`${caseName}.masculine.plural`}
                        tableType={TABLE_TYPES.ADJECTIVE_DECLENSION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="min-w-24 text-center">
                      <TableCell
                        value={row?.feminine?.plural}
                        rowIndex={0}
                        cellKey={`${caseName}.feminine.plural`}
                        tableType={TABLE_TYPES.ADJECTIVE_DECLENSION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="min-w-24 text-center">
                      <TableCell
                        value={row?.neuter?.plural}
                        rowIndex={0}
                        cellKey={`${caseName}.neuter.plural`}
                        tableType={TABLE_TYPES.ADJECTIVE_DECLENSION}
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
