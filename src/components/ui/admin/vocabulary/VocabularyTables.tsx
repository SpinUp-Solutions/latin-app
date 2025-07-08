import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableHead,
  RomanTableRow,
  RomanTableCell,
} from '@/src/components/ui/core/roman-table';
import { Word, EditingCell, type ConjugationTable as ConjugationTableType } from '@/src/types/admin-vocabulary';
import { formatCellValue } from '@/src/utils/vocabUtils';

interface EditableCellProps {
  value: string[];
  rowIndex: number;
  cellKey: string;
  tableType: string;
  editingCell: EditingCell | null;
  editingCellValue: string;
  onCellDoubleClick: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave: () => void;
  onCellEditCancel: () => void;
  onEditingCellValueChange: (value: string) => void;
}

const EditableCell: React.FC<EditableCellProps> = ({
  value,
  rowIndex,
  cellKey,
  tableType,
  editingCell,
  editingCellValue,
  onCellDoubleClick,
  onCellEditSave,
  onCellEditCancel,
  onEditingCellValueChange,
}) => {
  const isEditing =
    editingCell?.rowIndex === rowIndex && editingCell?.cellKey === cellKey && editingCell?.tableType === tableType;

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={editingCellValue}
          onChange={e => onEditingCellValueChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              onCellEditSave();
            } else if (e.key === 'Escape') {
              onCellEditCancel();
            }
          }}
          className="text-sm"
          autoFocus
        />
        <Button size="sm" variant="outline" onClick={onCellEditSave}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCellEditCancel}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <span
      className="cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors"
      onDoubleClick={() => onCellDoubleClick(rowIndex, cellKey, tableType, formatCellValue(value))}
      title="Double-click to edit">
      {formatCellValue(value) || '-'}
    </span>
  );
};

interface DeclensionTableProps {
  word: Word;
  isExpanded: boolean;
  onToggle: () => void;
  isEditMode?: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  onCellDoubleClick?: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave?: () => void;
  onCellEditCancel?: () => void;
  onEditingCellValueChange?: (value: string) => void;
}

export const DeclensionTable: React.FC<DeclensionTableProps> = ({
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
  const declensionTable = isEditMode ? word.declensionTable : word.declensionTable;

  if (!declensionTable || declensionTable.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800">
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Declension Table
      </button>
      {isExpanded && (
        <div className="mt-2">
          <RomanTable>
            <RomanTableHeader>
              <RomanTableRow>
                <RomanTableHead>Case</RomanTableHead>
                <RomanTableHead>Singular</RomanTableHead>
                <RomanTableHead>Plural</RomanTableHead>
              </RomanTableRow>
            </RomanTableHeader>
            <RomanTableBody>
              {declensionTable.map((row, index) => (
                <RomanTableRow key={index}>
                  <RomanTableCell className="font-medium">{row.case}</RomanTableCell>
                  <RomanTableCell>
                    {isEditMode &&
                    onCellDoubleClick &&
                    onCellEditSave &&
                    onCellEditCancel &&
                    onEditingCellValueChange ? (
                      <EditableCell
                        value={row.singular}
                        rowIndex={index}
                        cellKey="singular"
                        tableType="declension"
                        editingCell={editingCell || null}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    ) : (
                      formatCellValue(row.singular) || '-'
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {isEditMode &&
                    onCellDoubleClick &&
                    onCellEditSave &&
                    onCellEditCancel &&
                    onEditingCellValueChange ? (
                      <EditableCell
                        value={row.plural}
                        rowIndex={index}
                        cellKey="plural"
                        tableType="declension"
                        editingCell={editingCell || null}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    ) : (
                      formatCellValue(row.plural) || '-'
                    )}
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

interface AdjectiveDeclensionTableProps {
  word: Word;
  isExpanded: boolean;
  onToggle: () => void;
  isEditMode?: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  onCellDoubleClick?: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave?: () => void;
  onCellEditCancel?: () => void;
  onEditingCellValueChange?: (value: string) => void;
}

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
  const adjectiveDeclensionTable = word.adjectiveDeclensionTable;

  if (!adjectiveDeclensionTable || adjectiveDeclensionTable.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-800">
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Adjective Declension Table
      </button>
      {isExpanded && (
        <div className="mt-2">
          <RomanTable>
            <RomanTableHeader>
              <RomanTableRow>
                <RomanTableHead>Case</RomanTableHead>
                <RomanTableHead>Masc. Sing.</RomanTableHead>
                <RomanTableHead>Fem. Sing.</RomanTableHead>
                <RomanTableHead>Neut. Sing.</RomanTableHead>
                <RomanTableHead>Masc. Plur.</RomanTableHead>
                <RomanTableHead>Fem. Plur.</RomanTableHead>
                <RomanTableHead>Neut. Plur.</RomanTableHead>
              </RomanTableRow>
            </RomanTableHeader>
            <RomanTableBody>
              {adjectiveDeclensionTable.map((row, index) => (
                <RomanTableRow key={index}>
                  <RomanTableCell className="font-medium">{row.case}</RomanTableCell>
                  <RomanTableCell>
                    {isEditMode &&
                    onCellDoubleClick &&
                    onCellEditSave &&
                    onCellEditCancel &&
                    onEditingCellValueChange ? (
                      <EditableCell
                        value={row.masculine.singular}
                        rowIndex={index}
                        cellKey="masculine.singular"
                        tableType="adjective-declension"
                        editingCell={editingCell || null}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    ) : (
                      formatCellValue(row.masculine.singular) || '-'
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {isEditMode &&
                    onCellDoubleClick &&
                    onCellEditSave &&
                    onCellEditCancel &&
                    onEditingCellValueChange ? (
                      <EditableCell
                        value={row.feminine.singular}
                        rowIndex={index}
                        cellKey="feminine.singular"
                        tableType="adjective-declension"
                        editingCell={editingCell || null}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    ) : (
                      formatCellValue(row.feminine.singular) || '-'
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {isEditMode &&
                    onCellDoubleClick &&
                    onCellEditSave &&
                    onCellEditCancel &&
                    onEditingCellValueChange ? (
                      <EditableCell
                        value={row.neuter.singular}
                        rowIndex={index}
                        cellKey="neuter.singular"
                        tableType="adjective-declension"
                        editingCell={editingCell || null}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    ) : (
                      formatCellValue(row.neuter.singular) || '-'
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {isEditMode &&
                    onCellDoubleClick &&
                    onCellEditSave &&
                    onCellEditCancel &&
                    onEditingCellValueChange ? (
                      <EditableCell
                        value={row.masculine.plural}
                        rowIndex={index}
                        cellKey="masculine.plural"
                        tableType="adjective-declension"
                        editingCell={editingCell || null}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    ) : (
                      formatCellValue(row.masculine.plural) || '-'
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {isEditMode &&
                    onCellDoubleClick &&
                    onCellEditSave &&
                    onCellEditCancel &&
                    onEditingCellValueChange ? (
                      <EditableCell
                        value={row.feminine.plural}
                        rowIndex={index}
                        cellKey="feminine.plural"
                        tableType="adjective-declension"
                        editingCell={editingCell || null}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    ) : (
                      formatCellValue(row.feminine.plural) || '-'
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {isEditMode &&
                    onCellDoubleClick &&
                    onCellEditSave &&
                    onCellEditCancel &&
                    onEditingCellValueChange ? (
                      <EditableCell
                        value={row.neuter.plural}
                        rowIndex={index}
                        cellKey="neuter.plural"
                        tableType="adjective-declension"
                        editingCell={editingCell || null}
                        editingCellValue={editingCellValue}
                        onCellDoubleClick={onCellDoubleClick}
                        onCellEditSave={onCellEditSave}
                        onCellEditCancel={onCellEditCancel}
                        onEditingCellValueChange={onEditingCellValueChange}
                      />
                    ) : (
                      formatCellValue(row.neuter.plural) || '-'
                    )}
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

interface ConjugationTableProps {
  word: Word;
  isExpanded: boolean;
  onToggle: () => void;
  isEditMode?: boolean;
  editingCell?: EditingCell | null;
  editingCellValue?: string;
  onCellDoubleClick?: (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => void;
  onCellEditSave?: () => void;
  onCellEditCancel?: () => void;
  onEditingCellValueChange?: (value: string) => void;
}

export const ConjugationTable: React.FC<ConjugationTableProps> = ({
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

    return formatCellValue(cellValue) || '-';
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

    return (
      <div className="mb-4">
        <h5 className={`text-sm font-medium mb-2 ${voice === 'active' ? 'text-green-700' : 'text-blue-700'}`}>
          {voice.charAt(0).toUpperCase() + voice.slice(1)}
        </h5>
        <RomanTable>
          <RomanTableHeader>
            <RomanTableRow>
              <RomanTableHead>Tense</RomanTableHead>
              <RomanTableHead>1st Sing.</RomanTableHead>
              <RomanTableHead>2nd Sing.</RomanTableHead>
              <RomanTableHead>3rd Sing.</RomanTableHead>
              <RomanTableHead>1st Plur.</RomanTableHead>
              <RomanTableHead>2nd Plur.</RomanTableHead>
              <RomanTableHead>3rd Plur.</RomanTableHead>
            </RomanTableRow>
          </RomanTableHeader>
          <RomanTableBody>
            {tenses.map((tense, tenseIndex) => {
              const tenseData = voiceData[tense];
              return (
                <RomanTableRow key={tense}>
                  <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                  <RomanTableCell>
                    {renderConjugationCell(
                      tenseData?.singular?.first,
                      `${mood}.${voice}.${tense}.singular.first`,
                      tenseIndex
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {renderConjugationCell(
                      tenseData?.singular?.second,
                      `${mood}.${voice}.${tense}.singular.second`,
                      tenseIndex
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {renderConjugationCell(
                      tenseData?.singular?.third,
                      `${mood}.${voice}.${tense}.singular.third`,
                      tenseIndex
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {renderConjugationCell(
                      tenseData?.plural?.first,
                      `${mood}.${voice}.${tense}.plural.first`,
                      tenseIndex
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
                    {renderConjugationCell(
                      tenseData?.plural?.second,
                      `${mood}.${voice}.${tense}.plural.second`,
                      tenseIndex
                    )}
                  </RomanTableCell>
                  <RomanTableCell>
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
    );
  };

  const renderImperativeSection = () => {
    if (!conjugationTable.imperative) return null;

    const imperativeData = conjugationTable.imperative;
    const forms = Object.keys(imperativeData);

    if (forms.length === 0) return null;

    return (
      <div className="mb-4">
        <h4 className="font-medium text-roman-stone mb-2">Imperative</h4>
        <RomanTable>
          <RomanTableHeader>
            <RomanTableRow>
              <RomanTableHead>Form</RomanTableHead>
              <RomanTableHead>Value</RomanTableHead>
            </RomanTableRow>
          </RomanTableHeader>
          <RomanTableBody>
            {forms.map((form, formIndex) => (
              <RomanTableRow key={form}>
                <RomanTableCell className="font-medium capitalize">{form}</RomanTableCell>
                <RomanTableCell>
                  {renderConjugationCell(imperativeData[form], `imperative.${form}`, formIndex)}
                </RomanTableCell>
              </RomanTableRow>
            ))}
          </RomanTableBody>
        </RomanTable>
      </div>
    );
  };

  const renderNonFiniteSection = () => {
    if (!conjugationTable.nonFinite) return null;

    const nonFiniteData = conjugationTable.nonFinite;

    return (
      <div className="mb-4">
        <h4 className="font-medium text-roman-stone mb-2">Non-finite Forms</h4>

        {/* Infinitives */}
        {nonFiniteData.infinitive && (
          <div className="mb-3">
            <h5 className="text-sm font-medium text-purple-700 mb-2">Infinitives</h5>
            <RomanTable>
              <RomanTableHeader>
                <RomanTableRow>
                  <RomanTableHead>Form</RomanTableHead>
                  <RomanTableHead>Value</RomanTableHead>
                </RomanTableRow>
              </RomanTableHeader>
              <RomanTableBody>
                {Object.entries(nonFiniteData.infinitive).map(([form, value], formIndex) => (
                  <RomanTableRow key={form}>
                    <RomanTableCell className="font-medium capitalize">{form}</RomanTableCell>
                    <RomanTableCell>
                      {renderConjugationCell(value as string[], `nonFinite.infinitive.${form}`, formIndex)}
                    </RomanTableCell>
                  </RomanTableRow>
                ))}
              </RomanTableBody>
            </RomanTable>
          </div>
        )}

        {/* Participles */}
        {nonFiniteData.participle && (
          <div>
            <h5 className="text-sm font-medium text-purple-700 mb-2">Participles</h5>
            <RomanTable>
              <RomanTableHeader>
                <RomanTableRow>
                  <RomanTableHead>Form</RomanTableHead>
                  <RomanTableHead>Value</RomanTableHead>
                </RomanTableRow>
              </RomanTableHeader>
              <RomanTableBody>
                {Object.entries(nonFiniteData.participle).map(([form, value], formIndex) => (
                  <RomanTableRow key={form}>
                    <RomanTableCell className="font-medium capitalize">{form}</RomanTableCell>
                    <RomanTableCell>
                      {renderConjugationCell(value as string[], `nonFinite.participle.${form}`, formIndex)}
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

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-800">
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Conjugation Table
      </button>
      {isExpanded && (
        <div className="mt-2 space-y-4">
          {/* Indicative Mood */}
          {conjugationTable.indicative && (
            <div>
              <h4 className="font-medium text-roman-stone mb-2">Indicative</h4>
              {renderTenseSection('indicative', 'active', conjugationTable.indicative)}
              {renderTenseSection('indicative', 'passive', conjugationTable.indicative)}
            </div>
          )}

          {/* Subjunctive Mood */}
          {conjugationTable.subjunctive && (
            <div>
              <h4 className="font-medium text-roman-stone mb-2">Subjunctive</h4>
              {renderTenseSection('subjunctive', 'active', conjugationTable.subjunctive)}
              {renderTenseSection('subjunctive', 'passive', conjugationTable.subjunctive)}
            </div>
          )}

          {/* Imperative */}
          {renderImperativeSection()}

          {/* Non-finite Forms */}
          {renderNonFiniteSection()}
        </div>
      )}
    </div>
  );
};
