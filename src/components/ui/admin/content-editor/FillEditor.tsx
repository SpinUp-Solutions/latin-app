import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2, HelpCircle } from 'lucide-react';
import { FillExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';

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
        <div>
          <label className="block text-sm font-medium mb-1">Exercise Title</label>
          <input
            type="text"
            value={editingContent.title || ''}
            onChange={e => updateContent({ title: e.target.value })}
            className="w-full p-2 border rounded-md"
            placeholder="Enter exercise title..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Instructions</label>
          <textarea
            value={editingContent.instructions || ''}
            onChange={e => updateContent({ instructions: e.target.value })}
            className="w-full p-2 border rounded-md"
            rows={3}
            placeholder="Provide instructions for students..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Audio Path (optional)</label>
          <input
            type="text"
            value={editingContent.audioPath || ''}
            onChange={e => updateContent({ audioPath: e.target.value || null })}
            className="w-full p-2 border rounded-md"
            placeholder="/assets/audio/example.mp3"
          />
        </div>
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
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-medium">Item {index + 1}</h4>
                  <Button
                    onClick={() => removeItem(index)}
                    size="sm"
                    variant="ghost"
                    disabled={editingContent.data.items.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Question/Prompt Text</label>
                    <textarea
                      value={item.text}
                      onChange={e => updateItem(index, 'text', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={2}
                      placeholder="Enter the question or prompt that will be shown to students..."
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This is what students will see. For example: "Complete the Latin verb: audi___" or "Translate: I
                      hear = audi_"
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Correct Answer</label>
                    <input
                      type="text"
                      value={item.answer}
                      onChange={e => updateItem(index, 'answer', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Enter the correct answer..."
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Students must type this exact answer (case-insensitive)
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                      <HelpCircle className="h-3 w-3" />
                      Hint (optional)
                    </label>
                    <input
                      type="text"
                      value={item.hint || ''}
                      onChange={e => updateItem(index, 'hint', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Provide a helpful hint for students..."
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This will appear as placeholder text in the input field
                    </p>
                  </div>

                  {/* Preview */}
                  <div className="mt-3 p-3 bg-gray-50 rounded border">
                    <label className="block text-xs font-medium mb-2">Preview:</label>
                    <div className="text-sm">
                      <div className="mb-2">{item.text || 'Question/prompt will appear here'}</div>
                      <input
                        type="text"
                        placeholder={item.hint || 'Type your answer in Latin...'}
                        className="w-full p-2 border rounded text-sm bg-white"
                        disabled
                        value=""
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        Expected answer: <span className="font-mono">{item.answer || 'answer'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {editingContent.data.items.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-sm">No fill-in-blank items yet</div>
              <div className="text-xs">Click "Add Item" to create your first question</div>
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
    </div>
  );
};
