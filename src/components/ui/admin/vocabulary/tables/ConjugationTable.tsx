import React from 'react';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableHead,
  RomanTableRow,
  RomanTableCell,
} from '@/src/components/ui/core/roman-table';
import { type ConjugationTable as ConjugationTableType } from '@/src/types/admin-vocabulary';
import { formatCellValue } from '@/src/utils/vocabUtils';
import { EditableCell } from '../shared/EditableCell';
import { TableToggleButton } from '../shared/TableToggleButton';
import { BaseTableProps } from '@/src/types/admin-vocabulary';

export const ConjugationTable: React.FC<BaseTableProps> = ({
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
  const conjugationTable = word.conjugationTable;

  if (!conjugationTable) return null;

  const renderConjugationCell = (value: string[] | undefined, cellKey: string, rowIndex: number = 0) => {
    const cellValue = value || [];

    if (isEditMode && onCellDoubleClick && onCellEditSave && onCellEditCancel && onEditingCellValueChange) {
      return (
        <EditableCell
          value={cellValue}
          rowIndex={rowIndex}
          cellKey={cellKey}
          tableType="conjugation"
          editingCell={editingCell || null}
          editingCellValue={editingCellValue}
          onCellDoubleClick={onCellDoubleClick}
          onCellEditSave={onCellEditSave}
          onCellEditCancel={onCellEditCancel}
          onEditingCellValueChange={onEditingCellValueChange}
        />
      );
    }

    return formatCellValue(cellValue) || '—';
  };

  const renderTenseSection = (
    mood: 'indicative' | 'subjunctive',
    voice: 'active' | 'passive',
    moodData: NonNullable<ConjugationTableType['indicative'] | ConjugationTableType['subjunctive']>
  ) => {
    if (!moodData || !moodData[voice]) return null;

    const voiceData = moodData[voice];
    const tenses = Object.keys(voiceData);

    if (tenses.length === 0) return null;

    const voiceColor = voice === 'active' ? 'text-green-700 border-green-200' : 'text-blue-700 border-blue-200';

    return (
      <div className="mb-6">
        <div className={`text-sm font-semibold mb-3 pb-2 border-b ${voiceColor}`}>
          {voice.charAt(0).toUpperCase() + voice.slice(1)} Voice
        </div>
        <div className="overflow-x-auto">
          <RomanTable>
            <RomanTableHeader>
              <RomanTableRow>
                <RomanTableHead className="w-24">Tense</RomanTableHead>
                <RomanTableHead className="text-center min-w-20">1st Sing.</RomanTableHead>
                <RomanTableHead className="text-center min-w-20">2nd Sing.</RomanTableHead>
                <RomanTableHead className="text-center min-w-20">3rd Sing.</RomanTableHead>
                <RomanTableHead className="text-center min-w-20">1st Plur.</RomanTableHead>
                <RomanTableHead className="text-center min-w-20">2nd Plur.</RomanTableHead>
                <RomanTableHead className="text-center min-w-20">3rd Plur.</RomanTableHead>
              </RomanTableRow>
            </RomanTableHeader>
            <RomanTableBody>
              {tenses.map((tense, tenseIndex) => {
                const tenseData = voiceData[tense];
                return (
                  <RomanTableRow key={tense} className="hover:bg-gray-50">
                    <RomanTableCell className="font-medium bg-gray-50 capitalize">{tense}</RomanTableCell>
                    <RomanTableCell className="text-center">
                      {renderConjugationCell(
                        tenseData?.singular?.first,
                        `${mood}.${voice}.${tense}.singular.first`,
                        tenseIndex
                      )}
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      {renderConjugationCell(
                        tenseData?.singular?.second,
                        `${mood}.${voice}.${tense}.singular.second`,
                        tenseIndex
                      )}
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      {renderConjugationCell(
                        tenseData?.singular?.third,
                        `${mood}.${voice}.${tense}.singular.third`,
                        tenseIndex
                      )}
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      {renderConjugationCell(
                        tenseData?.plural?.first,
                        `${mood}.${voice}.${tense}.plural.first`,
                        tenseIndex
                      )}
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      {renderConjugationCell(
                        tenseData?.plural?.second,
                        `${mood}.${voice}.${tense}.plural.second`,
                        tenseIndex
                      )}
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      {renderConjugationCell(
                        tenseData?.plural?.third,
                        `${mood}.${voice}.${tense}.plural.third`,
                        tenseIndex
                      )}
                    </RomanTableCell>
                  </RomanTableRow>
                );
              })}
            </RomanTableBody>
          </RomanTable>
        </div>
      </div>
    );
  };

  const renderSimpleSection = (title: string, data: Record<string, string[]>, keyPrefix: string, color: string) => {
    const forms = Object.keys(data);
    if (forms.length === 0) return null;

    return (
      <div className="mb-6">
        <div className={`text-sm font-semibold mb-3 pb-2 border-b ${color}`}>{title}</div>
        <div className="overflow-x-auto">
          <RomanTable>
            <RomanTableHeader>
              <RomanTableRow>
                <RomanTableHead className="w-32">Form</RomanTableHead>
                <RomanTableHead>Value</RomanTableHead>
              </RomanTableRow>
            </RomanTableHeader>
            <RomanTableBody>
              {forms.map((form, formIndex) => (
                <RomanTableRow key={form} className="hover:bg-gray-50">
                  <RomanTableCell className="font-medium bg-gray-50 capitalize">{form}</RomanTableCell>
                  <RomanTableCell>
                    {renderConjugationCell(data[form], `${keyPrefix}.${form}`, formIndex)}
                  </RomanTableCell>
                </RomanTableRow>
              ))}
            </RomanTableBody>
          </RomanTable>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4 border-t pt-4">
      <TableToggleButton isExpanded={isExpanded} onToggle={onToggle} title="Conjugation Table" color="text-green-600" />
      {isExpanded && (
        <div className="mt-4 space-y-6">
          {/* Indicative Mood */}
          {conjugationTable.indicative && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold text-roman-stone mb-4 text-lg border-b pb-2">Indicative Mood</h4>
              {renderTenseSection('indicative', 'active', conjugationTable.indicative)}
              {renderTenseSection('indicative', 'passive', conjugationTable.indicative)}
            </div>
          )}

          {/* Subjunctive Mood */}
          {conjugationTable.subjunctive && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold text-roman-stone mb-4 text-lg border-b pb-2">Subjunctive Mood</h4>
              {renderTenseSection('subjunctive', 'active', conjugationTable.subjunctive)}
              {renderTenseSection('subjunctive', 'passive', conjugationTable.subjunctive)}
            </div>
          )}

          {/* Imperative */}
          {conjugationTable.imperative &&
            renderSimpleSection(
              'Imperative',
              conjugationTable.imperative,
              'imperative',
              'text-orange-700 border-orange-200'
            )}

          {/* Non-finite Forms */}
          {conjugationTable.nonFinite && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold text-roman-stone mb-4 text-lg border-b pb-2">Non-finite Forms</h4>

              {conjugationTable.nonFinite.infinitive &&
                renderSimpleSection(
                  'Infinitives',
                  conjugationTable.nonFinite.infinitive,
                  'nonFinite.infinitive',
                  'text-purple-700 border-purple-200'
                )}

              {conjugationTable.nonFinite.participle &&
                renderSimpleSection(
                  'Participles',
                  conjugationTable.nonFinite.participle,
                  'nonFinite.participle',
                  'text-indigo-700 border-indigo-200'
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
