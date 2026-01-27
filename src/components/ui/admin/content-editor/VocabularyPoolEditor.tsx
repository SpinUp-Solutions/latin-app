import React from 'react';
import { VocabularyPoolContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { SimpleInput, SimpleSelect } from '@/src/components/ui/form-components';
import { AudioUploadSection } from './AudioUploadSection';

export const VocabularyPoolEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lessonEditor.editingContent?.content as VocabularyPoolContent);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<VocabularyPoolContent>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  return (
    <div className="space-y-4">
      <SimpleInput
        label="Title"
        value={editingContent.title || ''}
        onChange={value => updateContent({ title: value })}
        placeholder="Enter vocabulary pool title..."
      />

      <SimpleSelect
        label="Study Mode"
        value={editingContent.studyMode || 'flashcards'}
        onChange={value => updateContent({ studyMode: value as 'flashcards' | 'list' | 'quiz' })}
        options={[
          { value: 'flashcards', label: 'Flashcards' },
          { value: 'list', label: 'List' },
          { value: 'quiz', label: 'Quiz' },
        ]}
      />

      <AudioUploadSection
        audioPath={editingContent.audioPath}
        onAudioPathChange={audioPath => updateContent({ audioPath })}
        contentItemId={editingContent.id}
      />

      <p className="text-xs text-gray-500">This item uses the vocabulary pool selected in lesson settings.</p>
    </div>
  );
};
