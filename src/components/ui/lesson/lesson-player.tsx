'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LessonWithProgress } from '@/src/types/lesson';
import { BookOpen, Headphones, CheckCircle } from 'lucide-react';
import { RomanPlayerShell } from '@/src/components/ui/core/roman-player-shell';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { Button } from '@/src/components/ui/button';
import PageTemplate from './page-template';
import useAudio from '@/src/hooks/useAudio';
import LessonNavigation from '../exercises/lesson-navigation';
import {
  useMarkExerciseCompleteMutation,
  useUpdatePageProgressMutation,
  useFinishLessonMutation,
} from '@/src/store/api/lessonApi';
import { useAuth } from '@/src/hooks/useAuth';
import { toast } from 'sonner';
import { auth } from '@/src/services/firebase';
import { DiagramAuditSubmission } from '@/src/features/sentence-diagramming';
import { RequiredExercise } from '@/src/utils/lessonProgress';
import { stripHtmlTags } from '@/src/utils/exercises';
import type { ExerciseAnswerEvent, RuntimeMode } from '@/src/types/runtime-mode';
import type { GeneratedExerciseRenderContext, ResolvedGeneratedExerciseState } from './content-renderer';

interface LessonPlayerProps {
  lesson: LessonWithProgress;
  navigationPlacement?: 'fixed' | 'contained';
  trackProgress?: boolean;
  runtimeMode?: RuntimeMode;
  onAnswer?: (event: ExerciseAnswerEvent) => void;
  resolvedExerciseState?: Record<string, ResolvedGeneratedExerciseState>;
  testAttemptId?: string;
  generatedExerciseContext?: GeneratedExerciseRenderContext;
}

export const LessonPlayer: React.FC<LessonPlayerProps> = ({
  lesson,
  navigationPlacement = 'fixed',
  trackProgress = true,
  runtimeMode,
  onAnswer,
  resolvedExerciseState,
  testAttemptId,
  generatedExerciseContext,
}) => {
  // Lesson previews should preserve the normal student feedback experience.
  // `trackProgress` controls persistence independently; assessment callers pass
  // an explicit runtime mode when answer-revealing feedback must be withheld.
  const effectiveRuntimeMode = runtimeMode ?? 'practice';
  const shouldTrackProgress = trackProgress && effectiveRuntimeMode === 'practice';
  const { user } = useAuth();
  const [markExerciseComplete] = useMarkExerciseCompleteMutation();
  const [updatePageProgress] = useUpdatePageProgressMutation();
  const [finishLesson, { isLoading: isFinishing }] = useFinishLessonMutation();
  const [missingExercises, setMissingExercises] = useState<RequiredExercise[]>([]);
  const lastVisitedPageId = useRef<string | null>(null);

  const [currentPageIndex, setCurrentPageIndex] = useState(
    Math.max(0, Math.min(lesson.furthestPageIndex ?? lesson.currentPageIndex ?? 0, lesson.pages.length - 1))
  );

  const currentPage = lesson.pages[currentPageIndex];
  const totalPages = lesson.pages.length;
  const resolvedGeneratedExerciseContext = generatedExerciseContext ?? { kind: 'lesson' as const, lessonId: lesson.id };

  useEffect(() => {
    if (!shouldTrackProgress || !user?.uid || !currentPage?.id || lastVisitedPageId.current === currentPage.id) return;
    lastVisitedPageId.current = currentPage.id;
    updatePageProgress({ userId: user.uid, lessonId: lesson.id, pageId: currentPage.id })
      .unwrap()
      .catch(() => toast.error('Unable to save your page progress.'));
  }, [currentPage?.id, lesson.id, shouldTrackProgress, updatePageProgress, user?.uid]);

  const handleNext = useCallback(() => {
    if (currentPageIndex < totalPages - 1) {
      const newPageIndex = currentPageIndex + 1;
      setCurrentPageIndex(newPageIndex);
      setMissingExercises([]);
    }
  }, [currentPageIndex, totalPages]);

  const handlePageComplete = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handlePrevious = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
      setMissingExercises([]);
    }
  }, [currentPageIndex]);

  const handleGoToPage = useCallback(
    (newPageIndex: number) => {
      if (newPageIndex < 0 || newPageIndex >= totalPages || newPageIndex === currentPageIndex) return;
      setCurrentPageIndex(newPageIndex);
      setMissingExercises([]);
    },
    [currentPageIndex, totalPages]
  );

  const handleAudioEnded = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const { audioRef, isPlaying, togglePlay } = useAudio(currentPage?.audioPath, handleAudioEnded);

  const handleExerciseComplete = useCallback(
    (exerciseId: string, score: number) => {
      if (!shouldTrackProgress || !user?.uid) return;

      markExerciseComplete({
        userId: user.uid,
        lessonId: lesson.id,
        exerciseId,
        score,
      })
        .unwrap()
        .catch(() => toast.error('Unable to save your exercise progress. Please try again.'));
    },
    [markExerciseComplete, user?.uid, lesson.id, shouldTrackProgress]
  );

  const handleDiagrammingAttempt = useCallback(
    async (itemIndex: number, exerciseId: string, attempt: DiagramAuditSubmission) => {
      if (effectiveRuntimeMode === 'preview' || (effectiveRuntimeMode === 'practice' && !shouldTrackProgress)) return;
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const source =
        effectiveRuntimeMode === 'test'
          ? testAttemptId
            ? { attemptId: testAttemptId }
            : null
          : { lessonId: lesson.id, pageIndex: currentPageIndex, itemIndex };
      if (!source) return;

      try {
        await fetch('/api/diagramming-attempts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...source,
            exerciseId,
            appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
            studentAnnotations: attempt.studentAnnotations,
          }),
        });
      } catch (error) {
        // Auditing must never block a student from receiving exercise feedback.
        console.warn('Unable to record diagramming attempt', error);
      }
    },
    [currentPageIndex, effectiveRuntimeMode, lesson.id, shouldTrackProgress, testAttemptId]
  );

  const isListeningLesson = lesson.type === 'listening';
  const isLessonCompleted = lesson.status === 'completed';
  const handleFinishLesson = useCallback(async () => {
    if (!shouldTrackProgress) {
      toast.info('Preview mode: progress is not tracked.');
      return;
    }
    if (!user?.uid || !currentPage?.id) return;
    try {
      await finishLesson({ userId: user.uid, lessonId: lesson.id, finalPageId: currentPage.id }).unwrap();
      setMissingExercises([]);
      toast.success('Lesson completed!');
    } catch (error) {
      const data = (error as { data?: { error?: string; missingExercises?: RequiredExercise[] } }).data;
      setMissingExercises(data?.missingExercises || []);
      toast.error(data?.error || 'Failed to finish the lesson.');
    }
  }, [currentPage?.id, finishLesson, lesson.id, shouldTrackProgress, user?.uid]);

  if (!lesson || !currentPage) {
    return (
      <div className="min-h-[300px] flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  const hasAudio = Boolean(currentPage.audioPath);

  return (
    <div className="lesson-player">
      <audio ref={audioRef} className="hidden" controls preload="auto" />

      <RomanPlayerShell
        icon={isListeningLesson ? Headphones : BookOpen}
        label={isListeningLesson ? 'Listening' : 'Lesson'}
        currentPage={currentPageIndex + 1}
        totalPages={totalPages}
        title={<SimpleRichDisplay content={lesson.title} />}
        description={lesson.description ? <SimpleRichDisplay content={lesson.description} /> : undefined}
        iconAdornment={
          isLessonCompleted ? (
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-roman-green text-white shadow-sm">
              <CheckCircle className="h-3.5 w-3.5" />
            </div>
          ) : undefined
        }>
        <div className="mb-6">
          <div className="lesson-content">
            <AnimatePresence mode="wait">
              <PageTemplate
                key={currentPage.id}
                page={currentPage}
                pageIndex={currentPageIndex}
                runtimeMode={effectiveRuntimeMode}
                onAnswer={onAnswer}
                resolvedExerciseState={resolvedExerciseState}
                generatedExerciseContext={resolvedGeneratedExerciseContext}
                onExerciseComplete={handleExerciseComplete}
                onPageComplete={handlePageComplete}
                onDiagrammingAttempt={handleDiagrammingAttempt}
              />
            </AnimatePresence>
          </div>
        </div>

        {currentPageIndex === totalPages - 1 && missingExercises.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-medium text-amber-900">
              Complete {missingExercises.length} remaining {missingExercises.length === 1 ? 'exercise' : 'exercises'}{' '}
              before finishing.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missingExercises.map(exercise => (
                <Button
                  key={exercise.exerciseId}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleGoToPage(exercise.pageIndex)}>
                  Page {exercise.pageIndex + 1}: {stripHtmlTags(exercise.title)}
                </Button>
              ))}
            </div>
          </div>
        )}

        <LessonNavigation
          currentPageIndex={currentPageIndex}
          totalPages={totalPages}
          pageTitles={lesson.pages.map(page => page.title)}
          placement={navigationPlacement}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onFinish={handleFinishLesson}
          onGoToPage={handleGoToPage}
          onTogglePlay={togglePlay}
          isPlaying={isPlaying}
          hasAudio={hasAudio}
          isFinishing={isFinishing}
        />
      </RomanPlayerShell>
    </div>
  );
};

export default LessonPlayer;
