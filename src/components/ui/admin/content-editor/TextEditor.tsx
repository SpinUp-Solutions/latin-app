import React, { useState } from 'react';
import { TextContent } from '@/src/types/lesson';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { updateEditingContent } from '@/src/store/slices/lessonSlice';
import RichTextEditor from '../../core/rich-text-editor';
import { useAdminApi } from '@/src/hooks/useAdminApi';
import { Button } from '../../button';
import { Upload, XCircle, CheckCircle, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const TextEditor: React.FC = () => {
  const dispatch = useAppDispatch();
  const { makeAdminRequest } = useAdminApi();
  const editingContent = useAppSelector(state => state.lesson.editingContent?.content as TextContent);
  const lessonId = useAppSelector(state => state.lesson.currentLesson?.id);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!editingContent) {
    return <div>No content selected for editing</div>;
  }

  const handleChange = (updates: Partial<TextContent>) => {
    dispatch(updateEditingContent({ ...editingContent, ...updates }));
  };

  const handleContentChange = (content: string) => {
    handleChange({ content });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !lessonId || !editingContent.id) return;

    setIsUploading(true);
    const toastId = toast.loading('Uploading audio file...');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('lessonId', lessonId);
    formData.append('contentItemId', editingContent.id);

    try {
      const result = await makeAdminRequest('upload-audio', {
        method: 'POST',
        body: formData,
      });
      handleChange({ audioPath: result.audioPath });
      toast.success('Upload complete!', { id: toastId });
      setSelectedFile(null);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Please try again.'}`, { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAudio = async () => {
    if (!editingContent.audioPath) return;

    setIsDeleting(true);
    const toastId = toast.loading('Deleting audio file...');

    try {
      await makeAdminRequest('delete-audio', {
        method: 'POST',
        body: JSON.stringify({ audioPath: editingContent.audioPath }),
      });
      handleChange({ audioPath: null });
      toast.success('File deleted successfully.', { id: toastId });
    } catch (error) {
      console.error('Deletion failed:', error);
      toast.error(`Deletion failed: ${error instanceof Error ? error.message : 'Please try again.'}`, { id: toastId });
    } finally {
      setIsDeleting(false);
    }
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
        <RichTextEditor
          content={editingContent.content}
          onChange={handleContentChange}
          className="w-full p-2 border rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Audio</label>
        {!editingContent.audioPath ? (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="flex-1">
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  accept="audio/*"
                  disabled={isUploading}
                />
                {selectedFile && <p className="mt-1 text-xs text-gray-500">Selected: {selectedFile.name}</p>}
              </div>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="px-4 py-2 min-w-[100px]"
                size="sm">
                {isUploading ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="border border-green-200 bg-green-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-800">Audio file uploaded</p>
                  <a
                    href={editingContent.audioPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 hover:text-green-800 underline truncate block">
                    {editingContent.audioPath.split('/').pop()}
                  </a>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-800 hover:bg-red-50"
                onClick={handleDeleteAudio}
                disabled={isDeleting}>
                {isDeleting ? <Loader2 className="animate-spin h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
