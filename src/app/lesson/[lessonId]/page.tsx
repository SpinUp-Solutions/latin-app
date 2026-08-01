'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useGetStudentLessonQuery } from '@/src/store/api/lessonApi';
import Image from 'next/image';
import LessonPlayer from '@/src/components/ui/lesson/lesson-player';
import LessonSidebar from '@/src/components/ui/lesson/lesson-sidebar';
import PracticeSidebar from '@/src/components/ui/lesson/practice-sidebar';
import { FeedbackBanner } from '@/src/components/ui/core/feedback-banner';
import { useAuth } from '@/src/hooks/useAuth';

const SIDEBAR_COLLAPSE_KEY = 'lesson-sidebar-collapse';

const defaultCollapseState = { left: false, right: false };

export default function DynamicLessonPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.lessonId as string;
  const { user, loading: authLoading } = useAuth();

  const {
    data: currentLesson,
    isLoading: lessonsLoading,
    error,
  } = useGetStudentLessonQuery(
    { lessonId, userId: user?.uid ?? '' },
    {
      skip: !user?.uid,
    }
  );

  const [collapsed, setCollapsed] = useState<{ left: boolean; right: boolean }>(() => {
    if (typeof window === 'undefined') return defaultCollapseState;
    try {
      const stored = sessionStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      if (stored) return { ...defaultCollapseState, ...JSON.parse(stored) };
    } catch {
      /* ignore */
    }
    return defaultCollapseState;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const toggleLeft = () => setCollapsed(prev => ({ ...prev, left: !prev.left }));
  const toggleRight = () => setCollapsed(prev => ({ ...prev, right: !prev.right }));

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

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

  if (authLoading || !user || lessonsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (error) {
    const errorMessage = isLockedError
      ? 'Complete the previous lesson to unlock this one.'
      : 'The requested lesson could not be loaded.';
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
              priority
            />
            <h1 className="text-xl font-serif tracking-wide">Latin</h1>
          </Link>
        </header>
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <h2 className="text-2xl font-serif text-gray-800 mb-4">
                {isLockedError ? 'Lesson Locked' : 'Failed to Load Lesson'}
              </h2>
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

  if (!currentLesson) {
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
              priority
            />
            <h1 className="text-xl font-serif tracking-wide">Latin</h1>
          </Link>
        </header>
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <h2 className="text-2xl font-serif text-gray-800 mb-4">
                Lesson Not Found
              </h2>
              <p className="text-roman-stone">
                The requested lesson could not be found.
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
          className="flex items-center gap-3 rounded hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red">
          <Image
            src="/assets/logos/wakeforest_shield.png"
            alt="Wake Forest University"
            width={1000}
            height={736}
            className="h-10 w-auto"
            priority
          />
          <h1 className="text-xl font-serif tracking-wide">Wake Forest University Latin</h1>
        </Link>
      </header>

      <FeedbackBanner />

      <div className="flex flex-1 overflow-hidden">
        <LessonSidebar
          currentLessonId={lessonId}
          isCollapsed={collapsed.left}
          onToggleCollapse={toggleLeft}
        />
        <main className="flex-1 overflow-y-auto px-6 pt-6 pb-28">
          <div className="max-w-3xl mx-auto">
            <LessonPlayer key={currentLesson.id} lesson={currentLesson} />
          </div>
        </main>
        <PracticeSidebar
          currentLessonId={lessonId}
          showWordSearch={currentLesson.showWordSearch ?? true}
          isCollapsed={collapsed.right}
          onToggleCollapse={toggleRight}
        />
      </div>
    </div>
  );
}
