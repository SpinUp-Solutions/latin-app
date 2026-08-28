'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/nextjs';
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
import { getMissingExercises, getRequiredExercises, RequiredExercise } from '@/src/utils/lessonProgress';
import { isExerciseType } from '@/src/utils/lessonUtils';
import { stripHtmlTags } from '@/src/utils/exercises';
import type { ExerciseAnswerEvent, RuntimeMode } from '@/src/types/runtime-mode';
import type { GeneratedExerciseRenderContext, ResolvedGeneratedExerciseState } from './content-renderer';
import { getApiErrorMessage, isRetryableApiError } from '@/src/store/api/baseQuery';
import { reportUnexpectedError, reportWatchedEvent } from '@/src/lib/report-unexpected-error';
import ExerciseCompletionRing from './exercise-completion-ring';

const RETRY_DELAYS_MS = [1000, 3000];
const PENDING_WRITE_FINISH_GRACE_MS = 8_000;

interface ProgressMutationSummary {
  progress?: number;
  furthestPageIndex?: number;
  lessonCompleted?: boolean;
  completedExerciseCount?: number;
  requiredExerciseCount?: number;
}

interface RetryController {
  cancelled: boolean;
  waiters: Set<() => void>;
}

interface ExerciseCompletionState {
  confirmed: boolean;
  pending: number;
}

const createRetryController = (): RetryController => ({ cancelled: false, waiters: new Set() });

const safeCount = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;

const cancelRetryController = (controller: RetryController) => {
  if (controller.cancelled) return;
  controller.cancelled = true;
  [...controller.waiters].forEach(cancel => cancel());
};

const waitForRetry = (controller: RetryController, delayMs: number): Promise<boolean> =>
  new Promise(resolve => {
    if (controller.cancelled) {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (shouldRetry: boolean) => {
      if (settled) return;
      settled = true;
      controller.waiters.delete(cancel);
      resolve(shouldRetry);
    };
    const timer = setTimeout(() => finish(true), delayMs);
    const cancel = () => {
      clearTimeout(timer);
      finish(false);
    };
    controller.waiters.add(cancel);
  });

async function runWithBoundedRetries<T>(
  request: () => Promise<T>,
  controller: RetryController
): Promise<T | null> {
  for (let attempt = 0; ; attempt += 1) {
    if (controller.cancelled) return null;
    try {
      const result = await request();
      return controller.cancelled ? null : result;
    } catch (error) {
      if (controller.cancelled) return null;
      if (!isRetryableApiError(error) || attempt >= RETRY_DELAYS_MS.length) throw error;
      if (!(await waitForRetry(controller, RETRY_DELAYS_MS[attempt]))) return null;
    }
  }
}

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
  const [finishLesson, { isLoading: isFinishMutationLoading }] = useFinishLessonMutation();
  const requiredExercises = getRequiredExercises(lesson);
  const [missingExercises, setMissingExercises] = useState<RequiredExercise[]>(() =>
    lesson.status === 'completed' ? [] : getMissingExercises(requiredExercises, lesson.exerciseProgress)
  );
  const savedPageIdsRef = useRef<Set<string>>(new Set());
  const pagePipelinesRef = useRef<Map<string, RetryController>>(new Map());
  const pendingExerciseWritesRef = useRef<Set<Promise<unknown>>>(new Set());
  const exercisePipelinesRef = useRef<Set<RetryController>>(new Set());
  const exerciseCompletionStateRef = useRef<Map<string, ExerciseCompletionState>>(new Map());
  const mountedRef = useRef(true);
  const finishInProgressRef = useRef(false);
  const [isFinishPending, setIsFinishPending] = useState(false);
  const [lessonCompleted, setLessonCompleted] = useState(lesson.status === 'completed');
  const shouldShowExerciseRing = shouldTrackProgress && Boolean(user?.uid) && requiredExercises.length > 0;
  const [completedExerciseCount, setCompletedExerciseCount] = useState(() =>
    Math.max(
      0,
      Math.min(
        Math.max(safeCount(lesson.requiredExerciseCount), requiredExercises.length),
        safeCount(lesson.completedExerciseCount)
      )
    )
  );
  const [requiredExerciseCount, setRequiredExerciseCount] = useState(
    Math.max(safeCount(lesson.requiredExerciseCount), requiredExercises.length)
  );
  const lessonIdRef = useRef(lesson.id);
  lessonIdRef.current = lesson.id;

  const [currentPageIndex, setCurrentPageIndex] = useState(
    Math.max(0, Math.min(lesson.furthestPageIndex ?? lesson.currentPageIndex ?? 0, lesson.pages.length - 1))
  );
  const [furthestPageIndex, setFurthestPageIndex] = useState(
    Math.max(0, Math.min(lesson.furthestPageIndex ?? lesson.currentPageIndex ?? 0, lesson.pages.length - 1))
  );

  const currentPage = lesson.pages[currentPageIndex];
  const totalPages = lesson.pages.length;
  const resolvedGeneratedExerciseContext = generatedExerciseContext ?? { kind: 'lesson' as const, lessonId: lesson.id };

  const applyProgressMutation = useCallback((result: ProgressMutationSummary, requestLessonId: string) => {
    if (!mountedRef.current || requestLessonId !== lessonIdRef.current) return;
    if (typeof result.furthestPageIndex === 'number' && Number.isFinite(result.furthestPageIndex)) {
      setFurthestPageIndex(current => Math.max(current, Math.trunc(result.furthestPageIndex as number)));
    }
    if (typeof result.requiredExerciseCount === 'number' && Number.isFinite(result.requiredExerciseCount)) {
      setRequiredExerciseCount(current => Math.max(current, Math.trunc(result.requiredExerciseCount as number)));
    }
    if (typeof result.completedExerciseCount === 'number' && Number.isFinite(result.completedExerciseCount)) {
      setCompletedExerciseCount(current => Math.max(current, Math.trunc(result.completedExerciseCount as number)));
    }
    if (result.lessonCompleted) {
      setLessonCompleted(true);
      setMissingExercises([]);
    }
  }, []);

  useEffect(() => {
    setLessonCompleted(lesson.status === 'completed');
    const nextMissingExercises =
      lesson.status === 'completed' ? [] : getMissingExercises(requiredExercises, lesson.exerciseProgress);
    const missingExerciseIds = new Set(nextMissingExercises.map(exercise => exercise.exerciseId));
    exerciseCompletionStateRef.current = new Map(
      requiredExercises.map(exercise => [
        exercise.exerciseId,
        { confirmed: !missingExerciseIds.has(exercise.exerciseId), pending: 0 },
      ])
    );
    setMissingExercises(nextMissingExercises);
    savedPageIdsRef.current = new Set();
    finishInProgressRef.current = false;
    setIsFinishPending(false);
    setCompletedExerciseCount(
      Math.max(
        0,
        Math.min(
          Math.max(safeCount(lesson.requiredExerciseCount), requiredExercises.length),
          safeCount(lesson.completedExerciseCount)
        )
      )
    );
    setRequiredExerciseCount(Math.max(safeCount(lesson.requiredExerciseCount), requiredExercises.length));
    setCurrentPageIndex(
      Math.max(0, Math.min(lesson.furthestPageIndex ?? lesson.currentPageIndex ?? 0, lesson.pages.length - 1))
    );
    setFurthestPageIndex(
      Math.max(0, Math.min(lesson.furthestPageIndex ?? lesson.currentPageIndex ?? 0, lesson.pages.length - 1))
    );
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset local completion only when switching lessons

  useEffect(() => {
    const pagePipelines = pagePipelinesRef.current;
    const exercisePipelines = exercisePipelinesRef.current;
    return () => {
      pagePipelines.forEach(cancelRetryController);
      pagePipelines.clear();
      exercisePipelines.forEach(cancelRetryController);
      exercisePipelines.clear();
    };
  }, [lesson.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    Sentry.setTag('lessonId', lesson.id);
    Sentry.setTag('runtimeMode', effectiveRuntimeMode);
    return () => {
      Sentry.setTag('lessonId', '');
      Sentry.setTag('runtimeMode', '');
      Sentry.setTag('pageId', '');
      Sentry.setTag('pageIndex', '');
    };
  }, [effectiveRuntimeMode, lesson.id]);

  useEffect(() => {
    if (!currentPage?.id) return;
    Sentry.setTag('pageId', currentPage.id);
    Sentry.setTag('pageIndex', String(currentPageIndex));
  }, [currentPage?.id, currentPageIndex]);

  useEffect(() => {
    if (!shouldTrackProgress || !user?.uid || !currentPage?.id) return;
    const isUntouchedLesson =
      lesson.status === 'available' &&
      (lesson.furthestPageIndex === undefined || lesson.furthestPageIndex < 0) &&
      currentPageIndex === 0;
    const shouldAutoCompleteSinglePassivePage = requiredExercises.length === 0 && totalPages === 1;
    if (isUntouchedLesson && !shouldAutoCompleteSinglePassivePage) return;
    const pageId = currentPage.id;
    if (savedPageIdsRef.current.has(pageId) || pagePipelinesRef.current.has(pageId)) return;

    const requestLessonId = lesson.id;
    const controller = createRetryController();
    pagePipelinesRef.current.set(pageId, controller);

    void runWithBoundedRetries(
      () => updatePageProgress({ userId: user.uid, lessonId: requestLessonId, pageId }).unwrap(),
      controller
    ).then(
      result => {
        if (pagePipelinesRef.current.get(pageId) === controller) pagePipelinesRef.current.delete(pageId);
        if (!result || !mountedRef.current || requestLessonId !== lessonIdRef.current) return;
        savedPageIdsRef.current.add(pageId);
        applyProgressMutation(result, requestLessonId);
      },
      error => {
        if (pagePipelinesRef.current.get(pageId) === controller) pagePipelinesRef.current.delete(pageId);
        if (!mountedRef.current || requestLessonId !== lessonIdRef.current) return;
        reportUnexpectedError(error, {
          tags: { surface: 'page_progress', lessonId: requestLessonId, pageId },
          includeExpected: true,
        });
        toast.error(getApiErrorMessage(error, 'Unable to save your page progress.'));
      }
    );
  }, [
    applyProgressMutation,
    currentPage?.id,
    currentPageIndex,
    lesson.furthestPageIndex,
    lesson.id,
    lesson.status,
    requiredExercises.length,
    shouldTrackProgress,
    totalPages,
    updatePageProgress,
    user?.uid,
  ]);

  const handleNext = useCallback(() => {
    if (currentPageIndex < totalPages - 1) {
      const newPageIndex = currentPageIndex + 1;
      setCurrentPageIndex(newPageIndex);
      setFurthestPageIndex(current => Math.max(current, newPageIndex));
    }
  }, [currentPageIndex, totalPages]);

  const handlePageComplete = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handlePrevious = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  }, [currentPageIndex]);

  const handleGoToPage = useCallback(
    (newPageIndex: number) => {
      if (newPageIndex < 0 || newPageIndex >= totalPages || newPageIndex === currentPageIndex) return;
      setCurrentPageIndex(newPageIndex);
      setFurthestPageIndex(current => Math.max(current, newPageIndex));
    },
    [currentPageIndex, totalPages]
  );

  const handleAudioEnded = useCallback(() => {
    const hasExercise = Boolean(currentPage?.items?.some(item => isExerciseType(item.type)));
    if (!hasExercise) handleNext();
  }, [currentPage?.items, handleNext]);

  const { audioRef, isPlaying, togglePlay } = useAudio(currentPage?.audioPath, handleAudioEnded);

  const trackPendingExerciseWrite = useCallback((write: Promise<unknown>) => {
    pendingExerciseWritesRef.current.add(write);
    void write.then(
      () => pendingExerciseWritesRef.current.delete(write),
      () => pendingExerciseWritesRef.current.delete(write)
    );
  }, []);

  const drainPendingExerciseWrites = useCallback(async () => {
    const deadline = Date.now() + PENDING_WRITE_FINISH_GRACE_MS;
    while (pendingExerciseWritesRef.current.size > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return true;
      const pending = Array.from(pendingExerciseWritesRef.current);
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>(resolve => {
        timeoutId = setTimeout(() => resolve('timeout'), remaining);
      });
      const completed = Promise.allSettled(pending).then(() => 'completed' as const);
      const outcome = await Promise.race([completed, timeout]);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (outcome === 'timeout') return true;
    }
    return false;
  }, []);

  const handleCompletionAccepted = useCallback(
    (exerciseId: string, score: number) => {
      if (!shouldTrackProgress || !user?.uid) return;

      const requestLessonId = lesson.id;
      const requiredExercise = requiredExercises.find(exercise => exercise.exerciseId === exerciseId);
      const completionState = exerciseCompletionStateRef.current.get(exerciseId) ?? {
        confirmed: false,
        pending: 0,
      };
      completionState.pending += 1;
      exerciseCompletionStateRef.current.set(exerciseId, completionState);
      setMissingExercises(current => current.filter(exercise => exercise.exerciseId !== exerciseId));
      const controller = createRetryController();
      exercisePipelinesRef.current.add(controller);
      const write = runWithBoundedRetries(
        () =>
          markExerciseComplete({
            userId: user.uid,
            lessonId: requestLessonId,
            exerciseId,
            score,
          }).unwrap(),
        controller
      );
      void write.then(
        () => exercisePipelinesRef.current.delete(controller),
        () => exercisePipelinesRef.current.delete(controller)
      );
      trackPendingExerciseWrite(write);
      void write.then(
        result => {
          if (result) {
            const latestState = exerciseCompletionStateRef.current.get(exerciseId);
            if (latestState) {
              latestState.confirmed = true;
              latestState.pending = Math.max(0, latestState.pending - 1);
            }
            applyProgressMutation(result, requestLessonId);
          }
        },
        error => {
          if (!mountedRef.current || requestLessonId !== lessonIdRef.current) return;
          const latestState = exerciseCompletionStateRef.current.get(exerciseId);
          if (latestState) {
            latestState.pending = Math.max(0, latestState.pending - 1);
            if (!latestState.confirmed && latestState.pending === 0 && requiredExercise) {
              setMissingExercises(current =>
                current.some(exercise => exercise.exerciseId === exerciseId)
                  ? current
                  : [...current, requiredExercise].sort((left, right) => left.pageIndex - right.pageIndex)
              );
            }
          }
          reportUnexpectedError(error, {
            tags: { surface: 'exercise_progress', lessonId: requestLessonId, exerciseId },
            includeExpected: true,
          });
          toast.error(getApiErrorMessage(error, 'Unable to save your exercise progress. Please try again.'));
        }
      );
    },
    [
      applyProgressMutation,
      lesson.id,
      markExerciseComplete,
      requiredExercises,
      shouldTrackProgress,
      trackPendingExerciseWrite,
      user?.uid,
    ]
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
        reportUnexpectedError(error, {
          tags: { surface: 'diagramming_attempt', lessonId: lesson.id, exerciseId },
          includeExpected: true,
        });
      }
    },
    [currentPageIndex, effectiveRuntimeMode, lesson.id, shouldTrackProgress, testAttemptId]
  );

  const isListeningLesson = lesson.type === 'listening';
  const handleFinishLesson = useCallback(async () => {
    if (!shouldTrackProgress) {
      toast.info('Preview mode: progress is not tracked.');
      return;
    }
    if (!user?.uid || !currentPage?.id) return;
    if (missingExercises.length > 0) return;

    if (finishInProgressRef.current) return;
    finishInProgressRef.current = true;
    setIsFinishPending(true);
    const finalPageId = currentPage.id;
    const requestLessonId = lesson.id;

    try {
      const timedOut = await drainPendingExerciseWrites();
      if (!mountedRef.current || requestLessonId !== lessonIdRef.current) return;
      if (timedOut && requestLessonId === lessonIdRef.current) {
        reportWatchedEvent('Lesson finish proceeded after pending-write timeout', {
          tags: { surface: 'finish_lesson_timeout', lessonId: requestLessonId },
          extra: { graceMs: PENDING_WRITE_FINISH_GRACE_MS },
        });
        toast.info('Some exercise progress is still saving. Checking lesson completion now.');
      }
      const result = await finishLesson({ userId: user.uid, lessonId: requestLessonId, finalPageId }).unwrap();
      if (!mountedRef.current || requestLessonId !== lessonIdRef.current) return;
      applyProgressMutation(result, requestLessonId);
      setMissingExercises([]);
      toast.success('Lesson completed!');
    } catch (error) {
      if (!mountedRef.current || requestLessonId !== lessonIdRef.current) return;
      const data = (error as { data?: { error?: string; missingExercises?: RequiredExercise[] } }).data;
      setMissingExercises(data?.missingExercises || []);
      reportUnexpectedError(error, {
        tags: { surface: 'finish_lesson', lessonId: requestLessonId },
        extra: data?.missingExercises ? { missingExerciseCount: data.missingExercises.length } : undefined,
        includeExpected: true,
      });
      toast.error(data?.error || getApiErrorMessage(error, 'Failed to finish the lesson.'));
    } finally {
      if (requestLessonId === lessonIdRef.current) {
        finishInProgressRef.current = false;
        if (mountedRef.current) setIsFinishPending(false);
      }
    }
  }, [
    applyProgressMutation,
    currentPage?.id,
    drainPendingExerciseWrites,
    finishLesson,
    lesson.id,
    missingExercises.length,
    shouldTrackProgress,
    user?.uid,
  ]);

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
        contentClassName={navigationPlacement === 'fixed' ? 'pb-28 sm:pb-24' : undefined}
        headerAside={
          shouldShowExerciseRing ? (
            <ExerciseCompletionRing
              completedCount={completedExerciseCount}
              requiredCount={requiredExerciseCount}
            />
          ) : undefined
        }
        iconAdornment={
          lessonCompleted ? (
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-roman-green text-white shadow-sm">
              <CheckCircle className="h-3.5 w-3.5" />
            </div>
          ) : undefined
        }>
        <div className="mb-6">
          <div className="lesson-content">
            <PageTemplate
              key={currentPage.id}
              page={currentPage}
              pageIndex={currentPageIndex}
              lessonId={lesson.id}
              runtimeMode={effectiveRuntimeMode}
              onAnswer={onAnswer}
              resolvedExerciseState={resolvedExerciseState}
              generatedExerciseContext={resolvedGeneratedExerciseContext}
              onCompletionAccepted={handleCompletionAccepted}
              onPageComplete={handlePageComplete}
              onDiagrammingAttempt={handleDiagrammingAttempt}
            />
          </div>
        </div>

        {shouldTrackProgress && currentPageIndex === totalPages - 1 && missingExercises.length > 0 && (
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
          furthestPageIndex={furthestPageIndex}
          totalPages={totalPages}
          isLessonCompleted={lessonCompleted}
          pageTitles={lesson.pages.map(page => page.title)}
          placement={navigationPlacement}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onFinish={handleFinishLesson}
          onGoToPage={handleGoToPage}
          onTogglePlay={togglePlay}
          isPlaying={isPlaying}
          hasAudio={hasAudio}
          isFinishing={isFinishPending || isFinishMutationLoading}
          isFinishBlocked={shouldTrackProgress && missingExercises.length > 0}
        />
      </RomanPlayerShell>
    </div>
  );
};

export default LessonPlayer;
