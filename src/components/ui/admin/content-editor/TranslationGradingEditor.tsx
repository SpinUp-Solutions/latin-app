import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { TranslationGradingExercise } from '@/src/types/exercises';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { SimpleInput, SimpleTextarea } from '@/src/components/ui/form-components';
import { Textarea } from '@/src/components/ui/textarea';
import { Label } from '@/src/components/ui/label';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';

export const TranslationGradingEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as TranslationGradingExercise
  );

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<TranslationGradingExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<TranslationGradingExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const addItem = () => {
    const newItem = { latinText: '', instructions: '' };
    const newItems = [...editingContent.data.items, newItem];
    updateData({ items: newItems });
  };

  const updateItem = (index: number, field: 'latinText' | 'instructions', value: string) => {
    const newItems = editingContent.data.items.map((item, i) => (i === index ? { ...item, [field]: value } : item));
    updateData({ items: newItems });
  };

  const removeItem = (index: number) => {
    const newItems = editingContent.data.items.filter((_, i) => i !== index);
    updateData({ items: newItems });
  };

  return (
    <div className="space-y-6">
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium">Latin Sentences</label>
          <Button onClick={addItem} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Sentence
          </Button>
        </div>

        <div className="space-y-4">
          {editingContent.data.items.map((item, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-3">
                    <div>
                      <Label htmlFor={`latin-sentence-${index}`}>{`Sentence ${index + 1}`}</Label>
                      <Textarea
                        id={`latin-sentence-${index}`}
                        value={item.latinText}
                        onChange={event => updateItem(index, 'latinText', event.target.value)}
                        placeholder="Enter Latin sentence..."
                        rows={2}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1 text-blue-700">Instructions (optional)</label>
                      <SimpleTextarea
                        label=""
                        value={item.instructions || ''}
                        onChange={value => updateItem(index, 'instructions', value)}
                        placeholder="Add context, grammar notes, or hints for this sentence..."
                        rows={2}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Displayed above the sentence to provide context or guidance
                      </p>
                    </div>
                  </div>
                  {editingContent.data.items.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeItem(index)} className="text-red-500 mt-6">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {editingContent.data.items.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-sm">No sentences yet</div>
              <div className="text-xs">Click &quot;Add Sentence&quot; to create your first item</div>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Exercise Summary</label>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm space-y-2">
              <div>
                <strong>Total Sentences:</strong> {editingContent.data.items.length}
              </div>
              <div>
                <strong>Completed:</strong>{' '}
                {editingContent.data.items.filter(item => item.latinText.trim() !== '').length}
              </div>
              <div>
                <strong>With Instructions:</strong>{' '}
                {editingContent.data.items.filter(item => item.instructions && item.instructions.trim() !== '').length}
              </div>
              {editingContent.data.items.some(item => item.latinText.trim() === '') && (
                <div className="text-amber-600">⚠️ Some sentences are empty</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
        itemProgressionDelay={editingContent.itemProgressionDelay}
        onItemProgressionDelayChange={itemProgressionDelay => updateContent({ itemProgressionDelay })}
      />
    </div>
  );
};
