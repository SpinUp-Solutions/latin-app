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

export const DeclensionTable: React.FC<BaseTableProps> = ({
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
  const declensionTable = word.declensionTable;

  if (!declensionTable || declensionTable.length === 0) return null;

  const renderCell = (value: string[], rowIndex: number, cellKey: string) => {
    if (isEditMode && onCellDoubleClick && onCellEditSave && onCellEditCancel && onEditingCellValueChange) {
      return (
        <EditableCell
          value={value}
          rowIndex={rowIndex}
          cellKey={cellKey}
          tableType="declension"
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
              {declensionTable.map((row, index) => (
                <RomanTableRow key={index} className="hover:bg-gray-50">
                  <RomanTableCell className="font-medium bg-gray-50">{row.case}</RomanTableCell>
                  <RomanTableCell className="min-w-32">{renderCell(row.singular, index, 'singular')}</RomanTableCell>
                  <RomanTableCell className="min-w-32">{renderCell(row.plural, index, 'plural')}</RomanTableCell>
                </RomanTableRow>
              ))}
            </RomanTableBody>
          </RomanTable>
        </div>
      )}
    </div>
  );
};
