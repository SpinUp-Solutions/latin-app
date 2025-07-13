'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { BookOpen, Edit, Trash2, Calendar, Eye, FileText, Clock } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { loadLessons, deleteLesson, clearDraft, loadDraft } from '@/src/store/slices/lessonSlice';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';

interface LessonManagerProps {
  onEditLesson: (lesson: Lesson) => void;
  onContinueDraft: () => void;
}

interface LessonWithMetadata extends Lesson {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
  published?: boolean;
}

export const LessonManager: React.FC<LessonManagerProps> = ({ onEditLesson, onContinueDraft }) => {
  const dispatch = useAppDispatch();
  const { lessons, loading, error, draft } = useAppSelector(state => state.lesson);
  const [selectedLesson, setSelectedLesson] = useState<LessonWithMetadata | null>(null);
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    dispatch(loadLessons());
    dispatch(loadDraft());
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleDeleteLesson = (lessonId: string, lessonTitle: string) => {
    setDialogState({
      isOpen: true,
      title: `Delete Lesson: "${lessonTitle}"?`,
      description: 'This action cannot be undone. This will permanently delete the lesson and all of its content.',
      onConfirm: async () => {
        try {
          await dispatch(deleteLesson(lessonId)).unwrap();
          toast.success('Lesson deleted successfully');
        } catch (error) {
          console.error('Error deleting lesson:', error);
        }
      },
    });
  };

  const handleDeleteDraft = () => {
    if (!draft) return;
    setDialogState({
      isOpen: true,
      title: `Delete Draft: "${draft.lesson.title}"?`,
      description: 'This will permanently discard your unsaved draft. This action cannot be undone.',
      onConfirm: () => {
        dispatch(clearDraft());
        toast.success('Draft deleted successfully');
      },
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getContentCount = (lesson: Lesson) => {
    const introCount = lesson.introduction.reduce((count, page) => count + page.items.length, 0);
    const exerciseCount = lesson.exercises.reduce((count, page) => count + page.items.length, 0);
    return { introCount, exerciseCount, total: introCount + exerciseCount };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (selectedLesson) {
    const contentCount = getContentCount(selectedLesson);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-serif text-gray-800">Lesson Details</h2>
            <p className="text-roman-stone">View lesson information and content</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setSelectedLesson(null)} variant="outline">
              Back to List
            </Button>
            <Button onClick={() => onEditLesson(selectedLesson)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Lesson
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {selectedLesson.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-700 mb-1">Description</h4>
              <p className="text-gray-600">{selectedLesson.description || 'No description provided'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-gray-700 mb-1">Lesson ID</h4>
                <p className="text-gray-600 font-mono text-sm">{selectedLesson.id}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-1">Version</h4>
                <p className="text-gray-600">{selectedLesson.version || 1}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-1">Created</h4>
                <p className="text-gray-600 text-sm">{formatDate(selectedLesson.createdAt)}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-700 mb-1">Last Updated</h4>
                <p className="text-gray-600 text-sm">{formatDate(selectedLesson.updatedAt)}</p>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Content Summary</h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-2xl font-bold text-blue-600">{selectedLesson.introduction.length}</div>
                  <div className="text-sm text-blue-700">Introduction Pages</div>
                  <div className="text-xs text-gray-500">{contentCount.introCount} items</div>
                </div>
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-2xl font-bold text-green-600">{selectedLesson.exercises.length}</div>
                  <div className="text-sm text-green-700">Exercise Pages</div>
                  <div className="text-xs text-gray-500">{contentCount.exerciseCount} items</div>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                  <div className="text-2xl font-bold text-purple-600">{contentCount.total}</div>
                  <div className="text-sm text-purple-700">Total Content Items</div>
                  <div className="text-xs text-gray-500">Across all pages</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Drafts Section */}
      {draft && (
        <section>
          <h2 className="text-xl font-serif text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-600" />
            <span>Draft</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="hover:shadow-lg transition-shadow border-amber-300 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-amber-600" />
                    <span className="truncate">{draft.lesson.title}</span>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">Draft</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p
                  className="text-sm text-gray-600 overflow-hidden text-ellipsis"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const,
                  }}>
                  {draft.lesson.description || 'No description provided'}
                </p>

                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last saved: {formatDate(draft.lastModified)}
                  </div>
                </div>

                <div className="flex justify-between text-xs text-gray-600">
                  <span>{draft.lesson.introduction.length} intro pages</span>
                  <span>{draft.lesson.exercises.length} exercise pages</span>
                  <span>{getContentCount(draft.lesson).total} items</span>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={onContinueDraft} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                    <Edit className="h-4 w-4 mr-1" />
                    Continue
                  </Button>
                  <Button size="sm" variant="destructive" onClick={handleDeleteDraft}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Saved Lessons Section */}
      <section>
        <h2 className="text-xl font-serif text-gray-800 border-b pb-2 mb-4">Saved Lessons ({lessons.length})</h2>
        {lessons.length === 0 && !draft ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">No Lessons Found</h3>
              <p className="text-gray-600 mb-4">Create your first lesson to get started.</p>
            </CardContent>
          </Card>
        ) : lessons.length === 0 && draft ? (
          <div className="text-center text-gray-500 py-8">
            No saved lessons yet. Continue with your draft or create a new lesson.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lessons.map(lesson => {
              const contentCount = getContentCount(lesson);

              return (
                <Card key={lesson.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-blue-600" />
                        <span className="truncate">{lesson.title}</span>
                      </div>
                      {lesson.published && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Published</span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p
                      className="text-sm text-gray-600 overflow-hidden text-ellipsis"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as const,
                      }}>
                      {lesson.description || 'No description provided'}
                    </p>

                    <div className="text-xs text-gray-500 space-y-1">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(lesson.updatedAt || lesson.createdAt)}
                      </div>
                      <div>v{lesson.version || 1}</div>
                    </div>

                    <div className="flex justify-between text-xs text-gray-600">
                      <span>{lesson.introduction.length} intro pages</span>
                      <span>{lesson.exercises.length} exercise pages</span>
                      <span>{contentCount.total} items</span>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelectedLesson(lesson)} className="flex-1">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button size="sm" onClick={() => onEditLesson(lesson)} className="flex-1">
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteLesson(lesson.id, lesson.title)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
      <ConfirmationDialog
        isOpen={dialogState?.isOpen || false}
        onClose={() => setDialogState(null)}
        onConfirm={() => dialogState?.onConfirm()}
        title={dialogState?.title || ''}
        description={dialogState?.description || ''}
        confirmText="Delete"
      />
    </div>
  );
};
