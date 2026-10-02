'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Pencil } from 'lucide-react';
import { useGetStudentLessonQuery } from '@/src/store/api/lessonApi';
import LessonSidebar from '@/src/components/ui/lesson/lesson-sidebar';
import PracticeSidebar from '@/src/components/ui/lesson/practice-sidebar';
import { useAuth } from '@/src/hooks/useAuth';
import { PageLoading } from '@/src/components/ui/page-loading';

const SIDEBAR_COLLAPSE_KEY = 'lesson-sidebar-collapse';

const defaultCollapseState = { left: true, right: true };
const desktopCollapseState = { left: false, right: false };

function isNarrowViewport() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 900px)').matches
  );
}

/**
 * Header and sidebars shared by every lesson. Rendered from the `/lesson`
 * layout so they stay mounted while the lesson in the centre column changes.
 */
export default function LessonShell({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.lessonId as string;
  const { user, loading: authLoading } = useAuth();

  // Shares the page's cache entry. `data` keeps the previous lesson's value
  // while the next lesson loads, so the word search does not flicker.
  const { data: lastLoadedLesson } = useGetStudentLessonQuery(
    { lessonId, userId: user?.uid ?? '' },
    { skip: !user?.uid || !lessonId }
  );

  const [collapsed, setCollapsed] = useState<{ left: boolean; right: boolean }>(() => {
    if (typeof window === 'undefined') return defaultCollapseState;
    if (isNarrowViewport()) return defaultCollapseState;
    try {
      const stored = sessionStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      if (stored) return { ...desktopCollapseState, ...JSON.parse(stored) };
    } catch {
      /* ignore */
    }
    return desktopCollapseState;
  });

  // On narrow screens the sidebars are overlays; close them once the student
  // has picked another lesson.
  const [shownLessonId, setShownLessonId] = useState(lessonId);
  if (shownLessonId !== lessonId) {
    setShownLessonId(lessonId);
    if (isNarrowViewport()) setCollapsed(defaultCollapseState);
  }

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

  if (authLoading || !user) {
    return <PageLoading label="Loading lesson" />;
  }

  return (
    <div className="h-screen flex flex-col bg-roman-marble">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 py-3">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="flex min-w-0 items-center gap-3 rounded hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red">
          <Image
            src="/assets/logos/wakeforest_shield.png"
            alt="Wake Forest University"
            width={1000}
            height={736}
            className="h-10 w-auto shrink-0"
            priority
          />
          <h1 className="truncate font-serif text-lg tracking-wide sm:text-xl">Wake Forest University Latin</h1>
        </Link>
        <div className="flex shrink-0 items-center gap-2 min-[901px]:hidden">
          <button
            type="button"
            onClick={toggleLeft}
            aria-label="Open lessons sidebar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-roman-red/20 bg-white text-roman-red">
            <BookOpen className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggleRight}
            aria-label="Open practice sidebar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-roman-red/20 bg-white text-roman-red">
            <Pencil className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <LessonSidebar currentLessonId={lessonId} isCollapsed={collapsed.left} onToggleCollapse={toggleLeft} />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        <PracticeSidebar
          currentLessonId={lessonId}
          showWordSearch={lastLoadedLesson?.showWordSearch ?? true}
          isCollapsed={collapsed.right}
          onToggleCollapse={toggleRight}
        />
      </div>
    </div>
  );
}
