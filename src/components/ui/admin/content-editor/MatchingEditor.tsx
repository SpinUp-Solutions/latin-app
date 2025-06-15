import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import { MatchingExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';

export const MatchingEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as MatchingExercise);

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

  const addLeftItem = () => {
    const newLeftColumn = [...editingContent.data.leftColumn, ''];
    updateData({ leftColumn: newLeftColumn });
  };

  const addRightItem = () => {
    const newRightColumn = [...editingContent.data.rightColumn, ''];
    updateData({ rightColumn: newRightColumn });
  };

  const updateLeftItem = (index: number, value: string) => {
    const oldValue = editingContent.data.leftColumn[index];
    const newLeftColumn = editingContent.data.leftColumn.map((item, i) => (i === index ? value : item));

    // Update answers mapping if the left item changed
    const newAnswers = { ...editingContent.data.answers };
    if (oldValue && oldValue !== value) {
      if (newAnswers[oldValue]) {
        newAnswers[value] = newAnswers[oldValue];
        delete newAnswers[oldValue];
      }
    }

    updateData({ leftColumn: newLeftColumn, answers: newAnswers });
  };

  const updateRightItem = (index: number, value: string) => {
    const oldValue = editingContent.data.rightColumn[index];
    const newRightColumn = editingContent.data.rightColumn.map((item, i) => (i === index ? value : item));

    // Update answers mapping if the right item changed
    const newAnswers = { ...editingContent.data.answers };
    if (oldValue && oldValue !== value) {
      Object.keys(newAnswers).forEach(leftKey => {
        if (newAnswers[leftKey] === oldValue) {
          newAnswers[leftKey] = value;
        }
      });
    }

    updateData({ rightColumn: newRightColumn, answers: newAnswers });
  };

  const removeLeftItem = (index: number) => {
    const itemToRemove = editingContent.data.leftColumn[index];
    const newLeftColumn = editingContent.data.leftColumn.filter((_, i) => i !== index);

    // Remove from answers mapping
    const newAnswers = { ...editingContent.data.answers };
    delete newAnswers[itemToRemove];

    updateData({ leftColumn: newLeftColumn, answers: newAnswers });
  };

  const removeRightItem = (index: number) => {
    const itemToRemove = editingContent.data.rightColumn[index];
    const newRightColumn = editingContent.data.rightColumn.filter((_, i) => i !== index);

    // Remove from answers mapping
    const newAnswers = { ...editingContent.data.answers };
    Object.keys(newAnswers).forEach(leftKey => {
      if (newAnswers[leftKey] === itemToRemove) {
        delete newAnswers[leftKey];
      }
    });

    updateData({ rightColumn: newRightColumn, answers: newAnswers });
  };

  const updateAnswer = (leftItem: string, rightItem: string) => {
    const newAnswers = { ...editingContent.data.answers };
    if (rightItem === '') {
      delete newAnswers[leftItem];
    } else {
      newAnswers[leftItem] = rightItem;
    }
    updateData({ answers: newAnswers });
  };

  const getAvailableRightItems = () => {
    return ['', ...editingContent.data.rightColumn.filter(item => item.trim() !== '')];
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
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={item}
                onChange={e => updateLeftItem(index, e.target.value)}
                className="flex-1 p-2 border rounded-md text-sm"
                placeholder={`Left item ${index + 1}...`}
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
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={item}
                onChange={e => updateRightItem(index, e.target.value)}
                className="flex-1 p-2 border rounded-md text-sm"
                placeholder={`Right item ${index + 1}...`}
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

      {/* Answer Mappings */}
      <div>
        <label className="block text-sm font-medium mb-3">Answer Mappings</label>
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {editingContent.data.leftColumn
                .filter(item => item.trim() !== '')
                .map((leftItem, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex-1 p-2 bg-gray-50 rounded border text-sm">{leftItem}</div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <select
                      value={editingContent.data.answers[leftItem] || ''}
                      onChange={e => updateAnswer(leftItem, e.target.value)}
                      className="flex-1 p-2 border rounded-md text-sm">
                      {getAvailableRightItems().map((rightItem, rightIndex) => (
                        <option key={rightIndex} value={rightItem}>
                          {rightItem === '' ? '-- Select match --' : rightItem}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              {editingContent.data.leftColumn.filter(item => item.trim() !== '').length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">
                  Add items to the left column to create answer mappings
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Summary */}
      <div>
        <label className="block text-sm font-medium mb-2">Preview</label>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm space-y-2">
              <div>
                <strong>Left items:</strong> {editingContent.data.leftColumn.filter(item => item.trim() !== '').length}
              </div>
              <div>
                <strong>Right items:</strong>{' '}
                {editingContent.data.rightColumn.filter(item => item.trim() !== '').length}
              </div>
              <div>
                <strong>Mapped answers:</strong> {Object.keys(editingContent.data.answers).length}
              </div>
              {Object.keys(editingContent.data.answers).length <
                editingContent.data.leftColumn.filter(item => item.trim() !== '').length && (
                <div className="text-amber-600">⚠️ Some left items don't have answer mappings</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
