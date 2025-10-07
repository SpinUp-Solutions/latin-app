import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { OddOneOutExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { SimpleRichDisplay } from '../../core/simple-rich-display';

export const OddOneOutEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lessonEditor.editingContent?.content as OddOneOutExercise);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<OddOneOutExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<OddOneOutExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const addItem = () => {
    const newItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: 'New item',
      isOddOneOut: false,
    };

    updateData({
      items: [...editingContent.data.items, newItem],
    });
  };

  const updateItem = (itemId: string, updates: { text?: string; isOddOneOut?: boolean }) => {
    const updatedItems = editingContent.data.items.map(item => (item.id === itemId ? { ...item, ...updates } : item));

    updateData({ items: updatedItems });
  };

  const deleteItem = (itemId: string) => {
    const updatedItems = editingContent.data.items.filter(item => item.id !== itemId);
    updateData({ items: updatedItems });
  };

  const setAsOddOneOut = (itemId: string) => {
    const updatedItems = editingContent.data.items.map(item => ({
      ...item,
      isOddOneOut: item.id === itemId,
    }));

    updateData({ items: updatedItems });
  };

  const oddOneOutItem = editingContent.data.items.find(item => item.isOddOneOut);

  return (
    <div className="space-y-6">
      {/* Basic Fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Exercise Title</label>
          <SimpleRichEditor
            content={editingContent.title || ''}
            onChange={value => updateContent({ title: value })}
            placeholder="Enter exercise title..."
            singleLine={true}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Instructions</label>
          <SimpleRichEditor
            content={editingContent.instructions || ''}
            onChange={value => updateContent({ instructions: value })}
            placeholder="Provide instructions for students..."
            rows={3}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Question</label>
          <SimpleRichEditor
            content={editingContent.data.question || ''}
            onChange={value => updateData({ question: value })}
            placeholder="Which of these items doesn't belong?"
            singleLine={true}
            className="w-full"
          />
        </div>

        {/* Audio Upload */}
        <AudioUploadSection
          audioPath={editingContent.audioPath}
          onAudioPathChange={audioPath => updateContent({ audioPath })}
          contentItemId={editingContent.id}
        />
      </div>

      {/* Items Section */}
      <Card>
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-medium">Items</h4>
            <Button onClick={addItem} size="sm" className="bg-roman-terracotta hover:bg-roman-terracotta/90">
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </Button>
          </div>

          {editingContent.data.items.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No items yet. Add items to create your odd one out exercise.
            </p>
          ) : (
            <div className="space-y-3">
              {editingContent.data.items.map((item, index) => (
                <div
                  key={item.id}
                  className={`p-4 border rounded-lg ${
                    item.isOddOneOut ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                  }`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-600">Item {index + 1}</span>
                        {item.isOddOneOut && (
                          <div className="flex items-center gap-1 text-green-600 text-sm">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="font-medium">Odd One Out</span>
                          </div>
                        )}
                      </div>

                      <SimpleRichEditor
                        content={item.text}
                        onChange={value => updateItem(item.id, { text: value })}
                        placeholder={`Enter text for item ${index + 1}...`}
                        singleLine={true}
                        className="w-full mb-3"
                      />

                      <div className="flex gap-2">
                        <Button
                          onClick={() => setAsOddOneOut(item.id)}
                          size="sm"
                          variant={item.isOddOneOut ? 'default' : 'outline'}
                          className={
                            item.isOddOneOut
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'border-green-600 text-green-600 hover:bg-green-50'
                          }>
                          {item.isOddOneOut ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Is Odd One Out
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 mr-1" />
                              Set as Odd One Out
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    <Button
                      onClick={() => deleteItem(item.id)}
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Validation Warning */}
          {editingContent.data.items.length > 0 && !oddOneOutItem && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-800">
                <XCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Please select which item is the odd one out.</span>
              </div>
            </div>
          )}

          {editingContent.data.items.length < 3 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-blue-800 text-sm">
                <strong>Tip:</strong> Add at least 3-4 items for a good odd one out exercise.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exercise Options */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-lg font-medium mb-4">Exercise Options</h4>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Hint (Optional)</label>
              <SimpleRichEditor
                content={editingContent.data.hint || ''}
                onChange={value => updateData({ hint: value })}
                placeholder="Provide a helpful hint when students make mistakes..."
                rows={2}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Shown when students make incorrect attempts (if enabled in feedback config)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Explanation (Optional)</label>
              <SimpleRichEditor
                content={editingContent.data.explanation || ''}
                onChange={value => updateData({ explanation: value })}
                placeholder="Explain why the correct item doesn't belong..."
                rows={3}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                This explanation will be shown to students after they submit their answer.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requireExplanation"
                checked={editingContent.data.requireExplanation || false}
                onChange={e => updateData({ requireExplanation: e.target.checked })}
                className="rounded border-gray-300"
              />
              <label htmlFor="requireExplanation" className="text-sm font-medium">
                Require student explanation
              </label>
            </div>
            <p className="text-xs text-gray-500 ml-6">
              If enabled, students must provide their own explanation for their choice.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {editingContent.data.items.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-lg font-medium mb-4">Preview</h4>
            <div className="p-4 bg-gray-50 rounded-lg">
              {editingContent.data.question && (
                <div className="mb-4">
                  <SimpleRichDisplay content={editingContent.data.question} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {editingContent.data.items.map(item => (
                  <div
                    key={item.id}
                    className={`p-3 rounded border-2 ${
                      item.isOddOneOut ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                    }`}>
                    <SimpleRichDisplay content={item.text} />
                    {item.isOddOneOut && <div className="mt-2 text-xs text-green-600 font-medium">✓ Odd One Out</div>}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback Configuration */}
      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
      />
    </div>
  );
};
