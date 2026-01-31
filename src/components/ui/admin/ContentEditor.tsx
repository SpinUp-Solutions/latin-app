'use client';

import React from 'react';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { saveEditingContent, cancelEditing } from '@/src/store/slices/lessonEditorSlice';

import { EditorModal } from './content-editor/EditorModal';
import { TextEditor } from './content-editor/TextEditor';
import { EmphasisEditor } from './content-editor/EmphasisEditor';
import { TableEditor } from './content-editor/TableEditor';
import { VocabularyEditor } from './content-editor/VocabularyEditor';
import { VocabularyPoolEditor } from './content-editor/VocabularyPoolEditor';
import { MatchingEditor } from './content-editor/MatchingEditor';
import { FillEditor } from './content-editor/FillEditor';
import { TextSelectionEditor } from './content-editor/TextSelectionEditor';
import { FillEmboldedTextEditor } from './content-editor/FillEmboldedTextEditor';
import { SentenceDiagrammingEditor } from './content-editor/SentenceDiagrammingEditor';
import { MultipleChoiceEditor } from './content-editor/MultipleChoiceEditor';
import { OddOneOutEditor } from './content-editor/OddOneOutEditor';
import { TableFillEditor } from './content-editor/TableFillEditor';
import { ClickOnMultipleWordsEditor } from './content-editor/ClickOnMultipleWordsEditor';
import { GeneratedTranslationEditor } from './content-editor/GeneratedTranslationEditor';
import { GeneratedFormIdentificationEditor } from './content-editor/GeneratedFormIdentificationEditor';
import { TranslationGradingEditor } from './content-editor/TranslationGradingEditor';

import { getEditorTitle } from '@/src/utils/editorRegistry';

export const ContentEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const { editingContent, isModalOpen } = useAppSelector(state => state.lessonEditor);

  if (!isModalOpen || !editingContent) {
    return null;
  }

  const handleSave = () => {
    dispatch(saveEditingContent());
  };

  const handleClose = () => {
    dispatch(cancelEditing());
  };

  const renderEditor = () => {
    switch (editingContent.content.type) {
      case 'text':
        return <TextEditor />;
      case 'emphasis':
        return <EmphasisEditor />;
      case 'table':
        return <TableEditor />;
      case 'vocabulary':
        return <VocabularyEditor />;
      case 'vocabulary-pool':
        return <VocabularyPoolEditor />;
      case 'matching':
        return <MatchingEditor />;
      case 'fill':
        return <FillEditor />;
      case 'text-selection':
        return <TextSelectionEditor />;
      case 'fill-embolded-text':
        return <FillEmboldedTextEditor />;
      case 'sentence-diagramming':
        return <SentenceDiagrammingEditor />;
      case 'multiple-choice':
        return <MultipleChoiceEditor />;
      case 'odd-one-out':
        return <OddOneOutEditor />;
      case 'table-fill':
        return <TableFillEditor />;
      case 'click-on-multiple-words':
        return <ClickOnMultipleWordsEditor />;
      case 'generated-translation':
        return <GeneratedTranslationEditor />;
      case 'generated-form-identification':
        return <GeneratedFormIdentificationEditor />;
      case 'translation-grading':
        return <TranslationGradingEditor />;
      default:
        return (
          <div className="p-8 text-center text-gray-500">
            Editor not implemented for type: {(editingContent.content as { type: string }).type}
          </div>
        );
    }
  };

  return (
    <EditorModal title={getEditorTitle(editingContent.content.type)} onClose={handleClose} onSave={handleSave}>
      {renderEditor()}
    </EditorModal>
  );
};
