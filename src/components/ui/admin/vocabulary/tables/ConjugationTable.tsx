import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableHead,
  RomanTableRow,
  RomanTableCell,
} from '@/src/components/ui/core/roman-table';
import React from 'react';
import { TABLE_TYPES } from '@/src/utils/vocabUtils';
import { TableCell } from '../shared/TableCell';
import { TableToggleButton } from '../shared/TableToggleButton';
import { Verb } from '@/src/types/vocabulary/vocabulary-new';
import { TableProps } from '@/src/types/table-props';
import { VERB_STRUCTURE } from '@/src/types/vocabulary/structure';
import { IndicativeTense, SubjunctiveTense, Voice, ImperativeTense } from '@/src/types/vocabulary/verb-conjugation';
import { buildFiniteColumns, buildImperativeColumns, getByPath, makePath } from '@/src/utils/structureTable';

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
    voice: Voice,
    tenses: IndicativeTense[] | SubjunctiveTense[]
  ) => {
    const voiceColor = voice === Voice.Active ? 'text-green-700 border-green-200' : 'text-blue-700 border-blue-200';
    const columns = buildFiniteColumns(VERB_STRUCTURE.conjugationTable[mood]);
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
                {columns.map(c => (
                  <RomanTableHead key={`${c.number}-${c.person}`} className="text-center min-w-20">
                    {c.label}
                  </RomanTableHead>
                ))}
              </RomanTableRow>
            </RomanTableHeader>
            <RomanTableBody>
              {tenses.map(tense => (
                <RomanTableRow key={tense} className="hover:bg-gray-50">
                  <RomanTableCell className="font-medium bg-gray-50 capitalize">{tense}</RomanTableCell>
                  {columns.map(c => {
                    const path = [mood, voice, tense, c.number, c.person] as const;
                    const value = getByPath<string[] | undefined>(conjugationTable, path);
                    return (
                      <RomanTableCell key={`${tense}-${c.number}-${c.person}`} className="text-center">
                        <TableCell
                          value={value}
                          rowIndex={0}
                          cellKey={makePath(...path)}
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
                    );
                  })}
                </RomanTableRow>
              ))}
            </RomanTableBody>
          </RomanTable>
        </div>
      </div>
    );
  };

  const renderSimpleSection = (
    title: string,
    data: Record<string, string[] | null | undefined> | null | undefined,
    keyPrefix: string,
    color: string,
    forms: readonly string[]
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
              {forms.map(form => {
                const formValue = data?.[form] ?? undefined;
                return (
                  <RomanTableRow key={form} className="hover:bg-gray-50">
                    <RomanTableCell className="font-medium bg-gray-50 capitalize">{form}</RomanTableCell>
                    <RomanTableCell>
                      <TableCell
                        value={formValue}
                        rowIndex={0}
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

  const renderImperativeSection = () => {
    const imperativeData = conjugationTable?.imperative;
    if (!imperativeData) return null;
    return (
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-semibold text-roman-stone mb-4 text-lg border-b pb-2">Imperative</h4>
        {VERB_STRUCTURE.conjugationTable.imperative.voices.map(voice => {
          const voiceColor =
            voice === Voice.Active ? 'text-green-700 border-green-200' : 'text-blue-700 border-blue-200';
          return (
            <div key={voice} className="mb-6">
              <div className={`text-sm font-semibold mb-3 pb-2 border-b ${voiceColor}`}>
                {voice.charAt(0).toUpperCase() + voice.slice(1)} Voice
              </div>
              {[ImperativeTense.Present, ImperativeTense.Future].map(tense => {
                const columns = buildImperativeColumns(voice, tense);
                return (
                  <div key={tense} className="overflow-x-auto mb-4">
                    <RomanTable>
                      <RomanTableHeader>
                        <RomanTableRow>
                          <RomanTableHead className="w-24">Tense</RomanTableHead>
                          {columns.map(c => (
                            <RomanTableHead key={`${tense}-${c.number}-${c.person}`} className="text-center min-w-20">
                              {c.label}
                            </RomanTableHead>
                          ))}
                        </RomanTableRow>
                      </RomanTableHeader>
                      <RomanTableBody>
                        <RomanTableRow className="hover:bg-gray-50">
                          <RomanTableCell className="font-medium bg-gray-50 capitalize">{tense}</RomanTableCell>
                          {columns.map(c => {
                            const path = ['imperative', voice, tense, c.number, c.person] as const;
                            const value = getByPath<string[] | undefined>(conjugationTable, path);
                            return (
                              <RomanTableCell key={`${tense}-${c.number}-${c.person}`} className="text-center">
                                <TableCell
                                  value={value}
                                  rowIndex={0}
                                  cellKey={makePath(...path)}
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
                            );
                          })}
                        </RomanTableRow>
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const renderParticipleSection = () => {
    const participleData = conjugationTable?.nonFinite?.participle;
    if (!participleData) return null;

    return (
      <div className="mb-6">
        <div className="text-sm font-semibold mb-3 pb-2 border-b text-indigo-700 border-indigo-200">Participles</div>
        <div className="overflow-x-auto">
          <RomanTable>
            <RomanTableHeader>
              <RomanTableRow>
                <RomanTableHead className="w-32">Form</RomanTableHead>
                <RomanTableHead>Value</RomanTableHead>
              </RomanTableRow>
            </RomanTableHeader>
            <RomanTableBody>
              {VERB_STRUCTURE.conjugationTable.nonFinite.participle.map(form => {
                const formValue = participleData?.[form];
                const displayValue = formValue ? JSON.stringify(formValue) : '';

                return (
                  <RomanTableRow key={form} className="hover:bg-gray-50">
                    <RomanTableCell className="font-medium bg-gray-50 capitalize">{form}</RomanTableCell>
                    <RomanTableCell>
                      <div className="text-sm text-gray-600">{displayValue || '-'}</div>
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
            {renderTenseSection('indicative', Voice.Active, VERB_STRUCTURE.conjugationTable.indicative.tenses)}
            {renderTenseSection('indicative', Voice.Passive, VERB_STRUCTURE.conjugationTable.indicative.tenses)}
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-roman-stone mb-4 text-lg border-b pb-2">Subjunctive Mood</h4>
            {renderTenseSection('subjunctive', Voice.Active, VERB_STRUCTURE.conjugationTable.subjunctive.tenses)}
            {renderTenseSection('subjunctive', Voice.Passive, VERB_STRUCTURE.conjugationTable.subjunctive.tenses)}
          </div>

          {renderImperativeSection()}

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-roman-stone mb-4 text-lg border-b pb-2">Non-finite Forms</h4>

            {renderSimpleSection(
              'Infinitives',
              conjugationTable?.nonFinite?.infinitive,
              'nonFinite.infinitive',
              'text-purple-700 border-purple-200',
              VERB_STRUCTURE.conjugationTable.nonFinite.infinitive
            )}

            {renderSimpleSection(
              'Gerunds',
              conjugationTable?.gerund,
              'gerund',
              'text-teal-700 border-teal-200',
              VERB_STRUCTURE.conjugationTable.gerund
            )}

            {renderSimpleSection(
              'Supines',
              conjugationTable?.supine,
              'supine',
              'text-amber-700 border-amber-200',
              VERB_STRUCTURE.conjugationTable.supine
            )}

            {renderParticipleSection()}
          </div>
        </div>
      )}
    </div>
  );
};
