'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { LessonBuilder } from '@/src/components/ui/admin';
import { ClipboardProvider } from '@/src/components/ui/core/clipboard';
import { Lesson } from '@/src/types/lesson';
import { useAppDispatch } from '@/src/store/hooks';
import { useGetLessonByIdQuery, useUpdateLessonMutation, useSaveToRecoveryMutation } from '@/src/store/api/lessonApi';
import {
  ErrorDialog,
  ErrorType,
  parseErrorType,
  getHumanReadableError,
  formatErrorDetails,
} from '@/src/components/ui/core/ErrorDialog';
import { setLesson, loadTooltips, resetLessonState, clearDraft, setDirty } from '@/src/store/slices/lessonEditorSlice';
import { useBeforeUnload } from '@/src/hooks/useLessonDraft';
import { UnifiedDialog } from '@/src/components/ui/core/UnifiedDialog';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminIconChip } from '@/src/components/admin/shell';

interface EditLessonPageProps {
  params: Promise<{
    id: string;
  }>;
}

function EditLessonPage({ params }: EditLessonPageProps) {
  const { id } = React.use(params);
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: lessonData } = useGetLessonByIdQuery({ lessonId: id });
  const [updateLesson, { isLoading: saving, isError: saveFailed }] = useUpdateLessonMutation();
  const [saveToRecovery, { isLoading: savingToRecovery }] = useSaveToRecoveryMutation();
  const { currentLesson, dirty } = useSelector((state: RootState) => state.lessonEditor);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [initialLesson, setInitialLesson] = useState<Lesson | null>(null);

  // Error dialog state
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [saveError, setSaveError] = useState<{
    type: ErrorType;
    message: string;
    details?: string;
  } | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    alternateText?: string;
    onConfirm: () => void;
    onAlternate?: () => void;
  } | null>(null);

  useEffect(() => {
    if (!lessonData) return;

    if (!dirty) {
      if (!initialLesson || lessonData.lesson.id !== initialLesson.id) {
        setInitialLesson(JSON.parse(JSON.stringify(lessonData.lesson)));
      }
      dispatch(setLesson(lessonData.lesson));
      dispatch(loadTooltips(lessonData.tooltips));
    }

    setLoading(false);
  }, [lessonData, dispatch, initialLesson, dirty]);

  const shouldBlockNavigation = dirty || saving;
  const hasUnsavedChanges = dirty && !saving;
  const status = saving ? 'saving' : saveFailed ? 'error' : hasUnsavedChanges ? 'unsaved' : null;

  const handleSaveLesson = async (updatedLesson: Lesson) => {
    try {
      await updateLesson(updatedLesson).unwrap();
      dispatch(clearDraft(updatedLesson.id));
      dispatch(setDirty(false));
      toast.success('Lesson updated successfully!');
    } catch (error) {
      console.error('Error updating lesson:', error);

      // Show error dialog instead of just a toast
      const errorType = parseErrorType(error);
      const errorMessage = getHumanReadableError(error);
      const errorDetails = formatErrorDetails(error);

      setSaveError({
        type: errorType,
        message: errorMessage,
        details: errorDetails,
      });
      setShowErrorDialog(true);
    }
  };

  const handleRetry = async () => {
    if (!currentLesson) return;
    setIsRetrying(true);
    setShowErrorDialog(false);
    try {
      await updateLesson(currentLesson).unwrap();
      dispatch(clearDraft(currentLesson.id));
      dispatch(setDirty(false));
      toast.success('Lesson updated successfully!');
    } catch (error) {
      console.error('Retry failed:', error);
      const errorType = parseErrorType(error);
      const errorMessage = getHumanReadableError(error);
      const errorDetails = formatErrorDetails(error);

      setSaveError({
        type: errorType,
        message: errorMessage,
        details: errorDetails,
      });
      setShowErrorDialog(true);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSaveToRecovery = async () => {
    if (!currentLesson) return;
    try {
      await saveToRecovery({
        lesson: currentLesson,
        errorMessage: saveError?.message || 'Unknown error',
        errorCode: saveError?.type,
      }).unwrap();

      setShowErrorDialog(false);
      dispatch(clearDraft(currentLesson.id));
      toast.success('Lesson saved to recovery. You can retry later from the Manage Lessons page.');
      router.push('/admin/lessons/manage');
    } catch (error) {
      console.error('Failed to save to recovery:', error);
      toast.error('Failed to save to recovery. Please copy the error details and contact support.');
    }
  };

  const handleBrowserBackButton = (destination = '/admin/lessons/manage') => {
    if (!currentLesson) return;

    if (saving) {
      setDialogState({
        isOpen: true,
        title: 'Saving lesson',
        description: 'Please wait for the save to finish before leaving.',
        confirmText: 'Stay',
        onConfirm: () => setDialogState(null),
      });
      return;
    }

    setDialogState({
      isOpen: true,
      title: 'You have unsaved changes',
      description: 'Do you want to save your changes before leaving?',
      confirmText: 'Save & Exit',
      alternateText: 'Discard Changes & Exit',
      onConfirm: async () => {
        if (!currentLesson) return;
        setNavigating(true);
        try {
          await updateLesson(currentLesson).unwrap();
          dispatch(clearDraft(currentLesson.id));
          dispatch(setDirty(false));
          router.push(destination);
        } catch (error) {
          console.error('Error updating lesson:', error);
          toast.error('Failed to update lesson');
          setNavigating(false);
        }
      },
      onAlternate: () => {
        setNavigating(true);
        setTimeout(() => {
          dispatch(resetLessonState());
          router.push(destination);
        }, 0);
      },
    });
  };

  useBeforeUnload(shouldBlockNavigation, handleBrowserBackButton);

  if (loading || navigating || !currentLesson) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <AdminIconChip icon={BookOpen} />
            <div>
              <h1 className="text-xl font-serif tracking-wide">Edit Lesson</h1>
              <p className="text-sm text-roman-stone">Editing: {currentLesson.title || 'Untitled Lesson'}</p>
            </div>
          </div>
          {status === 'saving' && (
            <div className="flex items-center gap-2 text-sm text-roman-stone">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-roman-red"></div>
              Saving lesson...
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <span className="w-2 h-2 bg-red-500 rounded-full inline-block"></span>
              Save failed
            </div>
          )}
          {status === 'unsaved' && (
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <span className="w-2 h-2 bg-amber-500 rounded-full inline-block"></span>
              Unsaved changes
            </div>
          )}
        </header>

        <div className="flex-1 overflow-hidden">
          <ClipboardProvider>
            <LessonBuilder initialLesson={initialLesson ?? undefined} onSave={handleSaveLesson} saving={saving} />
          </ClipboardProvider>
        </div>
      </div>

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

      <ErrorDialog
        isOpen={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        title="Failed to Update Lesson"
        errorType={saveError?.type || 'unknown'}
        errorMessage={saveError?.message || 'An unexpected error occurred'}
        technicalDetails={saveError?.details}
        onRetry={handleRetry}
        onSaveToRecovery={handleSaveToRecovery}
        retrying={isRetrying}
        savingToRecovery={savingToRecovery}
      />
    </>
  );
}

export default withAdminAuth(EditLessonPage);
