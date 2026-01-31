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
import { useCreateLessonMutation, useLazyGetLessonByIdQuery, useSaveToRecoveryMutation } from '@/src/store/api/lessonApi';
import {
  ErrorDialog,
  ErrorType,
  parseErrorType,
  getHumanReadableError,
  formatErrorDetails,
} from '@/src/components/ui/core/ErrorDialog';
import {
  resetLessonState,
  loadDrafts,
  setLesson,
  clearDraft,
  saveDraft,
  setDirty,
  selectHasDraft,
} from '@/src/store/slices/lessonEditorSlice';
import { useBeforeUnload } from '@/src/hooks/useLessonDraft';
import { UnifiedDialog } from '@/src/components/ui/core/UnifiedDialog';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';

function CreateLessonPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [createLesson, { isLoading: saving, isError: saveFailed }] = useCreateLessonMutation();
  const [checkLessonExists] = useLazyGetLessonByIdQuery();
  const [saveToRecovery, { isLoading: savingToRecovery }] = useSaveToRecoveryMutation();
  const { drafts, currentLesson, dirty } = useSelector((state: RootState) => state.lessonEditor);
  const [isCheckingLesson, setIsCheckingLesson] = useState(false);

  // Error dialog state
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [saveError, setSaveError] = useState<{
    type: ErrorType;
    message: string;
    details?: string;
  } | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const [isContinuingDraft, setIsContinuingDraft] = useState(false);
  const [originalDraft, setOriginalDraft] = useState<Lesson | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
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

  const handleBrowserBackButton = () => {
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
      description: 'What would you like to do with your changes?',
      confirmText: 'Save as Draft & Exit',
      alternateText: isContinuingDraft ? 'Revert to Original & Exit' : 'Discard Changes & Exit',
      onConfirm: () => {
        setIsNavigating(true);
        setDialogState(null);
        setTimeout(() => {
          dispatch(resetLessonState());
          router.push('/admin');
        }, 0);
      },
      onAlternate: () => {
        if (isContinuingDraft && originalDraft) {
          dispatch(saveDraft(originalDraft));
        } else {
          dispatch(clearDraft(currentLesson.id));
        }
        setIsNavigating(true);
        setDialogState(null);
        setTimeout(() => {
          dispatch(resetLessonState());
          router.push('/admin');
        }, 0);
      },
    });
  };

  const shouldBlockNavigation = dirty || saving || hasDraft;
  const hasUnsavedChanges = dirty && !saving;
  const status = saving
    ? 'saving'
    : saveFailed
      ? 'error'
      : hasUnsavedChanges
        ? 'unsaved'
        : hasDraft && lastSavedTime
          ? 'draft'
          : null;

  useBeforeUnload(shouldBlockNavigation, handleBrowserBackButton);

  // Initialize page state
  useEffect(() => {
    const initializePage = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const continueDraft = urlParams.get('continue');
      const lessonId = urlParams.get('lessonId');

      dispatch(loadDrafts());

      if (continueDraft === 'true' && lessonId) {
        // Check if this lesson already exists in Firebase
        setIsCheckingLesson(true);
        try {
          const result = await checkLessonExists({ lessonId }).unwrap();
          if (result.lesson) {
            // Lesson already exists - clear draft and redirect to edit page
            dispatch(clearDraft(lessonId));
            toast.info('This lesson already exists. Redirecting to edit page...');
            router.replace(`/admin/lessons/edit/${lessonId}`);
            return;
          }
        } catch {
          // Lesson doesn't exist (404) - this is expected, continue with draft
        }
        setIsCheckingLesson(false);

        // Continue with draft loading
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
    };

    initializePage();
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

  const handleSaveLesson = async (lesson: Lesson) => {
    try {
      const result = await createLesson(lesson).unwrap();
      const editUrl = `/admin/lessons/edit/${result.lesson.id}`;

      // Clear state before navigation
      dispatch(setDirty(false));
      dispatch(clearDraft(lesson.id));
      toast.success('Lesson created successfully!');

      // Use setTimeout to ensure state updates are processed before navigation
      // This prevents race conditions with the useBeforeUnload hook
      setTimeout(() => {
        window.location.href = editUrl;
      }, 0);
    } catch (error) {
      console.error('Error creating lesson:', error);

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
      const result = await createLesson(currentLesson).unwrap();
      const editUrl = `/admin/lessons/edit/${result.lesson.id}`;

      dispatch(setDirty(false));
      dispatch(clearDraft(currentLesson.id));
      toast.success('Lesson saved successfully!');

      setTimeout(() => {
        window.location.href = editUrl;
      }, 0);
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

  const handleBackToAdmin = () => {
    if (!currentLesson) {
      router.push('/admin');
      return;
    }

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

    if (shouldBlockNavigation) {
      setDialogState({
        isOpen: true,
        title: 'You have unsaved changes',
        description: 'What would you like to do with your changes?',
        confirmText: 'Save as Draft & Exit',
        alternateText: isContinuingDraft ? 'Revert to Original & Exit' : 'Discard Changes & Exit',
        onConfirm: () => {
          setIsNavigating(true);
          setTimeout(() => {
            dispatch(resetLessonState());
            router.push('/admin');
          }, 0);
        },
        onAlternate: () => {
          if (isContinuingDraft && originalDraft) {
            dispatch(saveDraft(originalDraft));
          } else {
            dispatch(clearDraft(currentLesson.id));
          }
          setIsNavigating(true);
          setTimeout(() => {
            dispatch(resetLessonState());
            router.push('/admin');
          }, 0);
        },
      });
    } else {
      router.push('/admin');
    }
  };

  if (isNavigating || isCheckingLesson) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
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
          {status === 'draft' && lastSavedTime && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
              Draft saved at {lastSavedTime.toLocaleTimeString()}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ClipboardProvider>
          <LessonBuilder onSave={handleSaveLesson} saving={saving} />
        </ClipboardProvider>
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
        title="Failed to Save Lesson"
        errorType={saveError?.type || 'unknown'}
        errorMessage={saveError?.message || 'An unexpected error occurred'}
        technicalDetails={saveError?.details}
        onRetry={handleRetry}
        onSaveToRecovery={handleSaveToRecovery}
        retrying={isRetrying}
        savingToRecovery={savingToRecovery}
      />
    </div>
  );
}

export default withAdminAuth(CreateLessonPage);
