import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Plus } from 'lucide-react';
import { VocabularyContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { SimpleInput, SimpleSelect } from '@/src/components/ui/form-components';
import { VocabularyItemCard } from '@/src/components/ui/form-components/VocabularyItemCard';
import { AudioUploadSection } from './AudioUploadSection';

export const VocabularyEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lessonEditor.editingContent?.content as VocabularyContent);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<VocabularyContent>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const addVocabularyItem = () => {
    const newItem = {
      id: `vocab-${Date.now()}`,
      latin: '',
      english: '',
      pronunciation: '',
      partOfSpeech: '',
      example: '',
      notes: '',
    };

    updateContent({
      vocabularyItems: [...editingContent.vocabularyItems, newItem],
    });
  };

  const updateVocabularyItem = (index: number, field: string, value: string) => {
    const updatedItems = editingContent.vocabularyItems.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );

    updateContent({ vocabularyItems: updatedItems });
  };

  const removeVocabularyItem = (index: number) => {
    const updatedItems = editingContent.vocabularyItems.filter((_, i) => i !== index);
    updateContent({ vocabularyItems: updatedItems });
  };

  return (
    <div className="space-y-4">
      <SimpleInput
        label="Title"
        value={editingContent.title || ''}
        onChange={value => updateContent({ title: value })}
        placeholder="Enter vocabulary list title..."
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

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Vocabulary Items</label>
          <Button onClick={addVocabularyItem} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Word
          </Button>
        </div>

        <div className="space-y-4">
          {editingContent.vocabularyItems.map((item, index) => (
            <VocabularyItemCard
              key={item.id}
              item={item}
              index={index}
              onUpdate={(field, value) => updateVocabularyItem(index, field, value)}
              onRemove={() => removeVocabularyItem(index)}
              contentItemId={`${editingContent.id}-vocab-${item.id}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
