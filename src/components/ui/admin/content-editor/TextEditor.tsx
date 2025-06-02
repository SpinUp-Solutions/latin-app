import React from 'react';
import { TextContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';

export const TextEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as TextContent);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const handleChange = (updates: Partial<TextContent>) => {
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
        <label className="block text-sm font-medium mb-1">Content</label>
        <textarea
          value={editingContent.content}
          onChange={e => handleChange({ content: e.target.value })}
          className="w-full p-2 border rounded-md"
          rows={6}
          placeholder="Enter your text content..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Audio Path (optional)</label>
        <input
          type="text"
          value={editingContent.audioPath || ''}
          onChange={e => handleChange({ audioPath: e.target.value || null })}
          className="w-full p-2 border rounded-md"
          placeholder="/assets/audio/example.mp3"
        />
      </div>
    </div>
  );
};
