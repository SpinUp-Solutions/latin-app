import React, { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import {
  VocabularyWord,
  VocabularyWordWithId,
  Noun,
  Verb,
  Adjective,
  Pronoun,
  DeclensionTableRow,
  AdjectiveDeclensionTableRow,
  ConjugationTable,
} from '@/src/types/vocabulary-new';
import { EditingCell } from '@/src/types/admin-vocabulary';
import {
  parseEditingCellValue,
  hasConjugationTable,
  hasDeclensionTable,
  hasAdjectiveDeclensionTable,
  TABLE_TYPES,
  updateTableCell,
  initializeDeclensionTable,
  initializeAdjectiveDeclensionTable,
  initializeConjugationTable,
} from '@/src/utils/vocabUtils';
import { DeclensionTable } from './tables/DeclensionTable';
import { AdjectiveDeclensionTable } from './tables/AdjectiveDeclensionTable';
import { ConjugationTable as ConjugationTableComponent } from './tables/ConjugationTable';
import { ArrayInputManager } from './ArrayInputManager';
import { BookOpen, Plus, Trash2 } from 'lucide-react';

interface WordEditPanelProps {
  word: VocabularyWordWithId | null;
  onSave: (updates: Partial<VocabularyWord> | Omit<VocabularyWord, 'createdAt' | 'updatedAt'>) => Promise<boolean>;
  onDelete?: () => void;
  updating: boolean;
  createMode?: boolean;
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

type EditFormData = Partial<
  Omit<VocabularyWord, 'createdAt' | 'updatedAt'> & {
    declension?: Noun['declension'] | Adjective['declension'];
    conjugation?: Verb['conjugation'];
    pronoun_type?: Pronoun['pronoun_type'];
    gender?: Noun['gender'];
    is_deponent?: boolean;
    declension_table?: DeclensionTableRow[];
    conjugation_table?: ConjugationTable;
    adjective_declension_table?: AdjectiveDeclensionTableRow[];
  }
> & { id?: string };

const createArrayManager = <T,>(state: T[], setState: (items: T[]) => void) => ({
  add: () => setState([...state, '' as T]),
  update: (index: number, value: T) => {
    const newArr = [...state];
    newArr[index] = value;
    setState(newArr);
  },
  remove: (index: number) => setState(state.filter((_, i) => i !== index)),
});

export const WordEditPanel: React.FC<WordEditPanelProps> = ({
  word,
  onSave,
  onDelete,
  updating,
  createMode = false,
}) => {
  const [editFormData, setEditFormData] = useState<EditFormData>({});
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingCellValue, setEditingCellValue] = useState('');
  const [expandedEditTables, setExpandedEditTables] = useState<Set<string>>(
    new Set([TABLE_TYPES.DECLENSION, TABLE_TYPES.ADJECTIVE_DECLENSION, TABLE_TYPES.CONJUGATION])
  );

  const definitionsManager = createArrayManager(editFormData.definitions || [], items =>
    setEditFormData({ ...editFormData, definitions: items })
  );

  const principalPartsManager = createArrayManager(editFormData.principal_parts || [], items =>
    setEditFormData({ ...editFormData, principal_parts: items })
  );

  useEffect(() => {
    if (word) {
      const formData: EditFormData = { ...word };

      if (word.part_of_speech === 'noun' || word.part_of_speech === 'pronoun') {
        if (!formData.declension_table) {
          formData.declension_table = initializeDeclensionTable();
        }
      }
      if (word.part_of_speech === 'adjective') {
        if (!formData.adjective_declension_table) {
          formData.adjective_declension_table = initializeAdjectiveDeclensionTable();
        }
      }
      if (word.part_of_speech === 'verb') {
        if (!formData.conjugation_table) {
          formData.conjugation_table = initializeConjugationTable();
        }
      }

      setEditFormData(formData);
    } else if (createMode) {
      setEditFormData({
        type: 'core',
        part_of_speech: 'noun',
        declension: '1',
        declension_table: initializeDeclensionTable(),
        definitions: [],
        principal_parts: [],
      });
    }
  }, [word, createMode]);

  const handleSave = async () => {
    if (!createMode && !word) return;

    const filteredDefinitions = (editFormData.definitions || []).map(d => d.trim()).filter(d => d);
    const filteredPrincipalParts = (editFormData.principal_parts || []).map(p => p.trim()).filter(p => p);

    const payload = {
      ...editFormData,
      definitions: filteredDefinitions,
      ...(filteredPrincipalParts.length > 0 && { principal_parts: filteredPrincipalParts }),
    };

    await onSave(
      payload as typeof createMode extends true
        ? Omit<VocabularyWord, 'createdAt' | 'updatedAt'>
        : Partial<VocabularyWord>
    );
  };

  const handlePartOfSpeechChange = (value: VocabularyWord['part_of_speech']) => {
    const baseData: EditFormData = {
      ...editFormData,
      part_of_speech: value,
    };

    if (value === 'noun') {
      setEditFormData({
        ...baseData,
        declension: '1',
        declension_table: initializeDeclensionTable(),
      } as EditFormData);
    } else if (value === 'verb') {
      setEditFormData({
        ...baseData,
        conjugation: '1',
        conjugation_table: initializeConjugationTable(),
      } as EditFormData);
    } else if (value === 'pronoun') {
      setEditFormData({
        ...baseData,
        pronoun_type: 'personal',
        declension_table: initializeDeclensionTable(),
      } as EditFormData);
    } else if (value === 'adjective') {
      setEditFormData({
        ...baseData,
        declension: '1-2',
        adjective_declension_table: initializeAdjectiveDeclensionTable(),
      } as EditFormData);
    } else {
      setEditFormData(baseData);
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

    const updated = updateTableCell(
      editFormData as Partial<VocabularyWord & { id: string }>,
      tableType,
      rowIndex,
      cellKey,
      newValue
    );
    if (updated) {
      setEditFormData(updated as EditFormData);
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

  const tableEditProps = {
    isEditMode: true,
    editingCell,
    editingCellValue,
    onCellDoubleClick: handleCellDoubleClick,
    onCellEditSave: handleCellEditSave,
    onCellEditCancel: handleCellEditCancel,
    onEditingCellValueChange: setEditingCellValue,
  };

  if (!word && !createMode) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white border-l border-gray-200">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="min-w-0 flex-1">
          {createMode ? (
            <>
              <h2 className="text-xl font-serif font-semibold text-roman-red flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create New Word
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Fill in the details below</p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-serif font-semibold text-roman-red truncate">{word?.word}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{word?.part_of_speech}</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          {!createMode && onDelete && (
            <Button
              onClick={onDelete}
              disabled={updating}
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={updating}>
            {updating ? (createMode ? 'Creating...' : 'Saving...') : createMode ? 'Create Word' : 'Apply'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
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
              <Label htmlFor="part_of_speech">Word Type {createMode && <span className="text-red-500">*</span>}</Label>
              {createMode ? (
                <Select value={editFormData.part_of_speech} onValueChange={handlePartOfSpeechChange}>
                  <SelectTrigger className="mt-1 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="noun">Noun</SelectItem>
                    <SelectItem value="verb">Verb</SelectItem>
                    <SelectItem value="pronoun">Pronoun</SelectItem>
                    <SelectItem value="adjective">Adjective</SelectItem>
                    <SelectItem value="adverb">Adverb</SelectItem>
                    <SelectItem value="preposition">Preposition</SelectItem>
                    <SelectItem value="conjunction">Conjunction</SelectItem>
                    <SelectItem value="interjection">Interjection</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-2">
                  <span className="text-sm text-gray-600">{editFormData.part_of_speech}</span>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <Input
                id="type"
                value={editFormData.type || ''}
                onChange={e => setEditFormData({ ...editFormData, type: e.target.value })}
                className="mt-1"
                placeholder="e.g., core, supplementary"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="translation">Translation {createMode && <span className="text-red-500">*</span>}</Label>
            <Textarea
              id="translation"
              value={editFormData.translation || ''}
              onChange={e => setEditFormData({ ...editFormData, translation: e.target.value })}
              rows={2}
              className="mt-1"
            />
          </div>

          <ArrayInputManager
            label="Definitions"
            items={editFormData.definitions || []}
            onAdd={definitionsManager.add}
            onUpdate={definitionsManager.update}
            onRemove={definitionsManager.remove}
            inputType="textarea"
            required={createMode}
            emptyMessage='No definitions added yet. Click "Add Definition" to start.'
            placeholder={index => `Definition ${index + 1}...`}
          />

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

          <ArrayInputManager
            label="Principal Parts"
            items={editFormData.principal_parts || []}
            onAdd={principalPartsManager.add}
            onUpdate={principalPartsManager.update}
            onRemove={principalPartsManager.remove}
            inputType="input"
            emptyMessage="No principal parts added yet."
            placeholder={index => `Part ${index + 1}...`}
          />

          {editFormData.part_of_speech === 'noun' && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Noun-Specific Fields</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="declension">Declension {createMode && <span className="text-red-500">*</span>}</Label>
                  <Select
                    value={editFormData.declension}
                    onValueChange={value =>
                      setEditFormData({ ...editFormData, declension: value as Noun['declension'] })
                    }>
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="1">1st Declension</SelectItem>
                      <SelectItem value="2">2nd Declension</SelectItem>
                      <SelectItem value="3">3rd Declension</SelectItem>
                      <SelectItem value="3-istem">3rd Declension (i-stem)</SelectItem>
                      <SelectItem value="4">4th Declension</SelectItem>
                      <SelectItem value="5">5th Declension</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={editFormData.gender}
                    onValueChange={value => setEditFormData({ ...editFormData, gender: value as Noun['gender'] })}>
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="masculine">Masculine</SelectItem>
                      <SelectItem value="feminine">Feminine</SelectItem>
                      <SelectItem value="neuter">Neuter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {editFormData.part_of_speech === 'verb' && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Verb-Specific Fields</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="conjugation">
                    Conjugation {createMode && <span className="text-red-500">*</span>}
                  </Label>
                  <Select
                    value={editFormData.conjugation}
                    onValueChange={value =>
                      setEditFormData({ ...editFormData, conjugation: value as Verb['conjugation'] })
                    }>
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="1">1st Conjugation</SelectItem>
                      <SelectItem value="2">2nd Conjugation</SelectItem>
                      <SelectItem value="3">3rd Conjugation</SelectItem>
                      <SelectItem value="3io">3rd Conjugation (i/o)</SelectItem>
                      <SelectItem value="4">4th Conjugation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFormData.is_deponent || false}
                      onChange={e => setEditFormData({ ...editFormData, is_deponent: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Deponent Verb</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {editFormData.part_of_speech === 'pronoun' && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Pronoun-Specific Fields</h3>
              <div>
                <Label htmlFor="pronoun_type">
                  Pronoun Type {createMode && <span className="text-red-500">*</span>}
                </Label>
                <Select
                  value={editFormData.pronoun_type}
                  onValueChange={value =>
                    setEditFormData({ ...editFormData, pronoun_type: value as Pronoun['pronoun_type'] })
                  }>
                  <SelectTrigger className="mt-1 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="reflexive">Reflexive</SelectItem>
                    <SelectItem value="possessive">Possessive</SelectItem>
                    <SelectItem value="demonstrative">Demonstrative</SelectItem>
                    <SelectItem value="intensive">Intensive</SelectItem>
                    <SelectItem value="relative">Relative</SelectItem>
                    <SelectItem value="interrogative">Interrogative</SelectItem>
                    <SelectItem value="indefinite">Indefinite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {editFormData.part_of_speech === 'adjective' && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Adjective-Specific Fields</h3>
              <div>
                <Label htmlFor="adjective_declension">Declension</Label>
                <Select
                  value={editFormData.declension}
                  onValueChange={value =>
                    setEditFormData({ ...editFormData, declension: value as Adjective['declension'] })
                  }>
                  <SelectTrigger className="mt-1 bg-white">
                    <SelectValue placeholder="Select declension" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="1-2">1-2 Declension</SelectItem>
                    <SelectItem value="3">3rd Declension</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {editFormData.part_of_speech &&
            hasDeclensionTable(editFormData as VocabularyWord) &&
            editFormData.declension_table !== undefined && (
              <DeclensionTable
                word={editFormData as (Noun | Pronoun) & { id: string }}
                isExpanded={expandedEditTables.has(TABLE_TYPES.DECLENSION)}
                onToggle={() => toggleEditTableExpansion(TABLE_TYPES.DECLENSION)}
                {...tableEditProps}
              />
            )}

          {editFormData.part_of_speech &&
            hasAdjectiveDeclensionTable(editFormData as VocabularyWord) &&
            editFormData.adjective_declension_table !== undefined && (
              <AdjectiveDeclensionTable
                word={editFormData as Adjective & { id: string }}
                isExpanded={expandedEditTables.has(TABLE_TYPES.ADJECTIVE_DECLENSION)}
                onToggle={() => toggleEditTableExpansion(TABLE_TYPES.ADJECTIVE_DECLENSION)}
                {...tableEditProps}
              />
            )}

          {editFormData.part_of_speech &&
            hasConjugationTable(editFormData as VocabularyWord) &&
            editFormData.conjugation_table !== undefined && (
              <ConjugationTableComponent
                word={editFormData as Verb & { id: string }}
                isExpanded={expandedEditTables.has(TABLE_TYPES.CONJUGATION)}
                onToggle={() => toggleEditTableExpansion(TABLE_TYPES.CONJUGATION)}
                {...tableEditProps}
              />
            )}
        </div>
      </div>
    </div>
  );
};
