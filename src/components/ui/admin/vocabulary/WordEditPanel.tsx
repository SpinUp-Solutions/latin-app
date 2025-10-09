import React, { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { VocabularyWord, VocabularyWordWithId, Noun, Verb, Adjective, Pronoun } from '@/src/types/vocabulary-new';
import { EditingCell } from '@/src/types/admin-vocabulary';
import {
  parseEditingCellValue,
  hasConjugationTable,
  hasDeclensionTable,
  hasAdjectiveDeclensionTable,
  TABLE_TYPES,
  updateTableCell,
} from '@/src/utils/vocabUtils';
import { DeclensionTable } from './tables/DeclensionTable';
import { AdjectiveDeclensionTable } from './tables/AdjectiveDeclensionTable';
import { ConjugationTable } from './tables/ConjugationTable';
import { BookOpen } from 'lucide-react';

interface WordEditPanelProps {
  word: VocabularyWordWithId | null;
  onSave: (updates: Partial<VocabularyWord>) => Promise<boolean>;
  updating: boolean;
}

const EmptyState: React.FC = () => (
  <div className="flex items-center justify-center h-full p-8">
    <div className="text-center space-y-4 max-w-md">
      <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
        <BookOpen className="h-8 w-8 text-gray-400" />
      </div>
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Word Selected</h3>
        <p className="text-sm text-gray-500">Select a word from the list on the left to view and edit its details.</p>
      </div>
    </div>
  </div>
);

export const WordEditPanel: React.FC<WordEditPanelProps> = ({ word, onSave, updating }) => {
  const [editFormData, setEditFormData] = useState<Partial<VocabularyWordWithId>>({});
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingCellValue, setEditingCellValue] = useState('');
  const [expandedEditTables, setExpandedEditTables] = useState<Set<string>>(
    new Set([TABLE_TYPES.DECLENSION, TABLE_TYPES.ADJECTIVE_DECLENSION, TABLE_TYPES.CONJUGATION])
  );

  useEffect(() => {
    if (word) {
      setEditFormData({ ...word });
    }
  }, [word]);

  const handleSave = async () => {
    if (!word) return;

    await onSave(editFormData);
  };

  const handleCellDoubleClick = (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => {
    setEditingCell({ rowIndex, cellKey, tableType });
    setEditingCellValue(Array.isArray(currentValue) ? currentValue.join(', ') : currentValue);
  };

  const handleCellEditSave = () => {
    if (!editingCell || !editFormData) return;

    const { rowIndex, cellKey, tableType } = editingCell;
    const newValue = parseEditingCellValue(editingCellValue);

    const updated = updateTableCell(editFormData, tableType, rowIndex, cellKey, newValue);
    if (updated) {
      setEditFormData(updated as Partial<VocabularyWordWithId>);
    }

    setEditingCell(null);
    setEditingCellValue('');
  };

  const handleCellEditCancel = () => {
    setEditingCell(null);
    setEditingCellValue('');
  };

  const toggleEditTableExpansion = (tableType: string) => {
    setExpandedEditTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tableType)) {
        newSet.delete(tableType);
      } else {
        newSet.add(tableType);
      }
      return newSet;
    });
  };

  const isEditTableExpanded = (tableType: string) => {
    return expandedEditTables.has(tableType);
  };

  if (!word) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white border-l border-gray-200">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-serif font-semibold text-roman-red truncate">{word.word}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{word.part_of_speech}</p>
        </div>
        <Button onClick={handleSave} disabled={updating} className="ml-4">
          {updating ? 'Saving...' : 'Apply'}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="word">Word</Label>
              <Input
                id="word"
                value={editFormData.word || ''}
                onChange={e => setEditFormData({ ...editFormData, word: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="part_of_speech">Word Type</Label>
              <div className="mt-2">
                <span className="text-sm text-gray-600">{editFormData.part_of_speech}</span>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="translation">Translation</Label>
            <Textarea
              id="translation"
              value={editFormData.translation || ''}
              onChange={e => setEditFormData({ ...editFormData, translation: e.target.value })}
              rows={2}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="etymology">Etymology</Label>
            <Textarea
              id="etymology"
              value={editFormData.etymology || ''}
              onChange={e => setEditFormData({ ...editFormData, etymology: e.target.value })}
              rows={2}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="pronunciation">Pronunciation</Label>
            <Input
              id="pronunciation"
              value={editFormData.pronunciation || ''}
              onChange={e => setEditFormData({ ...editFormData, pronunciation: e.target.value })}
              className="mt-1"
            />
          </div>

          {editFormData.part_of_speech &&
            hasDeclensionTable(editFormData as VocabularyWord) &&
            'declension_table' in editFormData &&
            editFormData.declension_table && (
              <DeclensionTable
                word={editFormData as (Noun | Pronoun) & { id: string }}
                isExpanded={isEditTableExpanded(TABLE_TYPES.DECLENSION)}
                onToggle={() => toggleEditTableExpansion(TABLE_TYPES.DECLENSION)}
                isEditMode={true}
                editingCell={editingCell}
                editingCellValue={editingCellValue}
                onCellDoubleClick={handleCellDoubleClick}
                onCellEditSave={handleCellEditSave}
                onCellEditCancel={handleCellEditCancel}
                onEditingCellValueChange={setEditingCellValue}
              />
            )}

          {editFormData.part_of_speech &&
            hasAdjectiveDeclensionTable(editFormData as VocabularyWord) &&
            'adjective_declension_table' in editFormData &&
            editFormData.adjective_declension_table && (
              <AdjectiveDeclensionTable
                word={editFormData as Adjective & { id: string }}
                isExpanded={isEditTableExpanded(TABLE_TYPES.ADJECTIVE_DECLENSION)}
                onToggle={() => toggleEditTableExpansion(TABLE_TYPES.ADJECTIVE_DECLENSION)}
                isEditMode={true}
                editingCell={editingCell}
                editingCellValue={editingCellValue}
                onCellDoubleClick={handleCellDoubleClick}
                onCellEditSave={handleCellEditSave}
                onCellEditCancel={handleCellEditCancel}
                onEditingCellValueChange={setEditingCellValue}
              />
            )}

          {editFormData.part_of_speech &&
            hasConjugationTable(editFormData as VocabularyWord) &&
            'conjugation_table' in editFormData &&
            editFormData.conjugation_table && (
              <ConjugationTable
                word={editFormData as Verb & { id: string }}
                isExpanded={isEditTableExpanded(TABLE_TYPES.CONJUGATION)}
                onToggle={() => toggleEditTableExpansion(TABLE_TYPES.CONJUGATION)}
                isEditMode={true}
                editingCell={editingCell}
                editingCellValue={editingCellValue}
                onCellDoubleClick={handleCellDoubleClick}
                onCellEditSave={handleCellEditSave}
                onCellEditCancel={handleCellEditCancel}
                onEditingCellValueChange={setEditingCellValue}
              />
            )}
        </div>
      </div>
    </div>
  );
};
