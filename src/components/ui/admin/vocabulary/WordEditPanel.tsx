import React, { useEffect, useMemo, useState } from 'react';
import { useForm, FormProvider, Path, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/src/components/ui/button';
import {
  VocabularyWord,
  VocabularyWordWithId,
  Noun,
  Verb,
  Adjective,
  Pronoun,
} from '@/src/types/vocabulary/vocabulary-new';
import { EditingCell } from '@/src/types/admin-vocabulary';
import { parseEditingCellValue, TABLE_TYPES, TableType } from '@/src/utils/vocabUtils';
import { DeclensionTable } from './tables/DeclensionTable';
import { AdjectiveDeclensionTable } from './tables/AdjectiveDeclensionTable';
import { ConjugationTable } from './tables/ConjugationTable';
import { BookOpen } from 'lucide-react';
import {
  BaseWordForm,
  NounForm,
  PronounForm,
  AdjectiveForm,
  VerbForm,
  IndeclinableForm,
  VocabularyFormValues,
} from './forms';
import {
  getFormSchemaForPartOfSpeech,
  toFormDefaultValues,
  applyFormValuesToWord,
} from '@/src/types/vocabulary/form-schemas/builder';
import type { BaseWordFormValues } from '@/src/types/vocabulary/form-schemas/base';

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

export const WordEditPanel: React.FC<WordEditPanelProps> = ({ word, onSave, updating }) => {
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

  useEffect(() => {
    if (word) {
      form.reset(toFormDefaultValues(word));
      setExpandedEditTables(
        new Set([TABLE_TYPES.DECLENSION, TABLE_TYPES.ADJECTIVE_DECLENSION, TABLE_TYPES.CONJUGATION])
      );
    } else {
      form.reset(EMPTY_FORM_VALUES as VocabularyFormValues);
    }
    setEditingCell(null);
    setEditingCellValue('');
  }, [word, form]);

  const buildFieldPath = (tableType: TableType, cellKey: string): Path<VocabularyFormValues> | null => {
    if (tableType === TABLE_TYPES.DECLENSION) {
      return `declension_table.${cellKey}` as Path<VocabularyFormValues>;
    }
    if (tableType === TABLE_TYPES.ADJECTIVE_DECLENSION) {
      return `adjective_declension_table.${cellKey}` as Path<VocabularyFormValues>;
    }
    if (tableType === TABLE_TYPES.CONJUGATION) {
      return `conjugation_table.${cellKey}` as Path<VocabularyFormValues>;
    }
    return null;
  };

  const handleCellDoubleClick = (rowIndex: number, cellKey: string, tableType: string, displayValue: string) => {
    const fieldPath = buildFieldPath(tableType as TableType, cellKey);
    const value = fieldPath ? form.getValues(fieldPath) : undefined;
    const normalized = Array.isArray(value) ? value.join(', ') : displayValue === '—' ? '' : displayValue;
    setEditingCell({ rowIndex, cellKey, tableType });
    setEditingCellValue(normalized);
  };

  const handleCellEditSave = () => {
    if (!editingCell) return;
    const { cellKey, tableType } = editingCell;
    const newValue = parseEditingCellValue(editingCellValue);
    const fieldPath = buildFieldPath(tableType as TableType, cellKey);
    if (fieldPath) {
      form.setValue(fieldPath, newValue, { shouldDirty: true, shouldTouch: true });
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

  const handleSubmit = form.handleSubmit(async values => {
    if (!word) return;
    const updatedWord = applyFormValuesToWord(word, values);
    const { id: discardedId, ...payload } = updatedWord;
    void discardedId;
    const success = await onSave(payload);
    if (success) {
      form.reset(toFormDefaultValues(updatedWord));
      setEditingCell(null);
      setEditingCellValue('');
    }
  });

  const watchedWord = form.watch('word');
  const nounDeclension = form.watch('declension_table');
  const adjectiveDeclension = form.watch('adjective_declension_table');
  const conjugationTable = form.watch('conjugation_table');

  const nounOrPronounWord = useMemo(() => {
    if (!word) return null;
    if (word.part_of_speech === 'noun' || word.part_of_speech === 'pronoun') {
      return {
        ...word,
        declension_table: nounDeclension ?? {},
      } as (Noun | Pronoun) & { id: string };
    }
    return null;
  }, [word, nounDeclension]);

  const adjectiveWord = useMemo(() => {
    if (!word) return null;
    if (word.part_of_speech === 'adjective') {
      return {
        ...word,
        adjective_declension_table: adjectiveDeclension ?? {},
      } as Adjective & { id: string };
    }
    return null;
  }, [word, adjectiveDeclension]);

  const verbWord = useMemo(() => {
    if (!word) return null;
    if (word.part_of_speech === 'verb') {
      return {
        ...word,
        conjugation_table: conjugationTable ?? {},
      } as Verb & { id: string };
    }
    return null;
  }, [word, conjugationTable]);

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
      case 'adverb':
      case 'preposition':
      case 'conjunction':
      case 'interjection':
        return <IndeclinableForm />;
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
      <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden bg-white border-l border-gray-200">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-serif font-semibold text-roman-red truncate">{watchedWord || word.word}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{word.part_of_speech}</p>
          </div>
          <Button type="submit" disabled={updating || isSubmitting} className="ml-4">
            {updating || isSubmitting ? 'Saving...' : 'Apply'}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
            <BaseWordForm />
            {renderPosForm()}

            {nounOrPronounWord && (
              <DeclensionTable
                word={nounOrPronounWord}
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

            {adjectiveWord && (
              <AdjectiveDeclensionTable
                word={adjectiveWord}
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

            {verbWord && (
              <ConjugationTable
                word={verbWord}
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
      </form>
    </FormProvider>
  );
};
