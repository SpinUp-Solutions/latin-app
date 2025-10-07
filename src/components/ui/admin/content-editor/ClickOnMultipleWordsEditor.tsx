import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { MousePointerClick, RotateCcw, ToggleLeft, ToggleRight } from 'lucide-react';
import { ClickOnMultipleWordsExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { MultiClickableRichDisplay } from '../../core/multi-clickable-rich-display';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';

export const ClickOnMultipleWordsEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as ClickOnMultipleWordsExercise
  );

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<ClickOnMultipleWordsExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<ClickOnMultipleWordsExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const handleWordClick = (wordIndex: number) => {
    const currentIndices = new Set(editingContent.data.correctWordIndices);
    if (currentIndices.has(wordIndex)) {
      currentIndices.delete(wordIndex);
    } else {
      currentIndices.add(wordIndex);
    }
    updateData({ correctWordIndices: Array.from(currentIndices).sort((a, b) => a - b) });
  };

  const clearAllSelections = () => {
    updateData({ correctWordIndices: [] });
  };

  const toggleAllowOverSelection = () => {
    updateData({ allowOverSelection: !editingContent.data.allowOverSelection });
  };

  const getSelectedWords = () => {
    if (!editingContent.data.passage) return [];
    const words = stripHtmlTags(editingContent.data.passage)
      .split(/\s+/)
      .filter(w => w.trim());

    return editingContent.data.correctWordIndices
      .map(index => ({ index, word: words[index] || `Index ${index}` }))
      .filter(item => item.word !== `Index ${item.index}`);
  };

  return (
    <div className="space-y-6">
      {/* Basic Exercise Information */}
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

        <AudioUploadSection
          audioPath={editingContent.audioPath}
          onAudioPathChange={audioPath => updateContent({ audioPath })}
          contentItemId={editingContent.id}
        />
      </div>

      {/* Exercise Data */}
      <div>
        <label className="block text-sm font-medium mb-1">Exercise Data Title</label>
        <SimpleRichEditor
          content={editingContent.data.title || ''}
          onChange={value => updateData({ title: value })}
          className="w-full"
          placeholder="Enter data title..."
          singleLine={true}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Data Instructions (Optional)</label>
        <SimpleRichEditor
          content={editingContent.data.instructions || ''}
          onChange={value => updateData({ instructions: value })}
          placeholder="Additional instructions shown in the exercise..."
          rows={2}
          className="w-full"
        />
      </div>

      {/* Passage Editor */}
      <div>
        <label className="block text-sm font-medium mb-2">Text Passage</label>
        <SimpleRichEditor
          content={editingContent.data.passage || ''}
          onChange={value => updateData({ passage: value })}
          placeholder="Enter the text passage that students will analyze..."
          rows={4}
          className="w-full font-serif text-base"
        />
        <p className="text-xs text-gray-500 mt-1">Students will click on words in this passage</p>
      </div>

      {/* Word Selection Interface */}
      {editingContent.data.passage && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium flex items-center gap-1">
              <MousePointerClick className="h-4 w-4" />
              Select Target Words
            </label>
            <div className="flex gap-2">
              <Button
                onClick={clearAllSelections}
                variant="outline"
                size="sm"
                disabled={editingContent.data.correctWordIndices.length === 0}>
                <RotateCcw className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Click on words in the passage below to mark them as correct answers.
          </p>

          <div className="p-4 bg-gray-50 rounded border">
            <MultiClickableRichDisplay
              content={editingContent.data.passage}
              onWordClick={handleWordClick}
              selectedWordIndices={new Set(editingContent.data.correctWordIndices)}
              isSubmitted={false}
            />
          </div>

          {/* Selected Words Display */}
          {editingContent.data.correctWordIndices.length > 0 && (
            <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
              <div className="text-sm font-medium mb-2">
                Selected Words ({editingContent.data.correctWordIndices.length}):
              </div>
              <div className="flex flex-wrap gap-2">
                {getSelectedWords().map(({ index, word }) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded cursor-pointer hover:bg-blue-200"
                    onClick={() => handleWordClick(index)}
                    title={`Click to deselect word at index ${index}`}>
                    {word} <span className="ml-1 text-blue-600">#{index}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Options */}
      <div>
        <label className="block text-sm font-medium mb-3">Exercise Options</label>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div>
              <div className="font-medium text-sm">Allow Over-Selection</div>
              <div className="text-xs text-gray-600">
                If enabled, students can select extra words with score penalty. If disabled, any extra selection fails
                the exercise.
              </div>
            </div>
            <Button onClick={toggleAllowOverSelection} variant="ghost" size="sm" className="p-1">
              {editingContent.data.allowOverSelection ? (
                <ToggleRight className="h-6 w-6 text-green-600" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-gray-400" />
              )}
            </Button>
          </div>

          {editingContent.data.allowOverSelection && (
            <div>
              <label className="block text-xs font-medium mb-1">Minimum Correct Selections</label>
              <input
                type="number"
                min="1"
                max={editingContent.data.correctWordIndices.length}
                value={editingContent.data.minimumCorrect || editingContent.data.correctWordIndices.length}
                onChange={e => {
                  const value = parseInt(e.target.value);
                  updateData({
                    minimumCorrect: isNaN(value)
                      ? undefined
                      : Math.max(1, Math.min(value, editingContent.data.correctWordIndices.length)),
                  });
                }}
                className="w-20 p-2 border rounded text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum words students must select correctly (default: all)</p>
            </div>
          )}
        </div>
      </div>

      {/* Exercise Metadata */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Exercise Hint (Optional)</label>
          <SimpleRichEditor
            content={editingContent.data.hint || ''}
            onChange={value => updateData({ hint: value })}
            placeholder="Optional hint shown when students make mistakes..."
            rows={2}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Explanation (Optional)</label>
          <SimpleRichEditor
            content={editingContent.data.explanation || ''}
            onChange={value => updateData({ explanation: value })}
            placeholder="Optional explanation shown after correct completion..."
            rows={3}
            className="w-full"
          />
        </div>
      </div>

      {/* Exercise Summary */}
      <div>
        <label className="block text-sm font-medium mb-2">Exercise Summary</label>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm space-y-2">
              <div>
                <strong>Passage Length:</strong>{' '}
                {editingContent.data.passage
                  ? `${
                      stripHtmlTags(editingContent.data.passage)
                        .split(/\s+/)
                        .filter(w => w.trim()).length
                    } words`
                  : '0 words'}
              </div>
              <div>
                <strong>Target Words:</strong> {editingContent.data.correctWordIndices.length}
              </div>
              <div>
                <strong>Selection Mode:</strong>{' '}
                {editingContent.data.allowOverSelection
                  ? 'Lenient (over-selection allowed)'
                  : 'Strict (exact match required)'}
              </div>
              {editingContent.data.allowOverSelection && (
                <div>
                  <strong>Minimum Required:</strong>{' '}
                  {editingContent.data.minimumCorrect || editingContent.data.correctWordIndices.length}
                </div>
              )}
              <div>
                <strong>Has Hint:</strong> {editingContent.data.hint ? 'Yes' : 'No'}
              </div>
              <div>
                <strong>Has Explanation:</strong> {editingContent.data.explanation ? 'Yes' : 'No'}
              </div>
              {!editingContent.data.passage && <div className="text-amber-600">⚠️ No passage text provided</div>}
              {editingContent.data.correctWordIndices.length === 0 && (
                <div className="text-amber-600">⚠️ No target words selected</div>
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
