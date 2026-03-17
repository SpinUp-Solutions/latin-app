import React from 'react';
import { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { ExerciseFeedbackSection } from './ExerciseFeedbackSection';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { SentenceDiagramAuthor } from '@/src/features/sentence-diagramming';

export const SentenceDiagrammingEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(
    state => state.lessonEditor.editingContent?.content as SentenceDiagrammingExercise
  );

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const updateContent = (updates: Partial<SentenceDiagrammingExercise>) => {
    const updatedContent = { ...editingContent, ...updates };

    dispatch(updateEditingContent(updatedContent));
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
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
          placeholder="Enter instructions for students..."
          className="w-full h-24"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Solution Diagram</label>
        <SentenceDiagramAuthor
          document={editingContent.data}
          onChange={data =>
            dispatch(
              updateEditingContent({
                ...editingContent,
                data,
              })
            )
          }
        />
      </div>

      <AudioUploadSection
        contentItemId={editingContent.id}
        audioPath={editingContent.audioPath}
        onAudioPathChange={audioPath => updateContent({ audioPath })}
      />

      <ExerciseFeedbackSection
        feedbackConfig={editingContent.feedbackConfig}
        onChange={feedbackConfig => updateContent({ feedbackConfig })}
      />
    </div>
  );
};
