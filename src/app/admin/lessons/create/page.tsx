'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { LessonBuilder } from '@/src/components/ui/admin';
import { ClipboardProvider } from '@/src/components/ui/core/clipboard';
import { Lesson } from '@/src/types/lesson';
import { useAppDispatch } from '@/src/store/hooks';
import {
  saveLesson,
  resetLessonState,
  clearError,
  clearLastSavedLesson,
  loadDrafts,
  setLesson,
  clearDraft,
  saveDraft,
  selectHasDraft,
} from '@/src/store/slices/lessonSlice';
import { useBeforeUnload } from '@/src/hooks/useLessonDraft';
import { UnifiedDialog } from '@/src/components/ui/core/UnifiedDialog';

export default function CreateLessonPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, loading: authLoading } = useSelector((state: RootState) => state.auth);
  const { saving, error, lastSavedLesson, drafts, currentLesson } = useSelector((state: RootState) => state.lesson);

  const [isContinuingDraft, setIsContinuingDraft] = useState(false);
  const [originalDraft, setOriginalDraft] = useState<Lesson | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    alternateText?: string;
    onConfirm: () => void;
    onAlternate?: () => void;
  } | null>(null);

  const hasDraft = useSelector((state: RootState) => (currentLesson ? selectHasDraft(state, currentLesson.id) : false));

  useBeforeUnload(hasDraft);

  // Initialize page state
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const continueDraft = urlParams.get('continue');
    const lessonId = urlParams.get('lessonId');

    dispatch(clearError());
    dispatch(clearLastSavedLesson());
    dispatch(loadDrafts());

    if (continueDraft === 'true' && lessonId) {
      setIsContinuingDraft(true);
      setTimeout(() => {
        const draft = drafts[lessonId];
        if (draft) {
          setOriginalDraft(JSON.parse(JSON.stringify(draft.lesson)));
          dispatch(setLesson(draft.lesson));
        }
      }, 100);
    } else {
      setIsContinuingDraft(false);
      setOriginalDraft(null);
      dispatch(setLesson(undefined));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispatch(resetLessonState());
    };
  }, [dispatch]);

  // Auto-save functionality
  useEffect(() => {
    if (currentLesson) {
      const timer = setTimeout(() => {
        dispatch(saveDraft(currentLesson));
        setLastSavedTime(new Date());
      }, 1000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLesson, dispatch]);

  // Handle successful save
  useEffect(() => {
    if (lastSavedLesson && !saving && !error && currentLesson && lastSavedLesson.id === currentLesson.id) {
      toast.success('Lesson saved successfully!');
      dispatch(clearDraft(lastSavedLesson.id));
      router.push('/admin/lessons/manage');
    }
  }, [lastSavedLesson, saving, error, currentLesson, dispatch, router]);

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
    if (!currentLesson) {
      router.push('/admin');
      return;
    }

    if (hasDraft) {
      setDialogState({
        isOpen: true,
        title: 'You have unsaved changes',
        description: 'What would you like to do with your changes?',
        confirmText: 'Save as Draft & Exit',
        alternateText: isContinuingDraft ? 'Revert to Original & Exit' : 'Discard Changes & Exit',
        onConfirm: () => {
          dispatch(resetLessonState());
          router.push('/admin');
        },
        onAlternate: () => {
          if (isContinuingDraft && originalDraft) {
            dispatch(saveDraft(originalDraft));
          } else {
            dispatch(clearDraft(currentLesson.id));
          }
          dispatch(resetLessonState());
          router.push('/admin');
        },
      });
    } else {
      router.push('/admin');
    }
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
                {hasDraft && (
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
          {hasDraft && !saving && lastSavedTime && (
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
        </div>
      </header>

      <ClipboardProvider>
        <LessonBuilder onSave={handleSaveLesson} />
      </ClipboardProvider>

      <UnifiedDialog
        isOpen={dialogState?.isOpen || false}
        onClose={() => setDialogState(null)}
        title={dialogState?.title || ''}
        description={dialogState?.description || ''}
        confirmText={dialogState?.confirmText || 'Confirm'}
        alternateText={dialogState?.alternateText}
        onConfirm={dialogState?.onConfirm || (() => {})}
        onAlternate={dialogState?.onAlternate}
      />
    </div>
  );
}
