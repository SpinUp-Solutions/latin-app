import React, { useEffect, useState } from 'react';
import { useForm, FormProvider, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button } from '@/src/components/ui/button';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/index';
import { EditingCell } from '@/src/types/admin-vocabulary';
import { parseEditingCellValue } from '@/src/utils/vocabUtils';
import { SchemaTable } from './tables/SchemaTable';
import {
  DeclensionTableSchema,
  AdjectiveDeclensionTableSchema,
  PersonalPronounDeclensionTableSchema,
} from '@/shared/types/vocabulary/schemas/declension';
import { buildEmptyFromSchema } from '@/src/utils/schema-defaults';
import type { PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import { ConjugationTableSchema } from '@/shared/types/vocabulary/schemas/verb-conjugation';
import { DegreesTableSchema } from '@/shared/types/vocabulary/schemas/adjective';
import { BookOpen } from 'lucide-react';
import {
  BaseWordForm,
  NounForm,
  PronounForm,
  AdjectiveForm,
  VerbForm,
  PrepositionForm,
  VocabularyFormValues,
} from './forms';
import { AIAutocompleteButton } from './AIAutocompleteButton';
import {
  toFormDefaultValues,
  applyFormValuesToWord,
  VocabularyFormSchema,
} from '@/src/types/vocabulary/form-schemas/builder';

export const AIFilledFieldsContext = React.createContext<Map<string, 'filled' | 'missing'>>(new Map());

interface WordEditPanelProps {
  word: VocabularyWordWithId | null;
  onSave: (updates: Partial<VocabularyWord>) => Promise<boolean>;
  updating: boolean;
}

type TableData = Record<string, unknown>;

const EMPTY_FORM_VALUES: VocabularyFormValues = {
  word: '',
  part_of_speech: 'adverb',
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

/** The one inflection table each part of speech edits; pronoun schema and title depend on type and person. */
const EDITABLE_TABLES: Partial<
  Record<string, { field: string; tableType: string; title: string; color: string; schema: z.ZodTypeAny }>
> = {
  noun: {
    field: 'declension_table',
    tableType: 'declension',
    title: 'Declension Table',
    color: 'text-blue-700',
    schema: DeclensionTableSchema,
  },
  pronoun: {
    field: 'declension_table',
    tableType: 'declension',
    title: 'Pronoun Declension Table',
    color: 'text-indigo-700',
    schema: AdjectiveDeclensionTableSchema,
  },
  adjective: {
    field: 'degrees_table',
    tableType: 'adjective-declension',
    title: 'Degrees of Comparison',
    color: 'text-purple-700',
    schema: DegreesTableSchema,
  },
  verb: {
    field: 'conjugation_table',
    tableType: 'conjugation',
    title: 'Conjugation Table',
    color: 'text-green-700',
    schema: ConjugationTableSchema,
  },
};

const getEditableTable = (word: VocabularyWordWithId | null) =>
  word ? EDITABLE_TABLES[word.part_of_speech] : undefined;

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

const getValueFromTable = (table: TableData, path: string): unknown => {
  let current: unknown = table;
  for (const segment of path.split('.').filter(Boolean)) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as TableData)[segment];
  }
  return current;
};

const setNestedValue = (target: TableData, path: string, value: unknown) => {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) return;

  let current = target;
  for (const key of segments.slice(0, -1)) {
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as TableData;
  }
  current[segments[segments.length - 1]] = value;
};

const cloneTableData = (value: unknown): TableData => {
  if (value === undefined || value === null) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as TableData;
  } catch {
    return {};
  }
};

const tableFromWord = (word: VocabularyWordWithId | null): TableData => {
  const table = getEditableTable(word);
  return table ? cloneTableData((word as unknown as TableData)[table.field]) : {};
};

const getPronounTableSchema = (pronounType: PronounType | null, person: PronounPerson | null) => {
  if (pronounType === 'personal' && (person === '1st' || person === '2nd')) {
    return PersonalPronounDeclensionTableSchema;
  }
  return AdjectiveDeclensionTableSchema;
};

const getPronounTableTitle = (pronounType: PronounType | null, person: PronounPerson | null): string => {
  if (!pronounType) return 'Pronoun Declension Table';

  if (pronounType === 'personal' && person) {
    return `${person} Person Personal Pronoun Declension Table`;
  }

  const typeLabels: Record<PronounType, string> = {
    personal: 'Personal',
    reflexive: 'Reflexive',
    demonstrative: 'Demonstrative',
    intensive: 'Intensive',
    relative: 'Relative',
    interrogative: 'Interrogative',
    indefinite: 'Indefinite',
    possessive: 'Possessive',
  };
  return `${typeLabels[pronounType]} Pronoun Declension Table`;
};

const findNullPaths = (obj: unknown, path = ''): string[] => {
  if (obj === null || obj === undefined) {
    return [path];
  }

  if (Array.isArray(obj)) {
    return obj.length === 0 || obj.every(item => item === null || item === undefined) ? [path] : [];
  }

  if (typeof obj === 'object') {
    return Object.entries(obj as TableData).flatMap(([key, value]) =>
      findNullPaths(value, path ? `${path}.${key}` : key)
    );
  }

  return [];
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
    const existingRecord = existing as TableData;
    const merged = { ...existingRecord };
    for (const [key, value] of Object.entries(aiGenerated as TableData)) {
      merged[key] = deepMergeNullValues(existingRecord[key], value);
    }
    return merged;
  }

  return existing === '' ? aiGenerated : existing;
};

export const WordEditPanel: React.FC<WordEditPanelProps> = ({ word, onSave, updating }) => {
  const form = useForm<VocabularyFormValues>({
    resolver: zodResolver(VocabularyFormSchema) as Resolver<VocabularyFormValues>,
    defaultValues: word ? toFormDefaultValues(word) : EMPTY_FORM_VALUES,
    mode: 'onSubmit',
  });

  const [table, setTable] = useState<TableData>(() => tableFromWord(word));
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingCellValue, setEditingCellValue] = useState('');
  const [tableExpanded, setTableExpanded] = useState(true);
  const [aiFieldStatus, setAiFieldStatus] = useState<Map<string, 'filled' | 'missing'>>(new Map());
  const [tableErrors, setTableErrors] = useState<string[]>([]);
  const [prevPronounSchema, setPrevPronounSchema] = useState<ReturnType<typeof getPronounTableSchema> | null>(null);

  const editableTable = getEditableTable(word);

  useEffect(() => {
    form.reset(word ? toFormDefaultValues(word) : EMPTY_FORM_VALUES, { keepDefaultValues: false });
    setTable(tableFromWord(word));
    if (word) setTableExpanded(true);
    setEditingCell(null);
    setEditingCellValue('');
    setTableErrors([]);
    setAiFieldStatus(new Map());
    setPrevPronounSchema(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.id]);

  const pronounType = form.watch('pronoun_type') as PronounType | null;
  const pronounPerson = form.watch('person') as PronounPerson | null;

  // Personal 1st/2nd-person pronouns use a different table shape; switching shape starts from an empty table.
  useEffect(() => {
    if (word?.part_of_speech !== 'pronoun') {
      setPrevPronounSchema(null);
      return;
    }
    const schema = getPronounTableSchema(pronounType, pronounPerson);
    if (prevPronounSchema && prevPronounSchema !== schema) {
      setTable(buildEmptyFromSchema(schema));
    }
    setPrevPronounSchema(schema);
  }, [pronounType, pronounPerson, prevPronounSchema, word?.part_of_speech]);

  const handleCellDoubleClick = (rowIndex: number, cellKey: string, tableType: string, displayValue: string) => {
    const existingValue = getValueFromTable(table, cellKey);
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
    const newValue = parseEditingCellValue(editingCellValue);
    setTable(previous => {
      const next = cloneTableData(previous);
      setNestedValue(next, editingCell.cellKey, newValue.length > 0 ? newValue : null);
      return next;
    });
    setEditingCell(null);
    setEditingCellValue('');
  };

  const handleCellEditCancel = () => {
    setEditingCell(null);
    setEditingCellValue('');
  };

  const handleAIAutocomplete = (
    aiData: Partial<VocabularyWord>,
    apiFieldStatus?: Record<string, 'filled' | 'missing'>,
    requestWordId?: string
  ) => {
    // Ignore a response that arrives after the admin switched to another word.
    if (requestWordId && requestWordId !== word?.id) return;

    const fieldStatus = new Map<string, 'filled' | 'missing'>(Object.entries(apiFieldStatus || {}));

    Object.entries(aiData).forEach(([key, value]) => {
      if (key === 'part_of_speech') return;
      if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        form.setValue(key as keyof VocabularyFormValues, value as never, { shouldValidate: false, shouldDirty: true });
      }
    });

    const aiTable = editableTable && (aiData as TableData)[editableTable.field];
    if (editableTable && aiTable) {
      const nullPathsBefore = findNullPaths(table);
      const mergedTable = deepMergeNullValues(table, aiTable);
      const nullPathsAfter = findNullPaths(mergedTable);
      setTable(cloneTableData(mergedTable));

      const nullPathsBeforeSet = new Set(nullPathsBefore);
      const nullPathsAfterSet = new Set(nullPathsAfter);
      for (const path of nullPathsBefore) {
        if (!nullPathsAfterSet.has(path)) fieldStatus.set(`${editableTable.field}.${path}`, 'filled');
      }
      for (const path of nullPathsAfter) {
        if (nullPathsBeforeSet.has(path)) fieldStatus.set(`${editableTable.field}.${path}`, 'missing');
      }
    }

    setAiFieldStatus(fieldStatus);
  };

  const handleSubmit = form.handleSubmit(
    async values => {
      if (!word) return;

      if (editableTable) {
        const schema =
          word.part_of_speech === 'pronoun'
            ? getPronounTableSchema(
                form.getValues('pronoun_type') as PronounType | null,
                form.getValues('person') as PronounPerson | null
              )
            : editableTable.schema;
        const result = schema.safeParse(table);
        if (!result.success) {
          setTableErrors([result.error.issues[0]?.message ?? 'Invalid table']);
          return;
        }
      }

      setTableErrors([]);

      const updatedWord = applyFormValuesToWord(word, values);
      if (editableTable) {
        (updatedWord as unknown as TableData)[editableTable.field] = cloneTableData(table);
      }

      const { id: _id, ...payload } = updatedWord;

      const success = await onSave(payload);
      if (success) {
        form.reset(toFormDefaultValues(updatedWord));
        setTable(tableFromWord(updatedWord));
        setEditingCell(null);
        setEditingCellValue('');
        setAiFieldStatus(new Map());
      }
    },
    () => setTableErrors([])
  );

  const watchedWord = form.watch('word');

  const renderPosForm = () => {
    switch (word?.part_of_speech) {
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
          className="flex h-full min-h-0 flex-col overflow-hidden bg-white border-l border-gray-200">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-serif font-semibold text-roman-red truncate">{watchedWord || word.word}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{word.part_of_speech}</p>
              </div>
              <div className="flex items-center gap-2">
                <AIAutocompleteButton
                  wordId={word.id}
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

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="space-y-6">
              <BaseWordForm />
              {renderPosForm()}

              {editableTable && (
                <SchemaTable
                  schema={
                    word.part_of_speech === 'pronoun'
                      ? getPronounTableSchema(pronounType, pronounPerson)
                      : editableTable.schema
                  }
                  data={table}
                  tableType={editableTable.tableType}
                  title={
                    word.part_of_speech === 'pronoun'
                      ? getPronounTableTitle(pronounType, pronounPerson)
                      : editableTable.title
                  }
                  color={editableTable.color}
                  isExpanded={tableExpanded}
                  onToggle={() => setTableExpanded(expanded => !expanded)}
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
