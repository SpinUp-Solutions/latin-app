import React from 'react';
import { EmphasisContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import { AudioUploadSection } from './AudioUploadSection';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

export const EmphasisEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lessonEditor.editingContent?.content as EmphasisContent);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const handleChange = (updates: Partial<EmphasisContent>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <SimpleRichEditor
          content={editingContent.title || ''}
          onChange={value => handleChange({ title: value })}
          placeholder="Enter title..."
          singleLine={true}
          className="w-full"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Emphasized Content</label>
        <SimpleRichEditor
          content={editingContent.content}
          onChange={value => handleChange({ content: value })}
          placeholder="Enter emphasized content..."
          rows={4}
          className="w-full"
        />
      </div>
      <AudioUploadSection
        audioPath={editingContent.audioPath}
        onAudioPathChange={audioPath => handleChange({ audioPath })}
        contentItemId={editingContent.id}
      />
    </div>
  );
};
