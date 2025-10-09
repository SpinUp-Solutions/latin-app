import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
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
import { SimpleRichEditor } from '../../core/simple-rich-editor';

interface VocabularyEditModalProps {
  word: VocabularyWordWithId | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<VocabularyWord>) => Promise<boolean>;
  updating: boolean;
}

export const VocabularyEditModal: React.FC<VocabularyEditModalProps> = ({
  word,
  isOpen,
  onClose,
  onSave,
  updating,
}) => {
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

  const handleClose = () => {
    setEditFormData({});
    setEditingCell(null);
    setEditingCellValue('');
    onClose();
  };

  const handleSave = async () => {
    if (!word) return;

    const success = await onSave(editFormData);
    if (success) {
      handleClose();
    }
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

  if (!word) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle>Edit Word: {word.word}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="word">Word</Label>
              <SimpleRichEditor
                content={editFormData.word || ''}
                onChange={value => setEditFormData({ ...editFormData, word: value })}
                singleLine={true}
              />
            </div>
            <div>
              <Label htmlFor="part_of_speech">Word Type</Label>
              <span className="text-sm text-gray-600">{editFormData.part_of_speech}</span>
            </div>
          </div>

          <div>
            <Label htmlFor="translation">Translation</Label>
            <SimpleRichEditor
              content={editFormData.translation || ''}
              onChange={value => setEditFormData({ ...editFormData, translation: value })}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="etymology">Etymology</Label>
            <SimpleRichEditor
              content={editFormData.etymology || ''}
              onChange={value => setEditFormData({ ...editFormData, etymology: value })}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="pronunciation">Pronunciation</Label>
            <SimpleRichEditor
              content={editFormData.pronunciation || ''}
              onChange={value => setEditFormData({ ...editFormData, pronunciation: value })}
              singleLine={true}
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

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updating}>
              {updating ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
