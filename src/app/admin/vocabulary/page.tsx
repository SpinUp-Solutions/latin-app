'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { ArrowLeft, Search, Edit, BookOpen, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableHead,
  RomanTableRow,
  RomanTableCell,
} from '@/src/components/ui/core/roman-table';

interface Word {
  id: string;
  word: string;
  wordType: string;
  translation: string;
  section: string;
  subsection?: string;
  grammaticalInfo: string;
  definitions?: string[];
  etymology?: string;
  pronunciation?: string;
  gender?: string;
  declensionClass?: string;
  conjugationClass?: string;
  isDeponent?: boolean;
  principalParts?: string[];
  declensionTable?: Array<{
    case: string;
    singular: string[];
    plural: string[];
  }>;
  adjectiveDeclensionTable?: Array<{
    case: string;
    masculine: { singular: string[]; plural: string[] };
    feminine: { singular: string[]; plural: string[] };
    neuter: { singular: string[]; plural: string[] };
  }>;
  conjugationTable?: any; // Complex conjugation structure
  createdAt?: Date;
  updatedAt?: Date;
}

interface WordsResponse {
  success: boolean;
  data: {
    words: Word[];
    hasMore: boolean;
    lastWordId: string | null;
    wordTypeCounts?: Record<string, number>;
    filters: {
      wordType?: string;
      section?: string;
      search?: string;
    };
  };
}

export default function AdminVocabularyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useSelector((state: RootState) => state.auth);

  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastWordId, setLastWordId] = useState<string | null>(null);
  const [wordTypeCounts, setWordTypeCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);

  // Filters
  const [selectedWordType, setSelectedWordType] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Editing
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Word>>({});
  const [updating, setUpdating] = useState(false);

  // Table expansion state
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  // Editable cell state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; cellKey: string; tableType: string } | null>(null);
  const [editingCellValue, setEditingCellValue] = useState('');
  const [expandedEditTables, setExpandedEditTables] = useState<Set<string>>(
    new Set(['declension', 'adjective-declension', 'conjugation'])
  );

  const limit = 20;

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [user, authLoading, router]);

  // Load word type counts separately
  useEffect(() => {
    if (user && user.role === 'admin') {
      loadWordTypeCounts();
    }
  }, [user]);

  // Load initial words when filters change
  useEffect(() => {
    if (user && user.role === 'admin') {
      loadWords(true); // Reset to first page
    }
  }, [user, selectedWordType, selectedSection, searchTerm]);

  const loadWordTypeCounts = async () => {
    try {
      setCountsLoading(true);
      const response = await fetch('/api/admin/words?countsOnly=true');
      const data: WordsResponse = await response.json();

      if (data.success && data.data.wordTypeCounts) {
        setWordTypeCounts(data.data.wordTypeCounts);
      }
    } catch (error) {
      console.error('Error loading word type counts:', error);
    } finally {
      setCountsLoading(false);
    }
  };

  const loadWords = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setWords([]);
        setLastWordId(null);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams({
        limit: limit.toString(),
      });

      if (selectedWordType && selectedWordType !== 'all') params.append('wordType', selectedWordType);
      if (selectedSection && selectedSection !== 'all') params.append('section', selectedSection);
      if (searchTerm) params.append('search', searchTerm);
      if (!reset && lastWordId) params.append('lastWordId', lastWordId);

      const response = await fetch(`/api/admin/words?${params}`);
      const data: WordsResponse = await response.json();

      if (data.success) {
        if (reset) {
          setWords(data.data.words);
        } else {
          setWords(prev => [...prev, ...data.data.words]);
        }
        setHasMore(data.data.hasMore);
        setLastWordId(data.data.lastWordId);
      } else {
        toast.error('Failed to fetch words');
      }
    } catch (error) {
      console.error('Error fetching words:', error);
      toast.error('Error fetching words');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleEditWord = (word: Word) => {
    setEditingWord(word);
    setEditFormData({ ...word });
    setIsEditModalOpen(true);
  };

  const handleUpdateWord = async () => {
    if (!editingWord || !editFormData) return;

    try {
      setUpdating(true);

      // Clean up the data by removing undefined values and empty strings
      const cleanedUpdates = Object.fromEntries(
        Object.entries(editFormData).filter(([_, value]) => {
          if (value === undefined || value === null) return false;
          if (typeof value === 'string' && value.trim() === '') return false;
          if (Array.isArray(value) && value.length === 0) return false;
          return true;
        })
      );

      console.log('Sending update for word:', editingWord.id);
      console.log('Original edit form data:', JSON.stringify(editFormData, null, 2));
      console.log('Cleaned updates:', JSON.stringify(cleanedUpdates, null, 2));

      const response = await fetch('/api/admin/words', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wordId: editingWord.id,
          updates: cleanedUpdates,
        }),
      });

      const data = await response.json();
      console.log('API response:', data);

      if (data.success) {
        toast.success('Word updated successfully');
        setIsEditModalOpen(false);
        setEditingWord(null);
        setEditFormData({});

        // Update the word in the local state with the cleaned data
        setWords(prev => prev.map(w => (w.id === editingWord.id ? { ...w, ...cleanedUpdates } : w)));
      } else {
        toast.error(`Failed to update word: ${data.error || 'Unknown error'}`);
        console.error('API error:', data.error);
      }
    } catch (error) {
      console.error('Error updating word:', error);
      toast.error('Error updating word');
    } finally {
      setUpdating(false);
    }
  };

  const handleCellDoubleClick = (rowIndex: number, cellKey: string, tableType: string, currentValue: string) => {
    setEditingCell({ rowIndex, cellKey, tableType });
    setEditingCellValue(Array.isArray(currentValue) ? currentValue.join(', ') : currentValue);
  };

  const handleCellEditSave = () => {
    if (!editingCell || !editFormData) return;

    const { rowIndex, cellKey, tableType } = editingCell;
    const newValue = editingCellValue
      .split(',')
      .map(v => v.trim())
      .filter(v => v);

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
        const updatedTable = JSON.parse(JSON.stringify(editFormData.conjugationTable)); // Deep copy
        const parts = cellKey.split('.');

        // Build the nested structure dynamically
        let current = updatedTable;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        // Set the final value
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

  const renderEditableCell = (value: string[], rowIndex: number, cellKey: string, tableType: string) => {
    const isEditing =
      editingCell?.rowIndex === rowIndex && editingCell?.cellKey === cellKey && editingCell?.tableType === tableType;

    if (isEditing) {
      return (
        <div className="flex items-center gap-2">
          <Input
            value={editingCellValue}
            onChange={e => setEditingCellValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleCellEditSave();
              } else if (e.key === 'Escape') {
                handleCellEditCancel();
              }
            }}
            className="text-sm"
            autoFocus
          />
          <Button size="sm" variant="outline" onClick={handleCellEditSave}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={handleCellEditCancel}>
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <span
        className="cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors"
        onDoubleClick={() => handleCellDoubleClick(rowIndex, cellKey, tableType, value.join(', '))}
        title="Double-click to edit">
        {value.join(', ') || '-'}
      </span>
    );
  };

  const renderEditDeclensionTable = () => {
    if (!editFormData.declensionTable || editFormData.declensionTable.length === 0) return null;

    const isExpanded = isEditTableExpanded('declension');

    return (
      <div className="mt-4 border-t pt-4">
        <button
          onClick={() => toggleEditTableExpansion('declension')}
          className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 mb-3">
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
                {editFormData.declensionTable.map((row, index) => (
                  <RomanTableRow key={index}>
                    <RomanTableCell className="font-medium">{row.case}</RomanTableCell>
                    <RomanTableCell>{renderEditableCell(row.singular, index, 'singular', 'declension')}</RomanTableCell>
                    <RomanTableCell>{renderEditableCell(row.plural, index, 'plural', 'declension')}</RomanTableCell>
                  </RomanTableRow>
                ))}
              </RomanTableBody>
            </RomanTable>
          </div>
        )}
      </div>
    );
  };

  const renderEditAdjectiveDeclensionTable = () => {
    if (!editFormData.adjectiveDeclensionTable || editFormData.adjectiveDeclensionTable.length === 0) return null;

    const isExpanded = isEditTableExpanded('adjective-declension');

    return (
      <div className="mt-4 border-t pt-4">
        <button
          onClick={() => toggleEditTableExpansion('adjective-declension')}
          className="flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-800 mb-3">
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
                {editFormData.adjectiveDeclensionTable.map((row, index) => (
                  <RomanTableRow key={index}>
                    <RomanTableCell className="font-medium">{row.case}</RomanTableCell>
                    <RomanTableCell>
                      {renderEditableCell(row.masculine.singular, index, 'masculine.singular', 'adjective-declension')}
                    </RomanTableCell>
                    <RomanTableCell>
                      {renderEditableCell(row.feminine.singular, index, 'feminine.singular', 'adjective-declension')}
                    </RomanTableCell>
                    <RomanTableCell>
                      {renderEditableCell(row.neuter.singular, index, 'neuter.singular', 'adjective-declension')}
                    </RomanTableCell>
                    <RomanTableCell>
                      {renderEditableCell(row.masculine.plural, index, 'masculine.plural', 'adjective-declension')}
                    </RomanTableCell>
                    <RomanTableCell>
                      {renderEditableCell(row.feminine.plural, index, 'feminine.plural', 'adjective-declension')}
                    </RomanTableCell>
                    <RomanTableCell>
                      {renderEditableCell(row.neuter.plural, index, 'neuter.plural', 'adjective-declension')}
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

  const renderEditConjugationTable = () => {
    if (!editFormData.conjugationTable) return null;

    const isExpanded = isEditTableExpanded('conjugation');
    const conjugation = editFormData.conjugationTable;

    return (
      <div className="mt-4 border-t pt-4">
        <button
          onClick={() => toggleEditTableExpansion('conjugation')}
          className="flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-800 mb-3">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Conjugation Table
        </button>
        {isExpanded && (
          <div className="mt-2 space-y-4">
            {/* Indicative Mood */}
            {conjugation.indicative && (
              <div>
                <h4 className="font-medium text-roman-stone mb-2">Indicative</h4>

                {/* Active Voice */}
                {conjugation.indicative.active && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium text-green-700 mb-2">Active</h5>
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
                        {Object.entries(conjugation.indicative.active).map(([tense, forms]: [string, any]) => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.first || [],
                                0,
                                `indicative.active.${tense}.singular.first`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.second || [],
                                0,
                                `indicative.active.${tense}.singular.second`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.third || [],
                                0,
                                `indicative.active.${tense}.singular.third`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.first || [],
                                0,
                                `indicative.active.${tense}.plural.first`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.second || [],
                                0,
                                `indicative.active.${tense}.plural.second`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.third || [],
                                0,
                                `indicative.active.${tense}.plural.third`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}

                {/* Passive Voice */}
                {conjugation.indicative.passive && (
                  <div>
                    <h5 className="text-sm font-medium text-blue-700 mb-2">Passive</h5>
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
                        {Object.entries(conjugation.indicative.passive).map(([tense, forms]: [string, any]) => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.first || [],
                                0,
                                `indicative.passive.${tense}.singular.first`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.second || [],
                                0,
                                `indicative.passive.${tense}.singular.second`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.third || [],
                                0,
                                `indicative.passive.${tense}.singular.third`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.first || [],
                                0,
                                `indicative.passive.${tense}.plural.first`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.second || [],
                                0,
                                `indicative.passive.${tense}.plural.second`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.third || [],
                                0,
                                `indicative.passive.${tense}.plural.third`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}
              </div>
            )}

            {/* Subjunctive Mood */}
            {conjugation.subjunctive && (
              <div>
                <h4 className="font-medium text-roman-stone mb-2">Subjunctive</h4>

                {/* Active Voice */}
                {conjugation.subjunctive.active && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium text-green-700 mb-2">Active</h5>
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
                        {Object.entries(conjugation.subjunctive.active).map(([tense, forms]: [string, any]) => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.first || [],
                                0,
                                `subjunctive.active.${tense}.singular.first`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.second || [],
                                0,
                                `subjunctive.active.${tense}.singular.second`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.third || [],
                                0,
                                `subjunctive.active.${tense}.singular.third`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.first || [],
                                0,
                                `subjunctive.active.${tense}.plural.first`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.second || [],
                                0,
                                `subjunctive.active.${tense}.plural.second`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.third || [],
                                0,
                                `subjunctive.active.${tense}.plural.third`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}

                {/* Passive Voice */}
                {conjugation.subjunctive.passive && (
                  <div>
                    <h5 className="text-sm font-medium text-blue-700 mb-2">Passive</h5>
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
                        {Object.entries(conjugation.subjunctive.passive).map(([tense, forms]: [string, any]) => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.first || [],
                                0,
                                `subjunctive.passive.${tense}.singular.first`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.second || [],
                                0,
                                `subjunctive.passive.${tense}.singular.second`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.singular?.third || [],
                                0,
                                `subjunctive.passive.${tense}.singular.third`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.first || [],
                                0,
                                `subjunctive.passive.${tense}.plural.first`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.second || [],
                                0,
                                `subjunctive.passive.${tense}.plural.second`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                forms?.plural?.third || [],
                                0,
                                `subjunctive.passive.${tense}.plural.third`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}
              </div>
            )}

            {/* Imperative Mood */}
            {conjugation.imperative && (
              <div>
                <h4 className="font-medium text-roman-stone mb-2">Imperative</h4>
                <RomanTable>
                  <RomanTableHeader>
                    <RomanTableRow>
                      <RomanTableHead>Voice</RomanTableHead>
                      <RomanTableHead>2nd Sing.</RomanTableHead>
                      <RomanTableHead>3rd Sing.</RomanTableHead>
                      <RomanTableHead>2nd Plur.</RomanTableHead>
                      <RomanTableHead>3rd Plur.</RomanTableHead>
                    </RomanTableRow>
                  </RomanTableHeader>
                  <RomanTableBody>
                    {conjugation.imperative.active && (
                      <RomanTableRow>
                        <RomanTableCell className="font-medium">Active</RomanTableCell>
                        <RomanTableCell>
                          {renderEditableCell(
                            conjugation.imperative.active.present?.singular?.second || [],
                            0,
                            'imperative.active.present.singular.second',
                            'conjugation'
                          )}
                        </RomanTableCell>
                        <RomanTableCell>
                          {renderEditableCell(
                            conjugation.imperative.active.present?.singular?.third || [],
                            0,
                            'imperative.active.present.singular.third',
                            'conjugation'
                          )}
                        </RomanTableCell>
                        <RomanTableCell>
                          {renderEditableCell(
                            conjugation.imperative.active.present?.plural?.second || [],
                            0,
                            'imperative.active.present.plural.second',
                            'conjugation'
                          )}
                        </RomanTableCell>
                        <RomanTableCell>
                          {renderEditableCell(
                            conjugation.imperative.active.present?.plural?.third || [],
                            0,
                            'imperative.active.present.plural.third',
                            'conjugation'
                          )}
                        </RomanTableCell>
                      </RomanTableRow>
                    )}
                    {conjugation.imperative.passive && (
                      <RomanTableRow>
                        <RomanTableCell className="font-medium">Passive</RomanTableCell>
                        <RomanTableCell>
                          {renderEditableCell(
                            conjugation.imperative.passive.present?.singular?.second || [],
                            0,
                            'imperative.passive.present.singular.second',
                            'conjugation'
                          )}
                        </RomanTableCell>
                        <RomanTableCell>
                          {renderEditableCell(
                            conjugation.imperative.passive.present?.singular?.third || [],
                            0,
                            'imperative.passive.present.singular.third',
                            'conjugation'
                          )}
                        </RomanTableCell>
                        <RomanTableCell>
                          {renderEditableCell(
                            conjugation.imperative.passive.present?.plural?.second || [],
                            0,
                            'imperative.passive.present.plural.second',
                            'conjugation'
                          )}
                        </RomanTableCell>
                        <RomanTableCell>
                          {renderEditableCell(
                            conjugation.imperative.passive.present?.plural?.third || [],
                            0,
                            'imperative.passive.present.plural.third',
                            'conjugation'
                          )}
                        </RomanTableCell>
                      </RomanTableRow>
                    )}
                  </RomanTableBody>
                </RomanTable>
              </div>
            )}

            {/* Non-finite Forms */}
            {conjugation.nonFinite && (
              <div>
                <h4 className="font-medium text-roman-stone mb-2">Non-finite Forms</h4>

                {/* Infinitives */}
                {conjugation.nonFinite.infinitive && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium text-purple-700 mb-2">Infinitives</h5>
                    <RomanTable>
                      <RomanTableHeader>
                        <RomanTableRow>
                          <RomanTableHead>Tense</RomanTableHead>
                          <RomanTableHead>Active</RomanTableHead>
                          <RomanTableHead>Passive</RomanTableHead>
                        </RomanTableRow>
                      </RomanTableHeader>
                      <RomanTableBody>
                        {['present', 'perfect', 'future'].map(tense => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                conjugation.nonFinite.infinitive.active?.[tense] || [],
                                0,
                                `nonFinite.infinitive.active.${tense}`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                conjugation.nonFinite.infinitive.passive?.[tense] || [],
                                0,
                                `nonFinite.infinitive.passive.${tense}`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}

                {/* Participles */}
                {conjugation.nonFinite.participle && (
                  <div>
                    <h5 className="text-sm font-medium text-purple-700 mb-2">Participles</h5>
                    <RomanTable>
                      <RomanTableHeader>
                        <RomanTableRow>
                          <RomanTableHead>Tense</RomanTableHead>
                          <RomanTableHead>Active</RomanTableHead>
                          <RomanTableHead>Passive</RomanTableHead>
                        </RomanTableRow>
                      </RomanTableHeader>
                      <RomanTableBody>
                        {['present', 'perfect', 'future'].map(tense => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                conjugation.nonFinite.participle.active?.[tense] || [],
                                0,
                                `nonFinite.participle.active.${tense}`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                            <RomanTableCell>
                              {renderEditableCell(
                                conjugation.nonFinite.participle.passive?.[tense] || [],
                                0,
                                `nonFinite.participle.passive.${tense}`,
                                'conjugation'
                              )}
                            </RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadWords(true);
  };

  const resetFilters = () => {
    setSelectedWordType('all');
    setSelectedSection('all');
    setSearchTerm('');
  };

  const getWordTypeColor = (wordType: string) => {
    const colors = {
      noun: 'bg-blue-100 text-blue-800',
      verb: 'bg-green-100 text-green-800',
      adjective: 'bg-purple-100 text-purple-800',
      adverb: 'bg-orange-100 text-orange-800',
      preposition: 'bg-pink-100 text-pink-800',
      pronoun: 'bg-indigo-100 text-indigo-800',
      conjunction: 'bg-yellow-100 text-yellow-800',
      interjection: 'bg-red-100 text-red-800',
      enclitic: 'bg-gray-100 text-gray-800',
      number: 'bg-teal-100 text-teal-800',
    };
    return colors[wordType as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const toggleTableExpansion = (wordId: string, tableType: string) => {
    const key = `${wordId}-${tableType}`;
    setExpandedTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const isTableExpanded = (wordId: string, tableType: string) => {
    return expandedTables.has(`${wordId}-${tableType}`);
  };

  const renderDeclensionTable = (word: Word) => {
    if (!word.declensionTable || word.declensionTable.length === 0) return null;

    const isExpanded = isTableExpanded(word.id, 'declension');

    return (
      <div className="mt-3 border-t pt-3">
        <button
          onClick={() => toggleTableExpansion(word.id, 'declension')}
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
                {word.declensionTable.map((row, index) => (
                  <RomanTableRow key={index}>
                    <RomanTableCell className="font-medium">{row.case}</RomanTableCell>
                    <RomanTableCell>{row.singular.join(', ')}</RomanTableCell>
                    <RomanTableCell>{row.plural.join(', ')}</RomanTableCell>
                  </RomanTableRow>
                ))}
              </RomanTableBody>
            </RomanTable>
          </div>
        )}
      </div>
    );
  };

  const renderAdjectiveDeclensionTable = (word: Word) => {
    if (!word.adjectiveDeclensionTable || word.adjectiveDeclensionTable.length === 0) return null;

    const isExpanded = isTableExpanded(word.id, 'adjective-declension');

    return (
      <div className="mt-3 border-t pt-3">
        <button
          onClick={() => toggleTableExpansion(word.id, 'adjective-declension')}
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
                {word.adjectiveDeclensionTable.map((row, index) => (
                  <RomanTableRow key={index}>
                    <RomanTableCell className="font-medium">{row.case}</RomanTableCell>
                    <RomanTableCell>{row.masculine.singular.join(', ')}</RomanTableCell>
                    <RomanTableCell>{row.feminine.singular.join(', ')}</RomanTableCell>
                    <RomanTableCell>{row.neuter.singular.join(', ')}</RomanTableCell>
                    <RomanTableCell>{row.masculine.plural.join(', ')}</RomanTableCell>
                    <RomanTableCell>{row.feminine.plural.join(', ')}</RomanTableCell>
                    <RomanTableCell>{row.neuter.plural.join(', ')}</RomanTableCell>
                  </RomanTableRow>
                ))}
              </RomanTableBody>
            </RomanTable>
          </div>
        )}
      </div>
    );
  };

  const renderConjugationTable = (word: Word) => {
    if (!word.conjugationTable) return null;

    const isExpanded = isTableExpanded(word.id, 'conjugation');
    const conjugation = word.conjugationTable;

    return (
      <div className="mt-3 border-t pt-3">
        <button
          onClick={() => toggleTableExpansion(word.id, 'conjugation')}
          className="flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-800">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Conjugation Table
        </button>
        {isExpanded && (
          <div className="mt-2 space-y-4">
            {/* Indicative Mood */}
            {conjugation.indicative && (
              <div>
                <h4 className="font-medium text-roman-stone mb-2">Indicative</h4>

                {/* Active Voice */}
                {conjugation.indicative.active && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium text-green-700 mb-2">Active</h5>
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
                        {Object.entries(conjugation.indicative.active).map(([tense, forms]: [string, any]) => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.first?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.second?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.third?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.first?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.second?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.third?.join(', ') || '-'}</RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}

                {/* Passive Voice */}
                {conjugation.indicative.passive && (
                  <div>
                    <h5 className="text-sm font-medium text-blue-700 mb-2">Passive</h5>
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
                        {Object.entries(conjugation.indicative.passive).map(([tense, forms]: [string, any]) => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.first?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.second?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.third?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.first?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.second?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.third?.join(', ') || '-'}</RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}
              </div>
            )}

            {/* Subjunctive Mood */}
            {conjugation.subjunctive && (
              <div>
                <h4 className="font-medium text-roman-stone mb-2">Subjunctive</h4>

                {/* Active Voice */}
                {conjugation.subjunctive.active && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium text-green-700 mb-2">Active</h5>
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
                        {Object.entries(conjugation.subjunctive.active).map(([tense, forms]: [string, any]) => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.first?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.second?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.third?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.first?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.second?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.third?.join(', ') || '-'}</RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}

                {/* Passive Voice */}
                {conjugation.subjunctive.passive && (
                  <div>
                    <h5 className="text-sm font-medium text-blue-700 mb-2">Passive</h5>
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
                        {Object.entries(conjugation.subjunctive.passive).map(([tense, forms]: [string, any]) => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.first?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.second?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.singular?.third?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.first?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.second?.join(', ') || '-'}</RomanTableCell>
                            <RomanTableCell>{forms?.plural?.third?.join(', ') || '-'}</RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}
              </div>
            )}

            {/* Imperative Mood */}
            {conjugation.imperative && (
              <div>
                <h4 className="font-medium text-roman-stone mb-2">Imperative</h4>
                <RomanTable>
                  <RomanTableHeader>
                    <RomanTableRow>
                      <RomanTableHead>Voice</RomanTableHead>
                      <RomanTableHead>2nd Sing.</RomanTableHead>
                      <RomanTableHead>3rd Sing.</RomanTableHead>
                      <RomanTableHead>2nd Plur.</RomanTableHead>
                      <RomanTableHead>3rd Plur.</RomanTableHead>
                    </RomanTableRow>
                  </RomanTableHeader>
                  <RomanTableBody>
                    {conjugation.imperative.active && (
                      <RomanTableRow>
                        <RomanTableCell className="font-medium">Active</RomanTableCell>
                        <RomanTableCell>
                          {conjugation.imperative.active.present?.singular?.second?.join(', ') || '-'}
                        </RomanTableCell>
                        <RomanTableCell>
                          {conjugation.imperative.active.present?.singular?.third?.join(', ') || '-'}
                        </RomanTableCell>
                        <RomanTableCell>
                          {conjugation.imperative.active.present?.plural?.second?.join(', ') || '-'}
                        </RomanTableCell>
                        <RomanTableCell>
                          {conjugation.imperative.active.present?.plural?.third?.join(', ') || '-'}
                        </RomanTableCell>
                      </RomanTableRow>
                    )}
                    {conjugation.imperative.passive && (
                      <RomanTableRow>
                        <RomanTableCell className="font-medium">Passive</RomanTableCell>
                        <RomanTableCell>
                          {conjugation.imperative.passive.present?.singular?.second?.join(', ') || '-'}
                        </RomanTableCell>
                        <RomanTableCell>
                          {conjugation.imperative.passive.present?.singular?.third?.join(', ') || '-'}
                        </RomanTableCell>
                        <RomanTableCell>
                          {conjugation.imperative.passive.present?.plural?.second?.join(', ') || '-'}
                        </RomanTableCell>
                        <RomanTableCell>
                          {conjugation.imperative.passive.present?.plural?.third?.join(', ') || '-'}
                        </RomanTableCell>
                      </RomanTableRow>
                    )}
                  </RomanTableBody>
                </RomanTable>
              </div>
            )}

            {/* Non-finite Forms */}
            {conjugation.nonFinite && (
              <div>
                <h4 className="font-medium text-roman-stone mb-2">Non-finite Forms</h4>

                {/* Infinitives */}
                {conjugation.nonFinite.infinitive && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium text-purple-700 mb-2">Infinitives</h5>
                    <RomanTable>
                      <RomanTableHeader>
                        <RomanTableRow>
                          <RomanTableHead>Tense</RomanTableHead>
                          <RomanTableHead>Active</RomanTableHead>
                          <RomanTableHead>Passive</RomanTableHead>
                        </RomanTableRow>
                      </RomanTableHeader>
                      <RomanTableBody>
                        {['present', 'perfect', 'future'].map(tense => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>
                              {conjugation.nonFinite.infinitive.active?.[tense]?.join(', ') || '-'}
                            </RomanTableCell>
                            <RomanTableCell>
                              {conjugation.nonFinite.infinitive.passive?.[tense]?.join(', ') || '-'}
                            </RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}

                {/* Participles */}
                {conjugation.nonFinite.participle && (
                  <div>
                    <h5 className="text-sm font-medium text-purple-700 mb-2">Participles</h5>
                    <RomanTable>
                      <RomanTableHeader>
                        <RomanTableRow>
                          <RomanTableHead>Tense</RomanTableHead>
                          <RomanTableHead>Active</RomanTableHead>
                          <RomanTableHead>Passive</RomanTableHead>
                        </RomanTableRow>
                      </RomanTableHeader>
                      <RomanTableBody>
                        {['present', 'perfect', 'future'].map(tense => (
                          <RomanTableRow key={tense}>
                            <RomanTableCell className="font-medium capitalize">{tense}</RomanTableCell>
                            <RomanTableCell>
                              {conjugation.nonFinite.participle.active?.[tense]?.join(', ') || '-'}
                            </RomanTableCell>
                            <RomanTableCell>
                              {conjugation.nonFinite.participle.passive?.[tense]?.join(', ') || '-'}
                            </RomanTableCell>
                          </RomanTableRow>
                        ))}
                      </RomanTableBody>
                    </RomanTable>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Vocabulary Viewer</h1>
              <p className="text-sm text-roman-stone">View and edit Latin words</p>
            </div>
          </div>
        </div>
        <div className="text-sm text-roman-stone">
          {words.length} words loaded
          {countsLoading && ' (loading counts...)'}
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="wordType">Word Type</Label>
                <Select value={selectedWordType} onValueChange={setSelectedWordType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border shadow-lg z-50">
                    <SelectItem value="all" className="bg-white hover:bg-gray-100">
                      All types
                    </SelectItem>
                    {Object.entries(wordTypeCounts).map(([type, count]) => (
                      <SelectItem key={type} value={type} className="bg-white hover:bg-gray-100">
                        {type} ({count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="section">Section</Label>
                <Select value={selectedSection} onValueChange={setSelectedSection}>
                  <SelectTrigger>
                    <SelectValue placeholder="All sections" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border shadow-lg z-50">
                    <SelectItem value="all" className="bg-white hover:bg-gray-100">
                      All sections
                    </SelectItem>
                    <SelectItem value="Nouns" className="bg-white hover:bg-gray-100">
                      Nouns
                    </SelectItem>
                    <SelectItem value="Verbs" className="bg-white hover:bg-gray-100">
                      Verbs
                    </SelectItem>
                    <SelectItem value="Adjectives" className="bg-white hover:bg-gray-100">
                      Adjectives
                    </SelectItem>
                    <SelectItem value="Adverbs" className="bg-white hover:bg-gray-100">
                      Adverbs
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="search">Search</Label>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <Input
                    id="search"
                    placeholder="Search words..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  <Button type="submit" size="sm">
                    <Search className="h-4 w-4" />
                  </Button>
                </form>
              </div>

              <div className="flex items-end">
                <Button variant="outline" onClick={resetFilters}>
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Word List */}
        {loading ? (
          <div className="flex items-center justify-center min-h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {words.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-800 mb-2">No Words Found</h3>
                  <p className="text-gray-600">Try adjusting your filters or search terms.</p>
                </CardContent>
              </Card>
            ) : (
              words.map(word => (
                <Card key={word.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-serif font-medium">{word.word}</h3>
                          <Badge className={getWordTypeColor(word.wordType)}>{word.wordType}</Badge>
                          {word.gender && <Badge variant="outline">{word.gender}</Badge>}
                        </div>

                        <div className="space-y-1 text-sm">
                          <p>
                            <strong>Translation:</strong> {word.translation}
                          </p>
                          <p>
                            <strong>Grammatical Info:</strong> {word.grammaticalInfo}
                          </p>
                          <p>
                            <strong>Section:</strong> {word.section}
                          </p>
                          {word.subsection && (
                            <p>
                              <strong>Subsection:</strong> {word.subsection}
                            </p>
                          )}
                          {word.definitions && word.definitions.length > 0 && (
                            <p>
                              <strong>Definitions:</strong> {word.definitions.join('; ')}
                            </p>
                          )}
                          {word.etymology && (
                            <p>
                              <strong>Etymology:</strong> {word.etymology}
                            </p>
                          )}
                          {word.pronunciation && (
                            <p>
                              <strong>Pronunciation:</strong> {word.pronunciation}
                            </p>
                          )}
                          {word.principalParts && word.principalParts.length > 0 && (
                            <p>
                              <strong>Principal Parts:</strong> {word.principalParts.join(', ')}
                            </p>
                          )}
                          {word.declensionClass && (
                            <p>
                              <strong>Declension Class:</strong> {word.declensionClass}
                            </p>
                          )}
                          {word.conjugationClass && (
                            <p>
                              <strong>Conjugation Class:</strong> {word.conjugationClass}
                            </p>
                          )}
                          {word.isDeponent && (
                            <p>
                              <strong>Deponent:</strong> Yes
                            </p>
                          )}
                        </div>

                        {/* Grammatical Tables */}
                        {renderDeclensionTable(word)}
                        {renderAdjectiveDeclensionTable(word)}
                        {renderConjugationTable(word)}
                      </div>

                      <Button variant="outline" size="sm" onClick={() => handleEditWord(word)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Load More Button */}
        {hasMore && words.length > 0 && (
          <div className="flex justify-center mt-8">
            <Button onClick={() => loadWords(false)} disabled={loadingMore} className="flex items-center gap-2">
              {loadingMore ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Loading...
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Load More Words
                </>
              )}
            </Button>
          </div>
        )}
      </main>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white opacity-100">
          <DialogHeader>
            <DialogTitle>Edit Word: {editingWord?.word}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="word">Word</Label>
                <Input
                  id="word"
                  value={editFormData.word || ''}
                  onChange={e => setEditFormData({ ...editFormData, word: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="wordType">Word Type</Label>
                <Select
                  value={editFormData.wordType || 'noun'}
                  onValueChange={value => setEditFormData({ ...editFormData, wordType: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border shadow-lg z-50">
                    <SelectItem value="noun" className="bg-white hover:bg-gray-100">
                      Noun
                    </SelectItem>
                    <SelectItem value="verb" className="bg-white hover:bg-gray-100">
                      Verb
                    </SelectItem>
                    <SelectItem value="adjective" className="bg-white hover:bg-gray-100">
                      Adjective
                    </SelectItem>
                    <SelectItem value="adverb" className="bg-white hover:bg-gray-100">
                      Adverb
                    </SelectItem>
                    <SelectItem value="preposition" className="bg-white hover:bg-gray-100">
                      Preposition
                    </SelectItem>
                    <SelectItem value="pronoun" className="bg-white hover:bg-gray-100">
                      Pronoun
                    </SelectItem>
                    <SelectItem value="conjunction" className="bg-white hover:bg-gray-100">
                      Conjunction
                    </SelectItem>
                    <SelectItem value="interjection" className="bg-white hover:bg-gray-100">
                      Interjection
                    </SelectItem>
                    <SelectItem value="enclitic" className="bg-white hover:bg-gray-100">
                      Enclitic
                    </SelectItem>
                    <SelectItem value="number" className="bg-white hover:bg-gray-100">
                      Number
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="translation">Translation</Label>
              <Textarea
                id="translation"
                value={editFormData.translation || ''}
                onChange={e => setEditFormData({ ...editFormData, translation: e.target.value })}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="grammaticalInfo">Grammatical Info</Label>
              <Input
                id="grammaticalInfo"
                value={editFormData.grammaticalInfo || ''}
                onChange={e => setEditFormData({ ...editFormData, grammaticalInfo: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="section">Section</Label>
                <Input
                  id="section"
                  value={editFormData.section || ''}
                  onChange={e => setEditFormData({ ...editFormData, section: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="subsection">Subsection</Label>
                <Input
                  id="subsection"
                  value={editFormData.subsection || ''}
                  onChange={e => setEditFormData({ ...editFormData, subsection: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={editFormData.gender || 'none'}
                  onValueChange={value => setEditFormData({ ...editFormData, gender: value === 'none' ? '' : value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border shadow-lg z-50">
                    <SelectItem value="none" className="bg-white hover:bg-gray-100">
                      None
                    </SelectItem>
                    <SelectItem value="m" className="bg-white hover:bg-gray-100">
                      Masculine
                    </SelectItem>
                    <SelectItem value="f" className="bg-white hover:bg-gray-100">
                      Feminine
                    </SelectItem>
                    <SelectItem value="n" className="bg-white hover:bg-gray-100">
                      Neuter
                    </SelectItem>
                    <SelectItem value="m/f" className="bg-white hover:bg-gray-100">
                      Masculine/Feminine
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="declensionClass">Declension Class</Label>
                <Input
                  id="declensionClass"
                  value={editFormData.declensionClass || ''}
                  onChange={e => setEditFormData({ ...editFormData, declensionClass: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="etymology">Etymology</Label>
              <Textarea
                id="etymology"
                value={editFormData.etymology || ''}
                onChange={e => setEditFormData({ ...editFormData, etymology: e.target.value })}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="pronunciation">Pronunciation</Label>
              <Input
                id="pronunciation"
                value={editFormData.pronunciation || ''}
                onChange={e => setEditFormData({ ...editFormData, pronunciation: e.target.value })}
              />
            </div>

            {/* Roman Tables */}
            <div className="mt-6 border-t pt-4">
              <h3 className="text-lg font-medium mb-4">Grammatical Tables</h3>
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <p>• Double-click on any cell to edit its content</p>
                <p>• Use commas to separate multiple forms (e.g., "rosa, rosae")</p>
                <p>• Press Enter to save or Escape to cancel</p>
              </div>
              {renderEditDeclensionTable()}
              {renderEditAdjectiveDeclensionTable()}
              {renderEditConjugationTable()}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)} disabled={updating}>
                Cancel
              </Button>
              <Button onClick={handleUpdateWord} disabled={updating}>
                {updating ? 'Updating...' : 'Update Word'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
