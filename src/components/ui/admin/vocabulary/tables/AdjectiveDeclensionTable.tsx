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
import { Adjective } from '@/src/types/vocabulary-new';
import { TableProps } from '@/src/types/table-props';

export interface AdjectiveDeclensionTableProps extends TableProps<Adjective> {}

export const AdjectiveDeclensionTable: React.FC<AdjectiveDeclensionTableProps> = ({
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

  if (!adjectiveDeclensionTable || adjectiveDeclensionTable.length === 0) return null;

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
              {adjectiveDeclensionTable.map((row, index) => (
                <RomanTableRow key={index} className="hover:bg-gray-50">
                  <RomanTableCell className="font-medium bg-gray-50">{row.case}</RomanTableCell>
                  <RomanTableCell className="min-w-24 text-center">
                    <TableCell
                      value={row.masculine.singular}
                      rowIndex={index}
                      cellKey="masculine.singular"
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
                      value={row.feminine.singular}
                      rowIndex={index}
                      cellKey="feminine.singular"
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
                      value={row.neuter.singular}
                      rowIndex={index}
                      cellKey="neuter.singular"
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
                      value={row.masculine.plural}
                      rowIndex={index}
                      cellKey="masculine.plural"
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
                      value={row.feminine.plural}
                      rowIndex={index}
                      cellKey="feminine.plural"
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
                      value={row.neuter.plural}
                      rowIndex={index}
                      cellKey="neuter.plural"
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
              ))}
            </RomanTableBody>
          </RomanTable>
        </div>
      )}
    </div>
  );
};
