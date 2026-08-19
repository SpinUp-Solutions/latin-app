'use client';

import React, { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGetLessonByIdQuery } from '@/src/store/api/lessonApi';
import LessonPlayer from '@/src/components/ui/lesson/lesson-player';
import { LessonWithProgress } from '@/src/types/lesson';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { useAppDispatch } from '@/src/store/hooks';
import { setLesson, resetLessonState } from '@/src/store/slices/lessonEditorSlice';

function AdminLessonPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const lessonId = params.id as string;

  const { data, isLoading, error } = useGetLessonByIdQuery({ lessonId });

  useEffect(() => {
    if (data?.lesson) {
      dispatch(setLesson(data.lesson));
    }
    return () => {
      dispatch(resetLessonState());
    };
  }, [data, dispatch]);

  const previewLesson: LessonWithProgress | null = useMemo(() => {
    if (!data?.lesson) return null;
    return {
      ...data.lesson,
      progress: 0,
      status: 'available' as const,
      currentPageIndex: 0,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (error || !previewLesson) {
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
              <h2 className="text-2xl font-serif text-gray-800 mb-4">Failed to Load Lesson</h2>
              <p className="text-roman-stone">The requested lesson could not be found.</p>
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
          Admin Preview Mode - Progress not tracked
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-serif text-gray-800 mb-6">{previewLesson.title}</h2>
          <LessonPlayer lesson={previewLesson} trackProgress={false} />
        </div>
      </main>
    </div>
  );
}

export default withAdminAuth(AdminLessonPreviewPage);
