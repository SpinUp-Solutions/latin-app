import React, { useEffect, useMemo, useState } from 'react';
import { useForm, FormProvider, Resolver } from 'react-hook-form';
import { useDispatch, useSelector } from 'react-redux';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/src/components/ui/button';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/index';
import { EditingCell } from '@/src/types/admin-vocabulary';
import { parseEditingCellValue, TABLE_TYPES, TableType } from '@/src/utils/vocabUtils';
import { SchemaTable } from './tables/SchemaTable';
import { DeclensionTableSchema, AdjectiveDeclensionTableSchema } from '@/shared/types/vocabulary/schemas/declension';
import { ConjugationTableSchema } from '@/shared/types/vocabulary/schemas/verb-conjugation';
import { DegreesTableSchema } from '@/shared/types/vocabulary/schemas/adjective';
import { BookOpen } from 'lucide-react';
import { BaseWordForm, NounForm, PronounForm, AdjectiveForm, VerbForm, PrepositionForm, VocabularyFormValues } from './forms';
import { AIAutocompleteButton } from './AIAutocompleteButton';
import {
  getFormSchemaForPartOfSpeech,
  toFormDefaultValues,
  applyFormValuesToWord,
} from '@/src/types/vocabulary/form-schemas/builder';
import type { BaseWordFormValues } from '@/src/types/vocabulary/form-schemas/base';
import {
  clear as clearVocabularyEdit,
  initFromWord,
  selectConjugationTable,
  selectDeclensionTable,
  selectDegreesTable,
  selectVocabularyPartOfSpeech,
  setCell as setVocabularyTableCell,
} from '@/src/store/slices/vocabularyEditSlice';
import type { RootState } from '@/src/store';

export const AIFilledFieldsContext = React.createContext<Map<string, 'filled' | 'missing'>>(new Map());

interface WordEditPanelProps {
  word: VocabularyWordWithId | null;
  onSave: (updates: Partial<VocabularyWord>) => Promise<boolean>;
  updating: boolean;
}

const EMPTY_FORM_VALUES: BaseWordFormValues = {
  word: '',
  translation: '',
  definitions: [],
  etymology: '',
  pronunciation: '',
  type: 'core',
  alternate_form: '',
  dictionary_entry: null,
  sort_key: '',
  random_index: 0,
};

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

const getValueFromTable = (table: Record<string, unknown>, path: string): unknown => {
  if (!table) return undefined;
  const segments = path.split('.').filter(Boolean);
  let current: unknown = table;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const cloneTableData = (value: unknown): Record<string, unknown> => {
  if (value === undefined || value === null) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch (error) {
    return {};
  }
};

export const WordEditPanel: React.FC<WordEditPanelProps> = ({ word, onSave, updating }) => {
  const dispatch = useDispatch();
  const schema = useMemo(() => getFormSchemaForPartOfSpeech(word?.part_of_speech ?? 'noun'), [word?.part_of_speech]);

  const form = useForm<VocabularyFormValues>({
    resolver: zodResolver(schema) as Resolver<VocabularyFormValues>,
    defaultValues: word ? toFormDefaultValues(word) : (EMPTY_FORM_VALUES as VocabularyFormValues),
    mode: 'onSubmit',
  });

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingCellValue, setEditingCellValue] = useState('');
  const [expandedEditTables, setExpandedEditTables] = useState<Set<string>>(
    new Set([TABLE_TYPES.DECLENSION, TABLE_TYPES.ADJECTIVE_DECLENSION, TABLE_TYPES.CONJUGATION])
  );
  const [aiFieldStatus, setAiFieldStatus] = useState<Map<string, 'filled' | 'missing'>>(new Map());
  const [tableErrors, setTableErrors] = useState<string[]>([]);

  const declensionTable = useSelector((state: RootState) => selectDeclensionTable(state));
  const degreesTable = useSelector((state: RootState) => selectDegreesTable(state));
  const conjugationTable = useSelector((state: RootState) => selectConjugationTable(state));
  const currentPartOfSpeech = useSelector((state: RootState) => selectVocabularyPartOfSpeech(state));

  useEffect(() => {
    if (word) {
      const formValues = toFormDefaultValues(word);
      form.reset(formValues, { keepDefaultValues: false });
      dispatch(initFromWord(word));
      setExpandedEditTables(
        new Set([TABLE_TYPES.DECLENSION, TABLE_TYPES.ADJECTIVE_DECLENSION, TABLE_TYPES.CONJUGATION])
      );
    } else {
      form.reset(EMPTY_FORM_VALUES as VocabularyFormValues, { keepDefaultValues: false });
      dispatch(clearVocabularyEdit());
    }
    setEditingCell(null);
    setEditingCellValue('');
    setTableErrors([]);
    setAiFieldStatus(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.id, dispatch]);

  const handleCellDoubleClick = (rowIndex: number, cellKey: string, tableType: string, displayValue: string) => {
    const tableData =
      tableType === TABLE_TYPES.DECLENSION
        ? declensionTable
        : tableType === TABLE_TYPES.ADJECTIVE_DECLENSION
          ? degreesTable
          : conjugationTable;
    const existingValue = getValueFromTable(tableData, cellKey);
    const normalized = Array.isArray(existingValue)
      ? existingValue.join(', ')
      : displayValue === '—'
        ? ''
        : displayValue;
    setEditingCell({ rowIndex, cellKey, tableType });
    setEditingCellValue(normalized);
  };

  const handleCellEditSave = () => {
    if (!editingCell) return;
    const { cellKey, tableType } = editingCell;
    const newValue = parseEditingCellValue(editingCellValue);
    const valueForStore = newValue.length > 0 ? newValue : null;
    dispatch(setVocabularyTableCell({ tableType: tableType as TableType, path: cellKey, value: valueForStore }));
    setEditingCell(null);
    setEditingCellValue('');
  };

  const handleCellEditCancel = () => {
    setEditingCell(null);
    setEditingCellValue('');
  };

  const toggleEditTableExpansion = (tableType: string) => {
    setExpandedEditTables(prev => {
      const next = new Set(prev);
      if (next.has(tableType)) {
        next.delete(tableType);
      } else {
        next.add(tableType);
      }
      return next;
    });
  };

  const isEditTableExpanded = (tableType: string) => expandedEditTables.has(tableType);

  const findNullPaths = (obj: unknown, path = ''): string[] => {
    const nullPaths: string[] = [];

    if (obj === null || obj === undefined) {
      return [path];
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0 || obj.every(item => item === null || item === undefined)) {
        nullPaths.push(path);
      }
      return nullPaths;
    }

    if (typeof obj === 'object') {
      const objRecord = obj as Record<string, unknown>;
      for (const key in objRecord) {
        const newPath = path ? `${path}.${key}` : key;
        nullPaths.push(...findNullPaths(objRecord[key], newPath));
      }
    }

    return nullPaths;
  };

  const deepMergeNullValues = (existing: unknown, aiGenerated: unknown): unknown => {
    if (aiGenerated === null || aiGenerated === undefined) {
      return existing;
    }

    if (existing === null || existing === undefined) {
      return aiGenerated;
    }

    if (Array.isArray(aiGenerated)) {
      if (
        !Array.isArray(existing) ||
        existing.length === 0 ||
        existing.every(item => item === null || item === undefined || item === '')
      ) {
        return aiGenerated;
      }
      return existing;
    }

    if (typeof aiGenerated === 'object' && typeof existing === 'object') {
      const existingRecord = existing as Record<string, unknown>;
      const aiGeneratedRecord = aiGenerated as Record<string, unknown>;
      const merged = { ...existingRecord };
      for (const key in aiGeneratedRecord) {
        merged[key] = deepMergeNullValues(existingRecord[key], aiGeneratedRecord[key]);
      }
      return merged;
    }

    if (existing === '' || existing === null || existing === undefined) {
      return aiGenerated;
    }

    return existing;
  };

  const handleAIAutocomplete = (
    aiData: Partial<VocabularyWord>,
    apiFieldStatus?: Record<string, 'filled' | 'missing'>
  ) => {
    console.log('[WordEditPanel] AI Autocomplete data received:', aiData);
    console.log('[WordEditPanel] Field status from API:', apiFieldStatus);

    const aiDataRecord = aiData as Record<string, unknown>;
    const fieldStatus = new Map<string, 'filled' | 'missing'>(Object.entries(apiFieldStatus || {}));

    // Fill form fields with AI data
    Object.entries(aiData).forEach(([key, value]) => {
      if (key === 'part_of_speech') return;

      if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        console.log(`[WordEditPanel] Setting form field ${key}`);
        form.setValue(key as keyof VocabularyFormValues, value as never, { shouldValidate: false, shouldDirty: true });
      }
    });

    if (aiDataRecord.conjugation_table && currentPartOfSpeech === 'verb') {
      console.log('[WordEditPanel] Conjugation table received from AI');
      console.log('[WordEditPanel] Current conjugation table exists:', !!conjugationTable);

      const nullPathsBefore = conjugationTable ? findNullPaths(conjugationTable) : [];
      const nullPathsInAI = findNullPaths(aiDataRecord.conjugation_table);

      console.log('[WordEditPanel] Null paths BEFORE merge:', nullPathsBefore.slice(0, 20));
      console.log('[WordEditPanel] Total null paths before:', nullPathsBefore.length);
      console.log('[WordEditPanel] Null paths in AI data:', nullPathsInAI.slice(0, 20));
      console.log('[WordEditPanel] Total null paths in AI:', nullPathsInAI.length);

      const mergedConjugationTable = conjugationTable
        ? deepMergeNullValues(conjugationTable, aiDataRecord.conjugation_table)
        : aiDataRecord.conjugation_table;

      const nullPathsAfter = findNullPaths(mergedConjugationTable);
      console.log('[WordEditPanel] Null paths AFTER merge:', nullPathsAfter.slice(0, 20));
      console.log('[WordEditPanel] Total null paths after:', nullPathsAfter.length);
      console.log('[WordEditPanel] Fields filled by AI:', nullPathsBefore.length - nullPathsAfter.length);

      console.log('[WordEditPanel] Dispatching initFromWord with merged conjugation table');
      dispatch(initFromWord({ ...word, conjugation_table: mergedConjugationTable } as VocabularyWordWithId));

      const nullPathsBeforeSet = new Set(nullPathsBefore);
      const nullPathsAfterSet = new Set(nullPathsAfter);

      for (const path of nullPathsBefore) {
        if (!nullPathsAfterSet.has(path)) {
          fieldStatus.set(`conjugation_table.${path}`, 'filled');
        }
      }

      for (const path of nullPathsAfter) {
        if (nullPathsBeforeSet.has(path)) {
          fieldStatus.set(`conjugation_table.${path}`, 'missing');
        }
      }
    }

    if (aiDataRecord.declension_table && currentPartOfSpeech === 'noun') {
      console.log('[WordEditPanel] Declension table received:', aiDataRecord.declension_table);
      console.log('[WordEditPanel] Current declension table:', declensionTable);

      const nullPathsBefore = declensionTable ? findNullPaths(declensionTable) : [];

      const mergedDeclensionTable = declensionTable
        ? deepMergeNullValues(declensionTable, aiDataRecord.declension_table)
        : aiDataRecord.declension_table;

      const nullPathsAfter = findNullPaths(mergedDeclensionTable);

      console.log('[WordEditPanel] Merged declension table:', mergedDeclensionTable);
      console.log('[WordEditPanel] Dispatching initFromWord with merged declension table');
      dispatch(initFromWord({ ...word, declension_table: mergedDeclensionTable } as VocabularyWordWithId));

      const nullPathsBeforeSet = new Set(nullPathsBefore);
      const nullPathsAfterSet = new Set(nullPathsAfter);

      for (const path of nullPathsBefore) {
        if (!nullPathsAfterSet.has(path)) {
          fieldStatus.set(`declension_table.${path}`, 'filled');
        }
      }

      for (const path of nullPathsAfter) {
        if (nullPathsBeforeSet.has(path)) {
          fieldStatus.set(`declension_table.${path}`, 'missing');
        }
      }
    }

    if (aiDataRecord.declension_table && currentPartOfSpeech === 'pronoun') {
      console.log('[WordEditPanel] Pronoun declension table received:', aiDataRecord.declension_table);
      console.log('[WordEditPanel] Current pronoun declension table:', declensionTable);

      const nullPathsBefore = declensionTable ? findNullPaths(declensionTable) : [];

      const mergedDeclensionTable = declensionTable
        ? deepMergeNullValues(declensionTable, aiDataRecord.declension_table)
        : aiDataRecord.declension_table;

      const nullPathsAfter = findNullPaths(mergedDeclensionTable);

      console.log('[WordEditPanel] Merged pronoun declension table:', mergedDeclensionTable);
      console.log('[WordEditPanel] Dispatching initFromWord with merged pronoun declension table');
      dispatch(initFromWord({ ...word, declension_table: mergedDeclensionTable } as VocabularyWordWithId));

      const nullPathsBeforeSet = new Set(nullPathsBefore);
      const nullPathsAfterSet = new Set(nullPathsAfter);

      for (const path of nullPathsBefore) {
        if (!nullPathsAfterSet.has(path)) {
          fieldStatus.set(`declension_table.${path}`, 'filled');
        }
      }

      for (const path of nullPathsAfter) {
        if (nullPathsBeforeSet.has(path)) {
          fieldStatus.set(`declension_table.${path}`, 'missing');
        }
      }
    }

    if (aiDataRecord.degrees_table && currentPartOfSpeech === 'adjective') {
      console.log('[WordEditPanel] Degrees table received:', aiDataRecord.degrees_table);
      console.log('[WordEditPanel] Current degrees table:', degreesTable);

      const nullPathsBefore = degreesTable ? findNullPaths(degreesTable) : [];

      const mergedDegreesTable = degreesTable
        ? deepMergeNullValues(degreesTable, aiDataRecord.degrees_table)
        : aiDataRecord.degrees_table;

      const nullPathsAfter = findNullPaths(mergedDegreesTable);

      console.log('[WordEditPanel] Merged degrees table:', mergedDegreesTable);
      console.log('[WordEditPanel] Dispatching initFromWord with merged degrees table');
      dispatch(initFromWord({ ...word, degrees_table: mergedDegreesTable } as VocabularyWordWithId));

      const nullPathsBeforeSet = new Set(nullPathsBefore);
      const nullPathsAfterSet = new Set(nullPathsAfter);

      for (const path of nullPathsBefore) {
        if (!nullPathsAfterSet.has(path)) {
          fieldStatus.set(`degrees_table.${path}`, 'filled');
        }
      }

      for (const path of nullPathsAfter) {
        if (nullPathsBeforeSet.has(path)) {
          fieldStatus.set(`degrees_table.${path}`, 'missing');
        }
      }
    }

    console.log('[WordEditPanel] AI field status:', Array.from(fieldStatus.entries()));
    setAiFieldStatus(fieldStatus);
  };

  const handleSubmit = form.handleSubmit(
    async values => {
      if (!word) return;
      const newTableErrors: string[] = [];

      if (currentPartOfSpeech === 'noun') {
        const result = DeclensionTableSchema.safeParse(declensionTable);
        if (!result.success) {
          newTableErrors.push(result.error.issues[0]?.message ?? 'Invalid declension table');
        }
      }

      if (currentPartOfSpeech === 'pronoun') {
        const result = AdjectiveDeclensionTableSchema.safeParse(declensionTable);
        if (!result.success) {
          newTableErrors.push(result.error.issues[0]?.message ?? 'Invalid pronoun declension table');
        }
      }

      if (currentPartOfSpeech === 'adjective') {
        const result = DegreesTableSchema.safeParse(degreesTable);
        if (!result.success) {
          newTableErrors.push(result.error.issues[0]?.message ?? 'Invalid degrees table');
        }
      }

      if (currentPartOfSpeech === 'verb') {
        const result = ConjugationTableSchema.safeParse(conjugationTable);
        if (!result.success) {
          newTableErrors.push(result.error.issues[0]?.message ?? 'Invalid conjugation table');
        }
      }

      if (newTableErrors.length > 0) {
        setTableErrors(newTableErrors);
        return;
      }

      setTableErrors([]);

      const updatedWord = applyFormValuesToWord(word, values);

      if (currentPartOfSpeech === 'noun' || currentPartOfSpeech === 'pronoun') {
        const clonedTable = cloneTableData(declensionTable);
        (updatedWord as unknown as Record<string, unknown>).declension_table = clonedTable;
      }

      if (currentPartOfSpeech === 'adjective') {
        const clonedTable = cloneTableData(degreesTable);
        (updatedWord as unknown as Record<string, unknown>).degrees_table = clonedTable;
      }

      if (currentPartOfSpeech === 'verb') {
        const clonedTable = cloneTableData(conjugationTable);
        (updatedWord as unknown as Record<string, unknown>).conjugation_table = clonedTable;
      }

      const { id: discardedId, ...payload } = updatedWord;
      void discardedId;

      const success = await onSave(payload);
      if (success) {
        form.reset(toFormDefaultValues(updatedWord));
        dispatch(initFromWord(updatedWord));
        setEditingCell(null);
        setEditingCellValue('');
        setAiFieldStatus(new Map());
      }
    },
    errors => {
      setTableErrors([]);
      console.error('WordEditPanel submit errors', errors);
    }
  );

  const watchedWord = form.watch('word');

  const renderPosForm = () => {
    if (!word) return null;
    switch (word.part_of_speech) {
      case 'noun':
        return <NounForm />;
      case 'pronoun':
        return <PronounForm />;
      case 'adjective':
        return <AdjectiveForm />;
      case 'verb':
        return <VerbForm />;
      case 'preposition':
        return <PrepositionForm />;
      case 'adverb':
      case 'conjunction':
      case 'interjection':
        return null;
      default:
        return null;
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  if (!word) {
    return <EmptyState />;
  }

  return (
    <FormProvider {...form}>
      <AIFilledFieldsContext.Provider value={aiFieldStatus}>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col h-full overflow-hidden bg-white border-l border-gray-200">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-serif font-semibold text-roman-red truncate">{watchedWord || word.word}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{word.part_of_speech}</p>
              </div>
              <div className="flex items-center gap-2">
                <AIAutocompleteButton
                  word={watchedWord || word.word}
                  partOfSpeech={word.part_of_speech}
                  existingData={form.getValues() as Partial<VocabularyWord>}
                  onAutocomplete={handleAIAutocomplete}
                  disabled={updating || isSubmitting}
                />
                <Button type="submit" disabled={updating || isSubmitting}>
                  {updating || isSubmitting ? 'Saving...' : 'Apply'}
                </Button>
              </div>
            </div>
            {Object.keys(form.formState.errors).length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <div className="font-semibold mb-1">Validation Errors:</div>
                <pre className="text-xs overflow-auto">{JSON.stringify(form.formState.errors, null, 2)}</pre>
              </div>
            )}
            {tableErrors.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <div className="font-semibold mb-1">Table Validation Errors:</div>
                <ul className="list-disc list-inside space-y-1">
                  {tableErrors.map((error, index) => (
                    <li key={index} className="text-xs">
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              <BaseWordForm />
              {renderPosForm()}

              {word?.part_of_speech === 'noun' && (
                <SchemaTable
                  schema={DeclensionTableSchema}
                  data={declensionTable}
                  tableType={TABLE_TYPES.DECLENSION}
                  title="Declension Table"
                  color="text-blue-700"
                  isExpanded={isEditTableExpanded(TABLE_TYPES.DECLENSION)}
                  onToggle={() => toggleEditTableExpansion(TABLE_TYPES.DECLENSION)}
                  isEditMode={true}
                  editingCell={editingCell}
                  editingCellValue={editingCellValue}
                  editCallbacks={{
                    onCellDoubleClick: handleCellDoubleClick,
                    onCellEditSave: handleCellEditSave,
                    onCellEditCancel: handleCellEditCancel,
                    onEditingCellValueChange: setEditingCellValue,
                  }}
                />
              )}

              {word?.part_of_speech === 'pronoun' && (
                <SchemaTable
                  schema={AdjectiveDeclensionTableSchema}
                  data={declensionTable}
                  tableType={TABLE_TYPES.DECLENSION}
                  title="Pronoun Declension Table"
                  color="text-indigo-700"
                  isExpanded={isEditTableExpanded(TABLE_TYPES.DECLENSION)}
                  onToggle={() => toggleEditTableExpansion(TABLE_TYPES.DECLENSION)}
                  isEditMode={true}
                  editingCell={editingCell}
                  editingCellValue={editingCellValue}
                  editCallbacks={{
                    onCellDoubleClick: handleCellDoubleClick,
                    onCellEditSave: handleCellEditSave,
                    onCellEditCancel: handleCellEditCancel,
                    onEditingCellValueChange: setEditingCellValue,
                  }}
                />
              )}

              {word?.part_of_speech === 'adjective' && (
                <SchemaTable
                  schema={DegreesTableSchema}
                  data={degreesTable}
                  tableType={TABLE_TYPES.ADJECTIVE_DECLENSION}
                  title="Degrees of Comparison"
                  color="text-purple-700"
                  isExpanded={isEditTableExpanded(TABLE_TYPES.ADJECTIVE_DECLENSION)}
                  onToggle={() => toggleEditTableExpansion(TABLE_TYPES.ADJECTIVE_DECLENSION)}
                  isEditMode={true}
                  editingCell={editingCell}
                  editingCellValue={editingCellValue}
                  editCallbacks={{
                    onCellDoubleClick: handleCellDoubleClick,
                    onCellEditSave: handleCellEditSave,
                    onCellEditCancel: handleCellEditCancel,
                    onEditingCellValueChange: setEditingCellValue,
                  }}
                />
              )}

              {word?.part_of_speech === 'verb' && (
                <SchemaTable
                  schema={ConjugationTableSchema}
                  data={conjugationTable}
                  tableType={TABLE_TYPES.CONJUGATION}
                  title="Conjugation Table"
                  color="text-green-700"
                  isExpanded={isEditTableExpanded(TABLE_TYPES.CONJUGATION)}
                  onToggle={() => toggleEditTableExpansion(TABLE_TYPES.CONJUGATION)}
                  isEditMode={true}
                  editingCell={editingCell}
                  editingCellValue={editingCellValue}
                  editCallbacks={{
                    onCellDoubleClick: handleCellDoubleClick,
                    onCellEditSave: handleCellEditSave,
                    onCellEditCancel: handleCellEditCancel,
                    onEditingCellValueChange: setEditingCellValue,
                  }}
                />
              )}
            </div>
          </div>
        </form>
      </AIFilledFieldsContext.Provider>
    </FormProvider>
  );
};
