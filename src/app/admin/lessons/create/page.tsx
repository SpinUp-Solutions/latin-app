'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { LessonBuilder } from '@/src/components/ui/admin';
import { Lesson } from '@/src/types/lesson';
import { useAppDispatch } from '@/src/store/hooks';
import {
  saveLesson,
  resetLessonState,
  clearError,
  loadDraft,
  setLesson,
  clearDraft,
} from '@/src/store/slices/lessonSlice';
import { useLessonDraft } from '@/src/hooks/useLessonDraft';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';

export default function CreateLessonPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, loading: authLoading } = useSelector((state: RootState) => state.auth);
  const { saving, error, lastSavedLesson, draft, currentLesson } = useSelector((state: RootState) => state.lesson);
  const { saveDraftToStorage, lastSavedTime } = useLessonDraft(true);
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  // Load draft from storage into Redux state on mount
  useEffect(() => {
    dispatch(loadDraft());
  }, [dispatch]);

  // Once draft is loaded into Redux, set it as the current lesson for editing
  useEffect(() => {
    if (draft) {
      dispatch(setLesson(draft.lesson));
    }
  }, [draft, dispatch]);

  // Auto-save the current lesson to storage whenever it changes
  useEffect(() => {
    if (currentLesson) {
      const timer = setTimeout(() => {
        saveDraftToStorage(currentLesson);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentLesson, saveDraftToStorage]);

  // Handle successful save
  useEffect(() => {
    if (lastSavedLesson && !saving && !error) {
      toast.success('Lesson saved successfully!');
      dispatch(clearDraft());
      router.push('/admin/lessons/manage');
    }
  }, [lastSavedLesson, saving, error, dispatch, router]);

  // Handle save error
  useEffect(() => {
    if (error && !saving) {
      toast.error(error);
      dispatch(clearError());
    }
  }, [error, saving, dispatch]);

  const handleSaveLesson = async (lesson: Lesson) => {
    try {
      const isUpdate = lesson.hasOwnProperty('createdAt') || lesson.hasOwnProperty('version');
      await dispatch(saveLesson({ lesson, isUpdate })).unwrap();
    } catch (error) {
      console.error('Error dispatching save lesson:', error);
    }
  };

  const handleBackToAdmin = () => {
    if (draft) {
      setDialogState({
        isOpen: true,
        title: 'You have unsaved changes',
        description: 'Leaving now will keep your changes as a draft. Are you sure you want to leave?',
        onConfirm: () => {
          dispatch(resetLessonState());
          router.push('/admin');
        },
      });
      return;
    }
    dispatch(resetLessonState());
    router.push('/admin');
  };

  const handleClearDraft = () => {
    setDialogState({
      isOpen: true,
      title: 'Clear draft?',
      description: 'This will permanently discard your unsaved changes. This action cannot be undone.',
      onConfirm: () => {
        dispatch(clearDraft());
        dispatch(resetLessonState());
        toast.success('Draft cleared. Starting fresh!');
      },
    });
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBackToAdmin} disabled={saving}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Create New Lesson</h1>
              <p className="text-sm text-roman-stone">
                Build a new lesson from scratch
                {draft && (
                  <span className="inline-flex items-center gap-1 ml-2 px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded-full">
                    <span className="w-2 h-2 bg-amber-500 rounded-full inline-block"></span>
                    Draft
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {draft && !saving && lastSavedTime && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
              Draft saved at {lastSavedTime.toLocaleTimeString()}
            </div>
          )}
          {saving && (
            <div className="flex items-center gap-2 text-sm text-roman-stone">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-roman-red"></div>
              Saving lesson...
            </div>
          )}
          {draft && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearDraft}
              className="text-red-600 hover:text-red-700 hover:bg-red-50">
              Clear Draft
            </Button>
          )}
        </div>
      </header>

      <LessonBuilder onSave={handleSaveLesson} />
      <ConfirmationDialog
        isOpen={dialogState?.isOpen || false}
        onClose={() => setDialogState(null)}
        onConfirm={() => dialogState?.onConfirm()}
        title={dialogState?.title || ''}
        description={dialogState?.description || ''}
      />
    </div>
  );
}
