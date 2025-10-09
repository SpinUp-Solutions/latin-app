import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableHead,
  RomanTableRow,
  RomanTableCell,
} from '@/src/components/ui/core/roman-table';
import { type ConjugationTable as ConjugationTableType } from '@/src/types/admin-vocabulary';
import React from 'react';
import {
  TABLE_TYPES,
  INDICATIVE_TENSES,
  SUBJUNCTIVE_TENSES,
  IMPERATIVE_FORMS,
  INFINITIVE_FORMS,
  PARTICIPLE_FORMS,
} from '@/src/utils/vocabUtils';
import { TableCell } from '../shared/TableCell';
import { TableToggleButton } from '../shared/TableToggleButton';
import { Verb } from '@/src/types/vocabulary-new';
import { TableProps } from '@/src/types/table-props';

export const ConjugationTable: React.FC<TableProps<Verb>> = ({
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
  const conjugationTable = word.conjugation_table;

  const renderTenseSection = (
    mood: 'indicative' | 'subjunctive',
    voice: 'active' | 'passive',
    moodData: NonNullable<ConjugationTableType['indicative'] | ConjugationTableType['subjunctive']> | undefined,
    tenses: string[]
  ) => {
    const voiceData = moodData?.[voice];

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
                const tenseKey = voiceData
                  ? Object.keys(voiceData).find(k => k.toLowerCase() === tense.toLowerCase())
                  : undefined;
                const tenseData = tenseKey && voiceData ? voiceData[tenseKey] : undefined;
                return (
                  <RomanTableRow key={tense} className="hover:bg-gray-50">
                    <RomanTableCell className="font-medium bg-gray-50 capitalize">{tense}</RomanTableCell>
                    <RomanTableCell className="text-center">
                      <TableCell
                        value={tenseData?.singular?.first}
                        rowIndex={tenseIndex}
                        cellKey={`${mood}.${voice}.${tense}.singular.first`}
                        tableType={TABLE_TYPES.CONJUGATION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      <TableCell
                        value={tenseData?.singular?.second}
                        rowIndex={tenseIndex}
                        cellKey={`${mood}.${voice}.${tense}.singular.second`}
                        tableType={TABLE_TYPES.CONJUGATION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      <TableCell
                        value={tenseData?.singular?.third}
                        rowIndex={tenseIndex}
                        cellKey={`${mood}.${voice}.${tense}.singular.third`}
                        tableType={TABLE_TYPES.CONJUGATION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      <TableCell
                        value={tenseData?.plural?.first}
                        rowIndex={tenseIndex}
                        cellKey={`${mood}.${voice}.${tense}.plural.first`}
                        tableType={TABLE_TYPES.CONJUGATION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      <TableCell
                        value={tenseData?.plural?.second}
                        rowIndex={tenseIndex}
                        cellKey={`${mood}.${voice}.${tense}.plural.second`}
                        tableType={TABLE_TYPES.CONJUGATION}
                        isEditMode={isEditMode}
                        editingCell={editingCell}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    </RomanTableCell>
                    <RomanTableCell className="text-center">
                      <TableCell
                        value={tenseData?.plural?.third}
                        rowIndex={tenseIndex}
                        cellKey={`${mood}.${voice}.${tense}.plural.third`}
                        tableType={TABLE_TYPES.CONJUGATION}
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
      </div>
    );
  };

  const renderSimpleSection = (
    title: string,
    data: Record<string, string[]> | undefined,
    keyPrefix: string,
    color: string,
    forms: string[]
  ) => {
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
              {forms.map((form, formIndex) => {
                const formKey = data ? Object.keys(data).find(k => k.toLowerCase() === form.toLowerCase()) : undefined;
                const formValue = formKey && data ? data[formKey] : undefined;
                return (
                  <RomanTableRow key={form} className="hover:bg-gray-50">
                    <RomanTableCell className="font-medium bg-gray-50 capitalize">{form}</RomanTableCell>
                    <RomanTableCell>
                      <TableCell
                        value={formValue}
                        rowIndex={formIndex}
                        cellKey={`${keyPrefix}.${form}`}
                        tableType={TABLE_TYPES.CONJUGATION}
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
      </div>
    );
  };

  return (
    <div className="mt-4 border-t pt-4">
      <TableToggleButton isExpanded={isExpanded} onToggle={onToggle} title="Conjugation Table" color="text-green-600" />
      {isExpanded && (
        <div className="mt-4 space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-roman-stone mb-4 text-lg border-b pb-2">Indicative Mood</h4>
            {renderTenseSection('indicative', 'active', conjugationTable?.indicative, INDICATIVE_TENSES)}
            {renderTenseSection('indicative', 'passive', conjugationTable?.indicative, INDICATIVE_TENSES)}
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-roman-stone mb-4 text-lg border-b pb-2">Subjunctive Mood</h4>
            {renderTenseSection('subjunctive', 'active', conjugationTable?.subjunctive, SUBJUNCTIVE_TENSES)}
            {renderTenseSection('subjunctive', 'passive', conjugationTable?.subjunctive, SUBJUNCTIVE_TENSES)}
          </div>

          {renderSimpleSection(
            'Imperative',
            conjugationTable?.imperative,
            'imperative',
            'text-orange-700 border-orange-200',
            IMPERATIVE_FORMS
          )}

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-roman-stone mb-4 text-lg border-b pb-2">Non-finite Forms</h4>

            {renderSimpleSection(
              'Infinitives',
              conjugationTable?.nonFinite?.infinitive,
              'nonFinite.infinitive',
              'text-purple-700 border-purple-200',
              INFINITIVE_FORMS
            )}

            {renderSimpleSection(
              'Participles',
              conjugationTable?.nonFinite?.participle,
              'nonFinite.participle',
              'text-indigo-700 border-indigo-200',
              PARTICIPLE_FORMS
            )}
          </div>
        </div>
      )}
    </div>
  );
};
