import React, { useEffect, useEffectEvent, useState } from 'react';
import { toast } from 'sonner';
import type { AICompletableField } from '@/shared/openai/types';
import type { VocabularyAIReview, VocabularyAIUncertainty } from '@/shared/types/vocabulary/ai-review';
import { useForm, FormProvider, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/src/components/ui/button';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/index';
import { EditingCell } from '@/src/types/admin-vocabulary';
import { parseEditingCellValue } from '@/src/utils/vocabUtils';
import { SchemaTable } from './tables/SchemaTable';
import { buildEmptyFromSchema } from '@/src/utils/schema-defaults';
import type { PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
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
import { VocabularyAIReviewPanel } from './VocabularyAIReviewPanel';
import { VocabularyAIGlobalGuidance } from './VocabularyAIGlobalGuidance';
import { getEditableTable, getPronounTableSchema, getPronounTableTitle } from './wordTables';
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
  /** Label of the save button. */
  saveLabel?: string;
  /** Buttons shown before the save button. */
  actions?: React.ReactNode;
  allowAIAutocomplete?: boolean;
  /** Told whether the word has edits that have not been saved; false again when the panel goes away. */
  onDirtyChange?: (dirty: boolean) => void;
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

const findNullPaths = (value: unknown, path = ''): string[] => {
  if (value === null || value === undefined) return [path];
  if (Array.isArray(value)) return value.length === 0 || value.every(item => item == null) ? [path] : [];
  if (typeof value === 'object') {
    return Object.entries(value as TableData).flatMap(([key, child]) =>
      findNullPaths(child, path ? `${path}.${key}` : key)
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

const WordEditor: React.FC<WordEditPanelProps> = ({
  word,
  onSave,
  updating,
  saveLabel = 'Apply',
  actions,
  allowAIAutocomplete = true,
  onDirtyChange,
}) => {
  const form = useForm<VocabularyFormValues>({
    resolver: zodResolver(VocabularyFormSchema) as Resolver<VocabularyFormValues>,
    defaultValues: word ? toFormDefaultValues(word) : EMPTY_FORM_VALUES,
    mode: 'onSubmit',
  });

  const [table, setTable] = useState<TableData>(() => tableFromWord(word));
  const [savedTable, setSavedTable] = useState(() => JSON.stringify(tableFromWord(word)));
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingCellValue, setEditingCellValue] = useState('');
  const [tableExpanded, setTableExpanded] = useState(true);
  const [aiFieldStatus, setAiFieldStatus] = useState<Map<string, 'filled' | 'missing'>>(new Map());
  const [tableErrors, setTableErrors] = useState<string[]>([]);
  const [prevPronounSchema, setPrevPronounSchema] = useState<ReturnType<typeof getPronounTableSchema> | null>(null);

  const editableTable = getEditableTable(word);

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

    const review = form.getValues('ai_review') ?? { uncertainties: [], guidance: [] };
    const mergedIssues = [...review.uncertainties];
    for (const issue of aiData.ai_review?.uncertainties ?? []) {
      if (!mergedIssues.some(existing => existing.field === issue.field && existing.explanation === issue.explanation))
        mergedIssues.push(issue);
    }
    if (mergedIssues.length > 20) {
      toast.error(
        'The result exceeds 20 open AI issues. Resolve some saved issues before requesting another review. No suggestions were applied.'
      );
      return false;
    }
    const current = form.getValues() as unknown as TableData;
    Object.entries(aiData).forEach(([key, value]) => {
      if (key === 'part_of_speech' || key === 'ai_review' || key === editableTable?.field || !(key in current)) return;
      const merged = deepMergeNullValues(current[key], value);
      if (JSON.stringify(merged) !== JSON.stringify(current[key])) {
        form.setValue(key as keyof VocabularyFormValues, merged as never, { shouldValidate: false, shouldDirty: true });
      }
    });
    if (aiData.ai_review) {
      // AI output cannot erase open issues or author remembered instructions.
      form.setValue('ai_review', { ...review, uncertainties: mergedIssues }, { shouldDirty: true });
    }

    const aiTable = editableTable && (aiData as TableData)[editableTable.field];
    if (editableTable && aiTable) {
      const missingBefore = findNullPaths(table);
      const missingAfter = new Set(findNullPaths(deepMergeNullValues(table, aiTable)));
      for (const path of missingBefore) {
        fieldStatus.set(`${editableTable.field}.${path}`, missingAfter.has(path) ? 'missing' : 'filled');
      }
      setTable(previous => {
        const mergedTable = deepMergeNullValues(previous, aiTable);
        return cloneTableData(mergedTable);
      });
    }

    setAiFieldStatus(fieldStatus);
  };

  const handleReviewChange = (review: VocabularyAIReview) => {
    form.setValue('ai_review', review, { shouldDirty: true, shouldValidate: false });
  };

  const handleApplyAnswer = (field: AICompletableField, value: unknown, issue: VocabularyAIUncertainty) => {
    if (editableTable?.field === field) {
      const schema =
        word?.part_of_speech === 'pronoun'
          ? getPronounTableSchema(
              form.getValues('pronoun_type') as PronounType | null,
              form.getValues('person') as PronounPerson | null
            )
          : editableTable.schema;
      setTable(value === null ? buildEmptyFromSchema(schema) : cloneTableData(value));
    } else {
      form.setValue(field as keyof VocabularyFormValues, value as never, { shouldDirty: true, shouldValidate: false });
    }
    const review = form.getValues('ai_review') ?? { uncertainties: [], guidance: [] };
    handleReviewChange({
      ...review,
      uncertainties: review.uncertainties.filter(
        item => item.field !== issue.field || item.explanation !== issue.explanation
      ),
    });
    toast.success(`Answer applied to the draft. Save the word with ${saveLabel}.`);
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
        setSavedTable(JSON.stringify(tableFromWord(updatedWord)));
        setEditingCell(null);
        setEditingCellValue('');
        setAiFieldStatus(new Map());
      }
    },
    () => setTableErrors([])
  );

  const watchedValues = form.watch();
  const watchedWord = watchedValues.word;
  const review = watchedValues.ai_review ?? { uncertainties: [], guidance: [] };
  const aiSnapshot = {
    ...word,
    ...watchedValues,
    ...(editableTable ? { [editableTable.field]: table } : {}),
  } as Partial<VocabularyWord>;
  const snapshotKey = JSON.stringify([aiSnapshot, editingCell, editingCellValue]);

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

  const dirty = form.formState.isDirty || JSON.stringify(table) !== savedTable;
  const reportDirty = useEffectEvent((value: boolean) => onDirtyChange?.(value));
  useEffect(() => {
    reportDirty(dirty);
  }, [dirty]);
  useEffect(() => () => reportDirty(false), []);

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
                {actions}
                {allowAIAutocomplete && (
                  <AIAutocompleteButton
                    key={word.id}
                    wordId={word.id}
                    word={watchedWord || word.word}
                    partOfSpeech={word.part_of_speech}
                    existingData={aiSnapshot}
                    snapshotKey={snapshotKey}
                    onAutocomplete={handleAIAutocomplete}
                    disabled={updating || isSubmitting || !!editingCell}
                  />
                )}
                <Button type="submit" disabled={updating || isSubmitting}>
                  {updating || isSubmitting ? 'Saving...' : saveLabel}
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

          {/* `relative` keeps the hidden native inputs Radix renders for form controls inside this scroller;
              without it they are positioned against the page and make the whole document scrollable. */}
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="space-y-6">
              {allowAIAutocomplete && (
                <>
                  <VocabularyAIReviewPanel
                    key={word.id}
                    review={review}
                    snapshot={aiSnapshot}
                    snapshotKey={snapshotKey}
                    onReviewChange={handleReviewChange}
                    onApply={handleApplyAnswer}
                    disabled={updating || isSubmitting || !!editingCell}
                    saveLabel={saveLabel}
                  />
                  <VocabularyAIGlobalGuidance disabled={updating || isSubmitting} />
                </>
              )}
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

/** A word switch discards local requests, proposals, and draft state together. */
export const WordEditPanel = (props: WordEditPanelProps) => <WordEditor key={props.word?.id ?? 'empty'} {...props} />;
