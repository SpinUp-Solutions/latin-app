import React from 'react';
import { EmphasisContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import { AudioUploadSection } from './AudioUploadSection';

export const EmphasisEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as EmphasisContent);

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
        <input
          type="text"
          value={editingContent.title || ''}
          onChange={e => handleChange({ title: e.target.value })}
          className="w-full p-2 border rounded-md"
          placeholder="Enter title..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Emphasized Content</label>
        <textarea
          value={editingContent.content}
          onChange={e => handleChange({ content: e.target.value })}
          className="w-full p-2 border rounded-md"
          rows={4}
          placeholder="Enter emphasized content..."
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
