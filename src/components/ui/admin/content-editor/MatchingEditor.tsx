import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import { MatchingExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { SimpleRichDisplay } from '../../core/simple-rich-display';
import { RichTextSelect } from '../../core/rich-text-select';

export const MatchingEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lessonEditor.editingContent?.content as MatchingExercise);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<MatchingExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<MatchingExercise['data']>) => {
    updateContent({
      data: {
        ...editingContent.data,
        ...dataUpdates,
      },
    });
  };

  const generateId = (prefix: string) => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const addLeftItem = () => {
    const newItem = { id: generateId('left'), value: '' };
    const newLeftColumn = [...editingContent.data.leftColumn, newItem];
    updateData({ leftColumn: newLeftColumn });
  };

  const addRightItem = () => {
    const newItem = { id: generateId('right'), value: '' };
    const newRightColumn = [...editingContent.data.rightColumn, newItem];
    updateData({ rightColumn: newRightColumn });
  };

  const updateLeftItem = (index: number, value: string) => {
    const newLeftColumn = editingContent.data.leftColumn.map((item, i) => (i === index ? { ...item, value } : item));

    // Update answers mapping if needed - answers use IDs now
    const newAnswers = { ...editingContent.data.answers };

    updateData({ leftColumn: newLeftColumn, answers: newAnswers });
  };

  const updateRightItem = (index: number, value: string) => {
    const newRightColumn = editingContent.data.rightColumn.map((item, i) => (i === index ? { ...item, value } : item));

    updateData({ rightColumn: newRightColumn });
  };

  const removeLeftItem = (index: number) => {
    const itemToRemove = editingContent.data.leftColumn[index];
    const newLeftColumn = editingContent.data.leftColumn.filter((_, i) => i !== index);

    // Remove from answers mapping
    const newAnswers = { ...editingContent.data.answers };
    delete newAnswers[itemToRemove.id];

    updateData({ leftColumn: newLeftColumn, answers: newAnswers });
  };

  const removeRightItem = (index: number) => {
    const itemToRemove = editingContent.data.rightColumn[index];
    const newRightColumn = editingContent.data.rightColumn.filter((_, i) => i !== index);

    // Remove from answers mapping
    const newAnswers = { ...editingContent.data.answers };
    Object.keys(newAnswers).forEach(leftId => {
      if (newAnswers[leftId] === itemToRemove.id) {
        delete newAnswers[leftId];
      }
    });

    updateData({ rightColumn: newRightColumn, answers: newAnswers });
  };

  const updateAnswer = (leftId: string, rightId: string) => {
    const newAnswers = { ...editingContent.data.answers };
    if (rightId === '') {
      delete newAnswers[leftId];
    } else {
      newAnswers[leftId] = rightId;
    }
    updateData({ answers: newAnswers });
  };

  const getAvailableRightItems = () => {
    return [
      { id: '', value: '-- Select match --' },
      ...editingContent.data.rightColumn.filter(item => item.value.trim() !== ''),
    ];
  };

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

        <AudioUploadSection
          audioPath={editingContent.audioPath}
          onAudioPathChange={audioPath => updateContent({ audioPath })}
          contentItemId={editingContent.id}
        />
      </div>

      {/* Left Column */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium">Left Column Items</label>
          <Button onClick={addLeftItem} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>
        <div className="space-y-2">
          {editingContent.data.leftColumn.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2">
              <SimpleRichEditor
                content={item.value}
                onChange={value => updateLeftItem(index, value)}
                placeholder={`Left item ${index + 1}...`}
                singleLine={true}
                className="flex-1"
              />
              <Button
                onClick={() => removeLeftItem(index)}
                size="sm"
                variant="ghost"
                disabled={editingContent.data.leftColumn.length <= 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium">Right Column Items</label>
          <Button onClick={addRightItem} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>
        <div className="space-y-2">
          {editingContent.data.rightColumn.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2">
              <SimpleRichEditor
                content={item.value}
                onChange={value => updateRightItem(index, value)}
                placeholder={`Right item ${index + 1}...`}
                singleLine={true}
                className="flex-1"
              />
              <Button
                onClick={() => removeRightItem(index)}
                size="sm"
                variant="ghost"
                disabled={editingContent.data.rightColumn.length <= 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Hint */}
      <div>
        <label className="block text-sm font-medium mb-1">Hint (Optional)</label>
        <SimpleRichEditor
          content={editingContent.data.hint || ''}
          onChange={value => updateData({ hint: value })}
          placeholder="Provide a helpful hint when students make incorrect matches..."
          rows={2}
          className="w-full"
        />
        <p className="text-xs text-gray-500 mt-1">
          Shown when students make incorrect attempts (if enabled in feedback config)
        </p>
      </div>

      {/* Answer Mappings */}
      <div>
        <label className="block text-sm font-medium mb-3">Answer Mappings</label>
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {editingContent.data.leftColumn
                .filter(item => item.value.trim() !== '')
                .map(leftItem => (
                  <div key={leftItem.id} className="flex items-center gap-3">
                    <div className="flex-1 p-2 bg-gray-50 rounded border text-sm">
                      <SimpleRichDisplay content={leftItem.value} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <RichTextSelect
                      value={editingContent.data.answers[leftItem.id] || ''}
                      onChange={value => updateAnswer(leftItem.id, value)}
                      options={getAvailableRightItems()}
                      className="flex-1"
                      placeholder="-- Select match --"
                    />
                  </div>
                ))}
              {editingContent.data.leftColumn.filter(item => item.value.trim() !== '').length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">
                  Add items to the left column to create answer mappings
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feedback Configuration */}
      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
      />

      {/* Preview Summary */}
      <div>
        <label className="block text-sm font-medium mb-2">Preview</label>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm space-y-2">
              <div>
                <strong>Left items:</strong>{' '}
                {editingContent.data.leftColumn.filter(item => item.value.trim() !== '').length}
              </div>
              <div>
                <strong>Right items:</strong>{' '}
                {editingContent.data.rightColumn.filter(item => item.value.trim() !== '').length}
              </div>
              <div>
                <strong>Mapped answers:</strong> {Object.keys(editingContent.data.answers).length}
              </div>
              {Object.keys(editingContent.data.answers).length <
                editingContent.data.leftColumn.filter(item => item.value.trim() !== '').length && (
                <div className="text-amber-600">⚠️ Some left items don&apos;t have answer mappings</div>
              )}
              {editingContent.data.hint && <div className="text-green-600">✓ Has hint</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
