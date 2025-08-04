import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Word, EditingCell } from '@/src/types/admin-vocabulary';
import { parseEditingCellValue } from '@/src/utils/vocabUtils';
import { DeclensionTable } from './tables/DeclensionTable';
import { AdjectiveDeclensionTable } from './tables/AdjectiveDeclensionTable';
import { ConjugationTable } from './tables/ConjugationTable';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

interface VocabularyEditModalProps {
  word: Word | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Word>) => Promise<boolean>;
  updating: boolean;
}

export const VocabularyEditModal: React.FC<VocabularyEditModalProps> = ({
  word,
  isOpen,
  onClose,
  onSave,
  updating,
}) => {
  const [editFormData, setEditFormData] = useState<Partial<Word>>({});
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingCellValue, setEditingCellValue] = useState('');
  const [expandedEditTables, setExpandedEditTables] = useState<Set<string>>(
    new Set(['declension', 'adjective-declension', 'conjugation'])
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

    if (tableType === 'declension') {
      if (editFormData.declensionTable) {
        const updatedTable = [...editFormData.declensionTable];
        updatedTable[rowIndex] = {
          ...updatedTable[rowIndex],
          [cellKey]: newValue,
        };
        setEditFormData({ ...editFormData, declensionTable: updatedTable });
      }
    } else if (tableType === 'adjective-declension') {
      if (editFormData.adjectiveDeclensionTable) {
        const updatedTable = [...editFormData.adjectiveDeclensionTable];
        const [gender, number] = cellKey.split('.');
        const row = updatedTable[rowIndex];

        if (gender === 'masculine' || gender === 'feminine' || gender === 'neuter') {
          updatedTable[rowIndex] = {
            ...row,
            [gender]: {
              ...row[gender],
              [number]: newValue,
            },
          };
          setEditFormData({ ...editFormData, adjectiveDeclensionTable: updatedTable });
        }
      }
    } else if (tableType === 'conjugation') {
      if (editFormData.conjugationTable) {
        const updatedTable = JSON.parse(JSON.stringify(editFormData.conjugationTable));
        const parts = cellKey.split('.');

        let current = updatedTable;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        current[parts[parts.length - 1]] = newValue;
        setEditFormData({ ...editFormData, conjugationTable: updatedTable });
      }
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
              <Label htmlFor="wordType">Word Type</Label>
              <Select
                value={editFormData.wordType || ''}
                onValueChange={value => setEditFormData({ ...editFormData, wordType: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select word type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="noun">Noun</SelectItem>
                  <SelectItem value="verb">Verb</SelectItem>
                  <SelectItem value="adjective">Adjective</SelectItem>
                  <SelectItem value="adverb">Adverb</SelectItem>
                  <SelectItem value="preposition">Preposition</SelectItem>
                  <SelectItem value="pronoun">Pronoun</SelectItem>
                  <SelectItem value="conjunction">Conjunction</SelectItem>
                  <SelectItem value="interjection">Interjection</SelectItem>
                  <SelectItem value="enclitic">Enclitic</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                </SelectContent>
              </Select>
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
            <Label htmlFor="grammaticalInfo">Grammatical Info</Label>
            <SimpleRichEditor
              content={editFormData.grammaticalInfo || ''}
              onChange={value => setEditFormData({ ...editFormData, grammaticalInfo: value })}
              singleLine={true}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="section">Section</Label>
              <SimpleRichEditor
                content={editFormData.section || ''}
                onChange={value => setEditFormData({ ...editFormData, section: value })}
                singleLine={true}
              />
            </div>
            <div>
              <Label htmlFor="subsection">Subsection</Label>
              <SimpleRichEditor
                content={editFormData.subsection || ''}
                onChange={value => setEditFormData({ ...editFormData, subsection: value })}
                singleLine={true}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={editFormData.gender || ''}
                onValueChange={value => setEditFormData({ ...editFormData, gender: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="masculine">Masculine</SelectItem>
                  <SelectItem value="feminine">Feminine</SelectItem>
                  <SelectItem value="neuter">Neuter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="declensionClass">Declension Class</Label>
              <SimpleRichEditor
                content={editFormData.declensionClass || ''}
                onChange={value => setEditFormData({ ...editFormData, declensionClass: value })}
                singleLine={true}
              />
            </div>
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

          {/* Tables */}
          {editFormData.declensionTable && (
            <DeclensionTable
              word={editFormData as Word}
              isExpanded={isEditTableExpanded('declension')}
              onToggle={() => toggleEditTableExpansion('declension')}
              isEditMode={true}
              editingCell={editingCell}
              editingCellValue={editingCellValue}
              onCellDoubleClick={handleCellDoubleClick}
              onCellEditSave={handleCellEditSave}
              onCellEditCancel={handleCellEditCancel}
              onEditingCellValueChange={setEditingCellValue}
            />
          )}

          {editFormData.adjectiveDeclensionTable && (
            <AdjectiveDeclensionTable
              word={editFormData as Word}
              isExpanded={isEditTableExpanded('adjective-declension')}
              onToggle={() => toggleEditTableExpansion('adjective-declension')}
              isEditMode={true}
              editingCell={editingCell}
              editingCellValue={editingCellValue}
              onCellDoubleClick={handleCellDoubleClick}
              onCellEditSave={handleCellEditSave}
              onCellEditCancel={handleCellEditCancel}
              onEditingCellValueChange={setEditingCellValue}
            />
          )}

          {editFormData.conjugationTable && (
            <ConjugationTable
              word={editFormData as Word}
              isExpanded={isEditTableExpanded('conjugation')}
              onToggle={() => toggleEditTableExpansion('conjugation')}
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
