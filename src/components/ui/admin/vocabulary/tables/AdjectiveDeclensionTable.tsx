import React from 'react';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableHead,
  RomanTableRow,
  RomanTableCell,
} from '@/src/components/ui/core/roman-table';
import { formatCellValue } from '@/src/utils/vocabUtils';
import { EditableCell } from '../shared/EditableCell';
import { TableToggleButton } from '../shared/TableToggleButton';
import { BaseTableProps } from '@/src/types/admin-vocabulary';
import { SimpleRichDisplay } from '../../core/simple-rich-display';

export const AdjectiveDeclensionTable: React.FC<BaseTableProps> = ({
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
  const adjectiveDeclensionTable = word.adjectiveDeclensionTable;

  if (!adjectiveDeclensionTable || adjectiveDeclensionTable.length === 0) return null;

  const renderCell = (value: string[], rowIndex: number, cellKey: string) => {
    if (isEditMode && onCellDoubleClick && onCellEditSave && onCellEditCancel && onEditingCellValueChange) {
      return (
        <EditableCell
          value={value}
          rowIndex={rowIndex}
          cellKey={cellKey}
          tableType="adjective-declension"
          editingCell={editingCell || null}
          editingCellValue={editingCellValue}
          onCellDoubleClick={onCellDoubleClick}
          onCellEditSave={onCellEditSave}
          onCellEditCancel={onCellEditCancel}
          onEditingCellValueChange={onEditingCellValueChange}
        />
      );
    }
    return <SimpleRichDisplay content={formatCellValue(value) || '—'} />;
  };

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
                    {renderCell(row.masculine.singular, index, 'masculine.singular')}
                  </RomanTableCell>
                  <RomanTableCell className="min-w-24 text-center">
                    {renderCell(row.feminine.singular, index, 'feminine.singular')}
                  </RomanTableCell>
                  <RomanTableCell className="min-w-24 text-center">
                    {renderCell(row.neuter.singular, index, 'neuter.singular')}
                  </RomanTableCell>
                  <RomanTableCell className="min-w-24 text-center">
                    {renderCell(row.masculine.plural, index, 'masculine.plural')}
                  </RomanTableCell>
                  <RomanTableCell className="min-w-24 text-center">
                    {renderCell(row.feminine.plural, index, 'feminine.plural')}
                  </RomanTableCell>
                  <RomanTableCell className="min-w-24 text-center">
                    {renderCell(row.neuter.plural, index, 'neuter.plural')}
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
