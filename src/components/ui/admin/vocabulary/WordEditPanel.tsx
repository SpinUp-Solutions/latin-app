import React, { useEffect, useEffectEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import {
  addOpenUncertainties,
  AI_REVIEW_ITEM_LIMIT,
  AICompletableFieldSchema,
  EMPTY_AI_REVIEW,
  type AICompletableField,
  type VocabularyAINote,
  type VocabularyAIMemory,
  type VocabularyAIReview,
  type VocabularyAIUncertainty,
} from '@/shared/types/vocabulary/ai-review';
import type { LearnedAIRules } from '@/src/store/api/vocabularyAIGuidanceApi';
import { changedTableCells } from '@/src/utils/vocabulary/word-diff';
import { useForm, FormProvider, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';
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
import {
  AIFieldReview,
  AIReviewContext,
  AIAssistantDock,
  autocompleteMessage,
  type AcceptedAIReply,
  type AIReviewContextValue,
} from './VocabularyAIReview';
import { useAIAssistant } from './aiAssistantStore';
import { aiFieldLabel } from './wordFields';
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
  /** Saves the rules for all words that the AI learns from the admin's answers. */
  learnedRules?: LearnedAIRules;
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
  learnedRules,
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
  const assistant = useAIAssistant();
  const chatKey = word?.id ?? 'no-word';
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
    apiFieldStatus: Record<string, 'filled' | 'missing'> | undefined,
    requestWordId: string,
    uncertainties: VocabularyAIUncertainty[] = []
  ) => {
    // Ignore a response that arrives after the admin switched to another word.
    if (requestWordId !== word?.id) return;

    const fieldStatus = new Map<string, 'filled' | 'missing'>(Object.entries(apiFieldStatus || {}));

    const current = form.getValues() as unknown as TableData;
    const filled: AICompletableField[] = [];
    Object.entries(aiData).forEach(([key, value]) => {
      if (key === 'part_of_speech' || key === 'ai_review' || key === editableTable?.field || !(key in current)) return;
      const merged = deepMergeNullValues(current[key], value);
      if (JSON.stringify(merged) !== JSON.stringify(current[key])) {
        form.setValue(key as keyof VocabularyFormValues, merged as never, { shouldValidate: false, shouldDirty: true });
        const field = AICompletableFieldSchema.safeParse(key);
        if (field.success) filled.push(field.data);
      }
    });
    if (uncertainties.length > 0) {
      // New doubts join the open ones; only the admin closes a doubt.
      const review = form.getValues('ai_review') ?? EMPTY_AI_REVIEW;
      const merged = addOpenUncertainties(review.uncertainties, uncertainties);
      if (merged.length !== review.uncertainties.length) {
        form.setValue('ai_review', { ...review, uncertainties: merged }, { shouldDirty: true });
      }
    }

    const aiTable = editableTable && (aiData as TableData)[editableTable.field];
    if (editableTable && aiTable) {
      const missingBefore = findNullPaths(table);
      const missingAfter = new Set(findNullPaths(deepMergeNullValues(table, aiTable)));
      for (const path of missingBefore) {
        fieldStatus.set(`${editableTable.field}.${path}`, missingAfter.has(path) ? 'missing' : 'filled');
      }
      const tableField = AICompletableFieldSchema.safeParse(editableTable.field);
      if (tableField.success && missingBefore.some(path => !missingAfter.has(path))) filled.push(tableField.data);
      setTable(previous => {
        const mergedTable = deepMergeNullValues(previous, aiTable);
        return cloneTableData(mergedTable);
      });
    }

    setAiFieldStatus(fieldStatus);

    // The assistant comes up to report the run: all good, or what the AI still asks. It remembers
    // each asked field as autocomplete left it, so only a later edit counts as the admin's own.
    const after = form.getValues() as unknown as TableData;
    const basis = Object.fromEntries(
      uncertainties.map(item => [
        item.field,
        editableTable && aiTable && item.field === editableTable.field
          ? deepMergeNullValues(table, aiTable)
          : after[item.field],
      ])
    );
    const report = autocompleteMessage({ filled, questions: uncertainties.length }, watchedWord || word.word);
    const reportId = assistant.newTurnId();
    assistant.update(chatKey, chat => ({
      ...chat,
      basis: { ...chat.basis, ...basis },
      turns: [
        ...chat.turns,
        { id: reportId, from: 'ai', text: report, proposal: null, status: 'answer', rule: { status: 'offered' } },
      ],
    }));
    assistant.setOpen(true);
  };

  const updateReview = (change: (review: VocabularyAIReview) => VocabularyAIReview) =>
    form.setValue('ai_review', change(form.getValues('ai_review') ?? EMPTY_AI_REVIEW), {
      shouldDirty: true,
      shouldValidate: false,
    });

  /** Notes for later AI requests, up to the limit a word can hold, with the admin's message they came from. */
  const withNotes = (guidance: VocabularyAINote[], notes: VocabularyAIMemory[], source?: string) => {
    const room = Math.max(0, AI_REVIEW_ITEM_LIMIT - guidance.length);
    if (notes.length > room) {
      toast.warning(
        `This word already holds ${AI_REVIEW_ITEM_LIMIT} notes for the AI, so not everything was remembered.`,
        {
          description: 'Remove old notes in the AI assistant to keep new ones.',
        }
      );
    }
    return [
      ...guidance,
      ...notes.slice(0, room).map(({ field, note }) => ({
        id: crypto.randomUUID(),
        instruction: note,
        ...(field ? { field } : {}),
        ...(source?.trim() ? { source: source.trim() } : {}),
      })),
    ];
  };

  const currentTableSchema = () =>
    word?.part_of_speech === 'pronoun'
      ? getPronounTableSchema(
          form.getValues('pronoun_type') as PronounType | null,
          form.getValues('person') as PronounPerson | null
        )
      : editableTable!.schema;

  /** Puts the values the admin accepted in the draft, closes the questions they settle and keeps the notes. */
  const handleAcceptReply = ({ changes, closed, notes, source }: AcceptedAIReply) => {
    // The same room `withNotes` leaves, so the assistant can say which notes were kept.
    const room = AI_REVIEW_ITEM_LIMIT - (form.getValues('ai_review') ?? EMPTY_AI_REVIEW).guidance.length;
    const kept = notes.slice(0, Math.max(0, room));
    const highlighted = new Map(aiFieldStatus);
    for (const [field, value] of Object.entries(changes)) {
      if (editableTable?.field === field) {
        const next = cloneTableData(value === null ? buildEmptyFromSchema(currentTableSchema()) : value);
        for (const path of changedTableCells(table, next)) highlighted.set(`${field}.${path}`, 'filled');
        setTable(next);
      } else {
        form.setValue(field as keyof VocabularyFormValues, value as never, {
          shouldDirty: true,
          shouldValidate: false,
        });
        highlighted.set(field, 'filled');
      }
    }
    setAiFieldStatus(highlighted);
    if (closed.length > 0 || notes.length > 0) {
      updateReview(review => ({
        uncertainties: review.uncertainties.filter(item => !closed.includes(item.field)),
        guidance: withNotes(review.guidance, notes, source),
      }));
    }
    const fields = Object.keys(changes).map(aiFieldLabel);
    if (fields.length > 0) toast.success(`Updated ${fields.join(', ')}. Save the word with ${saveLabel} to keep it.`);
    else if (closed.length > 0 || notes.length > 0)
      toast.success(`Answer noted. Save the word with ${saveLabel} to keep it.`);
    return kept;
  };

  const handleKeep = (field: AICompletableField, note: string) =>
    updateReview(review => ({
      uncertainties: review.uncertainties.filter(item => item.field !== field),
      guidance: withNotes(review.guidance, [{ field, note }]),
    }));

  const handleRemoveNote = (id: string) =>
    updateReview(review => ({ ...review, guidance: review.guidance.filter(note => note.id !== id) }));

  const handleSubmit = form.handleSubmit(
    async values => {
      if (!word) return;

      if (editableTable) {
        const result = currentTableSchema().safeParse(table);
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

  const anchorPrefix = useId();
  const watchedValues = form.watch();
  const watchedWord = watchedValues.word;
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

  const aiReview: AIReviewContextValue | null = allowAIAutocomplete
    ? {
        anchorPrefix,
        review: watchedValues.ai_review ?? EMPTY_AI_REVIEW,
        draft: aiSnapshot,
        disabled: updating || isSubmitting || !!editingCell,
        acceptReply: handleAcceptReply,
        saveLabel,
        keep: handleKeep,
        removeNote: handleRemoveNote,
        learnedRules,
        assistant,
        chatKey,
        saved: word ?? {},
      }
    : null;

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
      <AIReviewContext.Provider value={aiReview}>
        <AIFilledFieldsContext.Provider value={aiFieldStatus}>
          <form
            onSubmit={handleSubmit}
            className="flex h-full min-h-0 flex-col overflow-hidden bg-white border-l border-gray-200">
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-serif font-semibold text-roman-red truncate">
                    {watchedWord || word.word}
                  </h2>
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

            {/* The AI assistant floats over the bottom of this area, outside the scroller. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* `relative` keeps the hidden native inputs Radix renders for form controls inside this scroller;
              without it they are positioned against the page and make the whole document scrollable. */}
              <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
                {/* Room below the last field, so it can always scroll above the assistant's input. */}
                <div className={cn('space-y-6', aiReview && 'pb-28')}>
                  <BaseWordForm />
                  {renderPosForm()}

                  {editableTable && (
                    <AIFieldReview field={editableTable.field}>
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
                    </AIFieldReview>
                  )}
                </div>
              </div>
              <AIAssistantDock />
            </div>
          </form>
        </AIFilledFieldsContext.Provider>
      </AIReviewContext.Provider>
    </FormProvider>
  );
};

/** A word switch discards local requests, proposals, and draft state together. */
export const WordEditPanel = (props: WordEditPanelProps) => <WordEditor key={props.word?.id ?? 'empty'} {...props} />;
