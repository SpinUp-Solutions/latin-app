import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { VocabularyContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { AudioUploadSection } from './AudioUploadSection';

export const VocabularyEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as VocabularyContent);

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
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={editingContent.title || ''}
          onChange={e => updateContent({ title: e.target.value })}
          className="w-full p-2 border rounded-md"
          placeholder="Enter vocabulary list title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Study Mode</label>
        <select
          value={editingContent.studyMode || 'flashcards'}
          onChange={e => updateContent({ studyMode: e.target.value as 'flashcards' | 'list' | 'quiz' })}
          className="w-full p-2 border rounded-md">
          <option value="flashcards">Flashcards</option>
          <option value="list">List</option>
          <option value="quiz">Quiz</option>
        </select>
      </div>

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
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium">Word {index + 1}</h4>
                  <Button onClick={() => removeVocabularyItem(index)} size="sm" variant="ghost">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Latin</label>
                    <input
                      type="text"
                      value={item.latin}
                      onChange={e => updateVocabularyItem(index, 'latin', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Latin word..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">English</label>
                    <input
                      type="text"
                      value={item.english}
                      onChange={e => updateVocabularyItem(index, 'english', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="English translation..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Pronunciation</label>
                    <input
                      type="text"
                      value={item.pronunciation || ''}
                      onChange={e => updateVocabularyItem(index, 'pronunciation', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Pronunciation..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Part of Speech</label>
                    <input
                      type="text"
                      value={item.partOfSpeech || ''}
                      onChange={e => updateVocabularyItem(index, 'partOfSpeech', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="noun, verb, etc..."
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Example</label>
                    <input
                      type="text"
                      value={item.example || ''}
                      onChange={e => updateVocabularyItem(index, 'example', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Example sentence..."
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Notes</label>
                    <textarea
                      value={item.notes || ''}
                      onChange={e => updateVocabularyItem(index, 'notes', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={2}
                      placeholder="Additional notes..."
                    />
                  </div>
                  <div className="col-span-2">
                    <AudioUploadSection
                      audioPath={item.audioPath}
                      onAudioPathChange={audioPath => updateVocabularyItem(index, 'audioPath', audioPath || '')}
                      contentItemId={`${editingContent.id}-vocab-${item.id}`}
                      className="mt-2"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
