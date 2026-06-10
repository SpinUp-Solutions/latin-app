'use client';

import React, { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useGetStudentLessonsQuery } from '@/src/store/api/lessonApi';
import Image from 'next/image';
import LessonPlayer from '@/src/components/ui/lesson/lesson-player';
import LessonSidebar from '@/src/components/ui/lesson/lesson-sidebar';
import PracticeSidebar from '@/src/components/ui/lesson/practice-sidebar';
import { FeedbackBanner } from '@/src/components/ui/core/feedback-banner';

export default function DynamicLessonPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.lessonId as string;

  const { data: studentLessons, isLoading: loading, error } = useGetStudentLessonsQuery();

  const currentLesson = useMemo(() => {
    if (!studentLessons || !lessonId) return null;
    return studentLessons.find(lesson => lesson.id === lessonId);
  }, [studentLessons, lessonId]);

  const isLocked = currentLesson?.status === 'locked';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (error) {
    const errorMessage = 'status' in error ? `Error ${error.status}` : 'Failed to load lessons';
    return (
      <div className="min-h-screen bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red">
            <Image
              src="/assets/logos/wakeforest.png"
              alt="Wake Forest University"
              width={120}
              height={75}
              className="w-14 h-auto"
            />
            <h1 className="text-xl font-serif tracking-wide">Latin</h1>
          </Link>
        </header>
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <h2 className="text-2xl font-serif text-gray-800 mb-4">Failed to Load Lessons</h2>
              <p className="text-roman-stone">{errorMessage}</p>
              <button
                onClick={() => router.push('/dashboard')}
                className="mt-4 px-4 py-2 bg-roman-red text-white rounded hover:bg-roman-red/90">
                Return to Dashboard
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!currentLesson || isLocked) {
    return (
      <div className="min-h-screen bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red">
            <Image
              src="/assets/logos/wakeforest.png"
              alt="Wake Forest University"
              width={120}
              height={75}
              className="w-14 h-auto"
            />
            <h1 className="text-xl font-serif tracking-wide">Latin</h1>
          </Link>
        </header>
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <h2 className="text-2xl font-serif text-gray-800 mb-4">
                {isLocked ? 'Lesson Locked' : 'Lesson Not Found'}
              </h2>
              <p className="text-roman-stone">
                {isLocked
                  ? 'Complete the previous lesson to unlock this one.'
                  : 'The requested lesson could not be found.'}
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="mt-4 px-4 py-2 bg-roman-red text-white rounded hover:bg-roman-red/90">
                Return to Dashboard
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="flex items-center gap-2 rounded hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red">
          <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
            <span className="text-xl">L</span>
          </div>
          <h1 className="text-xl font-serif tracking-wide">Wake Forest University Latin</h1>
        </Link>
      </header>

      <FeedbackBanner />

      <div className="flex flex-1 overflow-hidden">
        <LessonSidebar currentLessonId={lessonId} />
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-serif text-gray-800 mb-6">{currentLesson.title}</h2>
            <LessonPlayer key={currentLesson.id} lesson={currentLesson} />
          </div>
        </main>
        <PracticeSidebar currentLessonId={lessonId} />
      </div>
    </div>
  );
}
