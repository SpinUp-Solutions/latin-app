import React from 'react';
import { ListeningPassageExercise } from '@/src/types/exercises/listening-passage';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

export const ListeningPassageEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as ListeningPassageExercise
  );

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<ListeningPassageExercise>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const updateData = (dataUpdates: Partial<ListeningPassageExercise['data']>) => {
    dispatch(
      updateEditingContent({
        ...editingContent,
        data: { ...editingContent.data, ...dataUpdates },
      })
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <SimpleRichEditor
          content={editingContent.title || ''}
          onChange={value => updateContent({ title: value })}
          placeholder="Enter passage title..."
          singleLine={true}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Instructions</label>
        <SimpleRichEditor
          content={editingContent.instructions || ''}
          onChange={value => updateContent({ instructions: value })}
          placeholder="Enter instructions for students..."
          className="w-full h-24"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Latin Text</label>
        <SimpleRichEditor
          content={editingContent.data.latinText}
          onChange={value => updateData({ latinText: value })}
          placeholder="Enter the Latin passage text..."
          className="w-full h-32"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">English Translation</label>
        <SimpleRichEditor
          content={editingContent.data.translation}
          onChange={value => updateData({ translation: value })}
          placeholder="Enter the English translation..."
          className="w-full h-32"
        />
      </div>

      <AudioUploadSection
        contentItemId={editingContent.id}
        audioPath={editingContent.data.passageAudioPath}
        onAudioPathChange={audioPath => updateData({ passageAudioPath: audioPath })}
      />

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
      />
    </div>
  );
};
