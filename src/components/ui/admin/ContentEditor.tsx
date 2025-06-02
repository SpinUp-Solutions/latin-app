'use client';

import React from 'react';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { saveEditingContent, cancelEditing } from '@/src/store/slices/lessonSlice';

import { EditorModal } from './content-editor/EditorModal';
import { TextEditor } from './content-editor/TextEditor';
import { EmphasisEditor } from './content-editor/EmphasisEditor';
import { TableEditor } from './content-editor/TableEditor';
import { VocabularyEditor } from './content-editor/VocabularyEditor';

import { getEditorTitle } from '@/src/utils/editorRegistry';

export const ContentEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const { editingContent, isModalOpen } = useAppSelector(state => state.lesson);

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
      default:
        return (
          <div className="p-8 text-center text-gray-500">
            Editor not implemented for type: {editingContent.content.type}
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
