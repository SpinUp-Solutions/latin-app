import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { MultipleChoiceExercise } from '@/src/types/exercise';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { SimpleRichDisplay } from '../../core/simple-rich-display';
import { cn } from '@/src/lib/utils';

export const MultipleChoiceEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as MultipleChoiceExercise);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<MultipleChoiceExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<MultipleChoiceExercise['data']>) => {
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

  const addOption = () => {
    const newOption = {
      id: generateId('option'),
      text: '',
      isCorrect: false,
    };
    const newOptions = [...editingContent.data.options, newOption];
    updateData({ options: newOptions });
  };

  const updateOption = (index: number, field: keyof MultipleChoiceExercise['data']['options'][0], value: string | boolean) => {
    const newOptions = editingContent.data.options.map((option, i) => {
      if (i === index) {
        // If setting this option as correct, unset all others
        if (field === 'isCorrect' && value === true) {
          return { ...option, [field]: value };
        }
        return { ...option, [field]: value };
      } else if (field === 'isCorrect' && value === true) {
        // Unset other correct options when setting one as correct
        return { ...option, isCorrect: false };
      }
      return option;
    });
    updateData({ options: newOptions });
  };

  const removeOption = (index: number) => {
    const newOptions = editingContent.data.options.filter((_, i) => i !== index);
    updateData({ options: newOptions });
  };

  const getCorrectOptionCount = () => {
    return editingContent.data.options.filter(option => option.isCorrect).length;
  };

  const getFilledOptionCount = () => {
    return editingContent.data.options.filter(option => option.text.trim() !== '').length;
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

      {/* Question */}
      <div>
        <label className="block text-sm font-medium mb-1">Question</label>
        <SimpleRichEditor
          content={editingContent.data.question || ''}
          onChange={value => updateData({ question: value })}
          placeholder="Enter the question..."
          rows={3}
          className="w-full"
        />
      </div>

      {/* Options */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium">Answer Options</label>
          <Button onClick={addOption} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Add Option
          </Button>
        </div>

        <div className="space-y-3">
          {editingContent.data.options.map((option, index) => (
            <Card key={option.id} className={cn(
              'transition-all duration-200',
              option.isCorrect && 'ring-2 ring-green-200 bg-green-50'
            )}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Option Letter */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium mt-1">
                    {String.fromCharCode(65 + index)}
                  </div>
                  
                  {/* Option Text */}
                  <div className="flex-1">
                    <SimpleRichEditor
                      content={option.text}
                      onChange={value => updateOption(index, 'text', value)}
                      placeholder={`Option ${String.fromCharCode(65 + index)} text...`}
                      rows={2}
                      className="w-full"
                    />
                  </div>

                  {/* Correct Toggle */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => updateOption(index, 'isCorrect', !option.isCorrect)}
                      size="sm"
                      variant={option.isCorrect ? 'default' : 'outline'}
                      className={cn(
                        'min-w-[80px]',
                        option.isCorrect && 'bg-green-600 hover:bg-green-700'
                      )}
                    >
                      {option.isCorrect ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Correct
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-1" />
                          Incorrect
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={() => removeOption(index)}
                      size="sm"
                      variant="ghost"
                      disabled={editingContent.data.options.length <= 2}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {editingContent.data.options.length < 2 && (
          <div className="text-center py-6 text-amber-600 bg-amber-50 rounded-lg">
            <div className="text-sm font-medium">⚠️ Add at least 2 options</div>
            <div className="text-xs">Multiple choice questions need at least 2 options to choose from</div>
          </div>
        )}
      </div>

      {/* Explanation */}
      <div>
        <label className="block text-sm font-medium mb-1">Explanation (Optional)</label>
        <SimpleRichEditor
          content={editingContent.data.explanation || ''}
          onChange={value => updateData({ explanation: value })}
          placeholder="Provide an explanation shown after the correct answer..."
          rows={3}
          className="w-full"
        />
      </div>

      {/* Preview Summary */}
      <div>
        <label className="block text-sm font-medium mb-2">Preview</label>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm space-y-2">
              <div>
                <strong>Total Options:</strong> {editingContent.data.options.length}
              </div>
              <div>
                <strong>Filled Options:</strong> {getFilledOptionCount()}
              </div>
              <div>
                <strong>Correct Options:</strong> {getCorrectOptionCount()}
              </div>
              {getCorrectOptionCount() === 0 && (
                <div className="text-red-600">❌ No correct answer selected</div>
              )}
              {getCorrectOptionCount() > 1 && (
                <div className="text-amber-600">⚠️ Multiple correct answers selected (only one should be correct)</div>
              )}
              {editingContent.data.options.length < 2 && (
                <div className="text-amber-600">⚠️ Need at least 2 options</div>
              )}
              {editingContent.data.options.some(option => option.text.trim() === '') && (
                <div className="text-amber-600">⚠️ Some options are missing text</div>
              )}
              {editingContent.data.question.trim() === '' && (
                <div className="text-amber-600">⚠️ Question is empty</div>
              )}
              {editingContent.data.explanation && (
                <div className="text-green-600">✓ Has explanation</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Question Preview */}
      {editingContent.data.question.trim() !== '' && (
        <div>
          <label className="block text-sm font-medium mb-2">Question Preview</label>
          <Card>
            <CardContent className="p-4">
              <div className="mb-4">
                <SimpleRichDisplay content={editingContent.data.question} />
              </div>
              <div className="space-y-2">
                {editingContent.data.options
                  .filter(option => option.text.trim() !== '')
                  .map((option, index) => (
                    <div key={option.id} className={cn(
                      'p-3 rounded border flex items-center gap-3',
                      option.isCorrect 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-gray-50 border-gray-200'
                    )}>
                      <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center text-sm">
                        {String.fromCharCode(65 + index)}
                      </div>
                      <SimpleRichDisplay content={option.text} />
                      {option.isCorrect && (
                        <Check className="h-4 w-4 text-green-600 ml-auto" />
                      )}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Feedback Configuration */}
      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
      />
    </div>
  );
};