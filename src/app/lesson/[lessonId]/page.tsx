'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGetStudentLessonQuery } from '@/src/store/api/lessonApi';
import LessonPlayer from '@/src/components/ui/lesson/lesson-player';
import { FeedbackLessonDialog } from '@/src/components/student-feedback/FeedbackLessonDialog';
import { useAuth } from '@/src/hooks/useAuth';
import { PageLoading } from '@/src/components/ui/page-loading';
import { ConnectionRetryBanner } from '@/src/components/ui/core/connection-retry-banner';
import { shouldReportClientHardFail, reportUnexpectedError } from '@/src/lib/report-unexpected-error';
import { isRetryableApiError } from '@/src/store/api/baseQuery';

function LessonUnavailableScreen({
  title,
  message,
  onReturn,
  retry,
}: {
  title: string;
  message: string;
  onReturn: () => void;
  retry?: { fetching: boolean; onRetry: () => void };
}) {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="p-8 bg-white rounded-lg border border-border text-center">
          <h2 className="text-2xl font-serif text-gray-800 mb-4">{title}</h2>
          <p className="text-roman-stone">{message}</p>
          {retry && (
            <button
              type="button"
              onClick={retry.onRetry}
              disabled={retry.fetching}
              className="mt-4 mr-3 px-4 py-2 bg-roman-red text-white rounded hover:bg-roman-red/90 disabled:opacity-50">
              {retry.fetching ? 'Trying again…' : 'Try again'}
            </button>
          )}
          <button onClick={onReturn} className="mt-4 px-4 py-2 bg-roman-red text-white rounded hover:bg-roman-red/90">
            Return to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}

// The header and sidebars come from the `/lesson` layout (`LessonShell`); this
// page fills the centre column only.
export default function DynamicLessonPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.lessonId as string;
  const { user, authUid, loading: authLoading } = useAuth();

  const {
    currentData: currentLesson,
    isLoading: lessonsLoading,
    isFetching,
    refetch,
    error,
  } = useGetStudentLessonQuery(
    { lessonId, userId: user?.uid ?? '' },
    {
      skip: !user?.uid,
    }
  );

  const isLockedError =
    Boolean(error && 'status' in error && error.status === 403) ||
    Boolean(
      error &&
        'data' in error &&
        typeof error.data === 'object' &&
        error.data !== null &&
        'code' in error.data &&
        error.data.code === 'LESSON_LOCKED'
    );

  const hasCurrentLesson = currentLesson?.id === lessonId;
  const [allowCachedLesson, setAllowCachedLesson] = useState(true);
  const isRefreshFailure = allowCachedLesson && hasCurrentLesson && isRetryableApiError(error);

  useEffect(() => {
    if (isFetching) return;
    // Once the server rejects cached content, a later network failure must not
    // restore it. Only a successful load makes that content usable again.
    if (error && !isRetryableApiError(error)) setAllowCachedLesson(false);
    else if (!error && hasCurrentLesson) setAllowCachedLesson(true);
  }, [error, hasCurrentLesson, isFetching]);

  useEffect(() => {
    if (!error || isLockedError || isFetching) return;
    if (!shouldReportClientHardFail(error)) return;
    reportUnexpectedError(error, {
      tags: { surface: isRefreshFailure ? 'lesson_refresh' : 'lesson_load', lessonId },
      level: isRefreshFailure ? 'warning' : 'error',
      extra: { hasCurrentLesson, online: navigator.onLine, visibilityState: document.visibilityState },
    });
  }, [error, isLockedError, isFetching, isRefreshFailure, hasCurrentLesson, lessonId]);

  const isRequestedLessonLoading =
    lessonsLoading || (!hasCurrentLesson && isFetching) || Boolean(currentLesson && !hasCurrentLesson && !error);

  if (authLoading || !user || isRequestedLessonLoading) {
    return <PageLoading label="Loading lesson" className="min-h-0 flex-1" />;
  }

  if (error && !isRefreshFailure) {
    const errorMessage = isLockedError
      ? 'Complete the previous lesson to unlock this one.'
      : 'This lesson isn’t available right now.';
    return (
      <LessonUnavailableScreen
        title={isLockedError ? 'Lesson Locked' : 'We couldn’t open this lesson'}
        message={errorMessage}
        onReturn={() => router.push('/dashboard')}
        retry={isRetryableApiError(error) ? { fetching: isFetching, onRetry: () => void refetch() } : undefined}
      />
    );
  }

  if (!currentLesson) {
    return (
      <LessonUnavailableScreen
        title="Lesson Not Found"
        message="We couldn’t find this lesson."
        onReturn={() => router.push('/dashboard')}
      />
    );
  }

  return (
    <>
      {isRefreshFailure && (
        <ConnectionRetryBanner
          className="shrink-0"
          retrying={isFetching}
          onRetry={() => void refetch()}
          message="We’re having trouble connecting. Your place and answers are still here, but your progress may not be saved. Please try again."
        />
      )}

      <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-6 pt-4 sm:px-6 sm:pt-6">
        <div className="max-w-3xl mx-auto">
          <LessonPlayer
            lesson={currentLesson}
            headerActions={({ pageId, pageNumber, pauseAudio }) =>
              authUid && (
                <FeedbackLessonDialog
                  key={authUid}
                  onOpen={pauseAudio}
                  context={{ lessonId: currentLesson.id, lessonTitle: currentLesson.title, pageId, pageNumber }}
                />
              )
            }
          />
        </div>
      </main>
    </>
  );
}
