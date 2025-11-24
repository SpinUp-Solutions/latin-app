'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/src/components/ui/tabs';
import { BookOpen, Edit, Trash2, Calendar, Eye, FileText, Clock } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { useGetLessonsQuery, useDeleteLessonMutation } from '@/src/store/api/lessonApi';
import { clearDraft, loadDrafts } from '@/src/store/slices/lessonEditorSlice';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { isExerciseType } from '@/src/utils/lessonUtils';

interface LessonManagerProps {
  onEditLesson: (lesson: Lesson) => void;
  onContinueDraft: (lessonId: string) => void;
}

export const LessonManager: React.FC<LessonManagerProps> = ({ onEditLesson, onContinueDraft }) => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: lessons = [], isLoading: loading, error } = useGetLessonsQuery();
  const [deleteLesson] = useDeleteLessonMutation();
  const { drafts } = useAppSelector(state => state.lessonEditor);
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  const normalLessons = lessons.filter(l => l.type === 'normal');
  const vocabLessons = lessons.filter(l => l.type === 'vocab');

  useEffect(() => {
    dispatch(loadDrafts());
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      const errorMessage =
        'data' in error
          ? (error.data as { error?: string })?.error || 'Failed to load lessons'
          : 'error' in error
            ? error.error || 'Failed to load lessons'
            : 'Failed to load lessons';
      toast.error(errorMessage);
    }
  }, [error]);

  const handleDeleteLesson = (lessonId: string, lessonTitle: string) => {
    setDialogState({
      isOpen: true,
      title: `Delete Lesson: "${lessonTitle}"?`,
      description: 'This action cannot be undone. This will permanently delete the lesson and all of its content.',
      onConfirm: async () => {
        try {
          await deleteLesson(lessonId).unwrap();
          toast.success('Lesson deleted successfully');
        } catch (error) {
          console.error('Error deleting lesson:', error);
        }
      },
    });
  };

  const handleDeleteDraft = (lessonId: string, lessonTitle: string) => {
    setDialogState({
      isOpen: true,
      title: `Delete Draft: "${lessonTitle}"?`,
      description: 'This will permanently discard your unsaved draft. This action cannot be undone.',
      onConfirm: () => {
        dispatch(clearDraft(lessonId));
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

  const renderLessonGrid = (lessonsList: Lesson[]) => {
    if (lessonsList.length === 0) {
      return <div className="text-center text-gray-500 py-8">No lessons found in this category.</div>;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {lessonsList.map(lesson => (
          <Card key={lesson.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <BookOpen className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div className="truncate min-w-0">
                    <SimpleRichDisplay content={lesson.title} className="truncate" />
                  </div>
                </div>
                {lesson.isLive && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded flex-shrink-0">Live</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-600 line-clamp-3">
                <SimpleRichDisplay content={lesson.description || 'No description provided'} />
              </div>

              <div className="text-xs text-gray-500 space-y-1">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(lesson.updatedAt || lesson.createdAt)}
                </div>
                <div>v{lesson.version || 1}</div>
              </div>

              <div className="flex justify-between text-xs text-gray-600">
                <span>{lesson.pages.length} total pages</span>
                <span>
                  {lesson.pages.reduce(
                    (count, page) => count + page.items.filter(item => isExerciseType(item.type)).length,
                    0
                  )}{' '}
                  exercises
                </span>
                <span>{lesson.pages.reduce((count, page) => count + page.items.length, 0)} items</span>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/admin/lessons/preview/${lesson.id}`)}
                  className="flex-1">
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
                <Button size="sm" onClick={() => onEditLesson(lesson)} className="flex-1">
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDeleteLesson(lesson.id, lesson.title)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Drafts Section */}
      {Object.keys(drafts).length > 0 && (
        <section>
          <h2 className="text-xl font-serif text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-600" />
            <span>Drafts ({Object.keys(drafts).length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(drafts)
              .sort(([, a], [, b]) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
              .map(([lessonId, draft]) => (
                <Card key={lessonId} className="hover:shadow-lg transition-shadow border-amber-300 bg-amber-50/50">
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="h-5 w-5 text-amber-600 flex-shrink-0" />
                        <div className="truncate min-w-0">
                          <SimpleRichDisplay content={draft.lesson.title} className="truncate" />
                        </div>
                      </div>
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full flex-shrink-0">
                        Draft
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-gray-600 line-clamp-3">
                      <SimpleRichDisplay content={draft.lesson.description || 'No description provided'} />
                    </div>

                    <div className="text-xs text-gray-500 space-y-1">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last saved: {formatDate(draft.lastModified)}
                      </div>
                    </div>

                    <div className="flex justify-between text-xs text-gray-600">
                      <span>{draft.lesson.pages.length} total pages</span>
                      <span>
                        {draft.lesson.pages.reduce(
                          (count, page) => count + page.items.filter(item => isExerciseType(item.type)).length,
                          0
                        )}{' '}
                        exercises
                      </span>
                      <span>{draft.lesson.pages.reduce((count, page) => count + page.items.length, 0)} items</span>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => onContinueDraft(lessonId)}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                        <Edit className="h-4 w-4 mr-1" />
                        Continue
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteDraft(lessonId, draft.lesson.title)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-serif text-gray-800 border-b pb-2 mb-4">Saved Lessons ({lessons.length})</h2>
        {lessons.length === 0 && Object.keys(drafts).length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">No Lessons Found</h3>
              <p className="text-gray-600 mb-4">Create your first lesson to get started.</p>
            </CardContent>
          </Card>
        ) : lessons.length === 0 && Object.keys(drafts).length > 0 ? (
          <div className="text-center text-gray-500 py-8">
            No saved lessons yet. Continue with your drafts or create a new lesson.
          </div>
        ) : (
          <Tabs defaultValue="normal" className="w-full">
            <TabsList>
              <TabsTrigger value="normal">Normal Lessons ({normalLessons.length})</TabsTrigger>
              <TabsTrigger value="vocab">Vocab Lessons ({vocabLessons.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="normal">{renderLessonGrid(normalLessons)}</TabsContent>
            <TabsContent value="vocab">{renderLessonGrid(vocabLessons)}</TabsContent>
          </Tabs>
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
