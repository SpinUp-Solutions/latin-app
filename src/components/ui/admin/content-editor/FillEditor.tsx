import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus } from 'lucide-react';
import { FillExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { SimpleInput, SimpleTextarea } from '@/src/components/ui/form-components';
import { FillItemCard } from '@/src/components/ui/form-components/FillItemCard';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';

export const FillEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as FillExercise);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<FillExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<FillExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const addItem = () => {
    const newItem = {
      text: '',
      answer: '',
      hint: '',
      explanation: '',
    };
    const newItems = [...editingContent.data.items, newItem];
    updateData({ items: newItems });
  };

  const updateItem = (index: number, field: keyof FillExercise['data']['items'][0], value: string) => {
    const newItems = editingContent.data.items.map((item, i) => (i === index ? { ...item, [field]: value } : item));
    updateData({ items: newItems });
  };

  const removeItem = (index: number) => {
    const newItems = editingContent.data.items.filter((_, i) => i !== index);
    updateData({ items: newItems });
  };

  return (
    <div className="space-y-6">
      {/* Basic Fields */}
      <div className="space-y-4">
        <SimpleInput
          label="Exercise Title"
          value={editingContent.title || ''}
          onChange={value => updateContent({ title: value })}
          placeholder="Enter exercise title..."
        />

        <SimpleTextarea
          label="Instructions"
          value={editingContent.instructions || ''}
          onChange={value => updateContent({ instructions: value })}
          placeholder="Provide instructions for students..."
          rows={3}
        />

        <AudioUploadSection
          audioPath={editingContent.audioPath}
          onAudioPathChange={audioPath => updateContent({ audioPath })}
          contentItemId={editingContent.id}
        />
      </div>

      {/* Fill Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium">Fill-in-Blank Items</label>
          <Button onClick={addItem} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>

        <div className="space-y-4">
          {editingContent.data.items.map((item, index) => (
            <FillItemCard
              key={index}
              item={item}
              index={index}
              onUpdate={(field, value) => updateItem(index, field, value)}
              onRemove={() => removeItem(index)}
              canRemove={editingContent.data.items.length > 1}
            />
          ))}

          {editingContent.data.items.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-sm">No fill-in-blank items yet</div>
              <div className="text-xs">Click &quot;Add Item&quot; to create your first question</div>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div>
        <label className="block text-sm font-medium mb-2">Exercise Summary</label>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm space-y-2">
              <div>
                <strong>Total Items:</strong> {editingContent.data.items.length}
              </div>
              <div>
                <strong>Items with hints:</strong>{' '}
                {editingContent.data.items.filter(item => item.hint && item.hint.trim() !== '').length}
              </div>
              <div>
                <strong>Items with explanations:</strong>{' '}
                {editingContent.data.items.filter(item => item.explanation && item.explanation.trim() !== '').length}
              </div>
              <div>
                <strong>Completed items:</strong>{' '}
                {editingContent.data.items.filter(item => item.text.trim() !== '' && item.answer.trim() !== '').length}
              </div>
              {editingContent.data.items.some(item => item.text.trim() === '' || item.answer.trim() === '') && (
                <div className="text-amber-600">⚠️ Some items are missing text or answers</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feedback Configuration */}
      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
        itemProgressionDelay={editingContent.itemProgressionDelay}
        onItemProgressionDelayChange={itemProgressionDelay => updateContent({ itemProgressionDelay })}
      />
    </div>
  );
};
