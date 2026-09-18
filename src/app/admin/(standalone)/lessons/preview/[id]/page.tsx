'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGetLessonByIdQuery } from '@/src/store/api/lessonApi';
import LessonPlayer from '@/src/components/ui/lesson/lesson-player';
import { LessonWithProgress } from '@/src/types/lesson';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { useAppDispatch } from '@/src/store/hooks';
import { setLesson, resetLessonState } from '@/src/store/slices/lessonEditorSlice';
import { hasApiErrorStatus, isRetryableApiError } from '@/src/store/api/baseQuery';

function AdminLessonPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const lessonId = params.id as string;

  const { currentData: data, isLoading, isFetching, error, refetch } = useGetLessonByIdQuery({ lessonId });
  const hasCurrentLesson = data?.lesson.id === lessonId;
  const [allowCachedLesson, setAllowCachedLesson] = useState(true);
  const isRefreshFailure = allowCachedLesson && hasCurrentLesson && isRetryableApiError(error);
  const canShowLesson = hasCurrentLesson && (!error || isRefreshFailure);

  useEffect(() => {
    if (isFetching) return;
    // A later network failure must not restore content that the server rejected.
    // Only a successful read makes that cached lesson usable again.
    if (error && !isRetryableApiError(error)) setAllowCachedLesson(false);
    else if (!error && hasCurrentLesson) setAllowCachedLesson(true);
  }, [error, hasCurrentLesson, isFetching]);

  useEffect(() => {
    if (canShowLesson && data?.lesson) {
      dispatch(setLesson(data.lesson));
    }
    return () => {
      dispatch(resetLessonState());
    };
  }, [canShowLesson, data, dispatch]);

  const previewLesson: LessonWithProgress | null = useMemo(() => {
    if (!canShowLesson || !data?.lesson) return null;
    return {
      ...data.lesson,
      progress: 0,
      status: 'available' as const,
      currentPageIndex: 0,
    };
  }, [canShowLesson, data]);

  if (isLoading || (!hasCurrentLesson && isFetching)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (!previewLesson) {
    const errorMessage = hasApiErrorStatus(error, 404)
      ? 'We couldn’t find this lesson.'
      : hasApiErrorStatus(error, 401)
        ? 'Please sign in again to open this lesson.'
        : hasApiErrorStatus(error, 403)
          ? 'You don’t have permission to open this lesson.'
          : isRetryableApiError(error)
            ? 'Please try again in a moment.'
            : 'This lesson isn’t available right now. Please go back to your lessons.';
    return (
      <div className="min-h-screen bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3">
          <Button variant="ghost" onClick={() => router.push('/admin/lessons/manage')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Lessons
          </Button>
        </header>
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <h2 className="text-2xl font-serif text-gray-800 mb-4">We couldn’t open this lesson</h2>
              <p className="text-roman-stone">{errorMessage}</p>
              {isRetryableApiError(error) && (
                <Button type="button" className="mt-4" onClick={() => void refetch()} disabled={isFetching}>
                  {isFetching ? 'Trying again…' : 'Try again'}
                </Button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/admin/lessons/manage')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Lessons
        </Button>
        <div className="rounded border border-roman-gold/40 bg-roman-parchment px-3 py-1 text-sm text-foreground">
          Lesson preview — progress isn’t saved
        </div>
      </header>

      {isRefreshFailure && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">
          <span>
            We’re having trouble connecting. Your place and answers are still here. Please try again.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}>
            {isFetching ? 'Trying again…' : 'Try again'}
          </Button>
        </div>
      )}

      <main className="container mx-auto px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-serif text-gray-800 mb-6">
            <SimpleRichDisplay content={previewLesson.title} />
          </h2>
          <LessonPlayer
            key={previewLesson.id}
            lesson={previewLesson}
            trackProgress={false}
            generatedExerciseContext={{ kind: 'admin-preview' }}
          />
        </div>
      </main>
    </div>
  );
}

export default withAdminAuth(AdminLessonPreviewPage);
