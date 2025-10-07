import React from 'react';
import { TextContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonEditorSlice';
import RichTextEditor from '../../core/rich-text-editor';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { AudioUploadSection } from './AudioUploadSection';

export const TextEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lessonEditor.editingContent?.content as TextContent);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const handleChange = (updates: Partial<TextContent>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const handleContentChange = (content: string) => {
    handleChange({ content });
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
        <label className="block text-sm font-medium mb-1">Content</label>
        <RichTextEditor
          content={editingContent.content}
          onChange={handleContentChange}
          className="w-full p-2 border rounded-md"
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
