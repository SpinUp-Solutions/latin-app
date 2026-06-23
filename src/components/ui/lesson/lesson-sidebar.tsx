'use client';

import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useGetStudentLessonsQuery } from '@/src/store/api/lessonApi';
import { LessonStatus } from '@/src/types/lesson';
import { BookOpen, CheckCircle, Lock, Play, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth';
import { stripHtmlTags } from '@/src/utils/exercises';
import { cn } from '@/src/lib/utils';

interface LessonSidebarProps {
  currentLessonId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const sidebarStatusConfig: Record<
  LessonStatus,
  {
    card: string;
    icon: string;
    iconBg: string;
    text: string;
    showIcon: React.ReactElement | null;
  }
> = {
  completed: {
    card: 'bg-gradient-to-br from-roman-green/15 via-roman-green/10 to-emerald-100/5 border border-roman-green/20',
    icon: 'text-roman-green',
    iconBg: 'bg-gradient-to-br from-roman-green/20 to-emerald-100/10',
    text: 'Review',
    showIcon: <CheckCircle className="h-5 w-5" />,
  },
  available: {
    card: 'bg-gradient-to-br from-roman-stone/10 via-roman-stone/5 to-roman-marble/20 border border-roman-stone/20',
    icon: 'text-roman-stone',
    iconBg: 'bg-gradient-to-br from-roman-stone/20 to-gray-100/10',
    text: 'Start',
    showIcon: <Play className="h-5 w-5" />,
  },
  'in-progress': {
    card: 'bg-gradient-to-br from-roman-terracotta/15 via-roman-red/10 to-roman-terracotta/5 border border-roman-terracotta/20',
    icon: 'text-roman-terracotta',
    iconBg: 'bg-gradient-to-br from-roman-terracotta/20 to-roman-red/10',
    text: 'Continue',
    showIcon: <Play className="h-5 w-5" />,
  },
  locked: {
    card: 'bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 border border-gray-300/50 opacity-60',
    icon: 'text-gray-400',
    iconBg: 'bg-gradient-to-br from-gray-200 to-gray-100',
    text: 'Locked',
    showIcon: <Lock className="h-5 w-5" />,
  },
};

export default function LessonSidebar({ currentLessonId, isCollapsed = false, onToggleCollapse }: LessonSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();

  const { data: studentLessons, isLoading } = useGetStudentLessonsQuery(user?.uid, {
    skip: !user?.uid,
  });

  const lessons = useMemo(() => {
    if (!studentLessons) return [];
    return studentLessons
      .filter(lesson => lesson.type === 'normal')
      .map(lesson => ({
        ...lesson,
        totalPages: lesson.pages.length,
      }));
  }, [studentLessons]);

  const handleLessonClick = useCallback(
    (lessonId: string, status: LessonStatus) => {
      if (status === 'locked') {
        toast.error('Complete the previous lesson to unlock this one');
        return;
      }
      router.push(`/lesson/${lessonId}`);
    },
    [router]
  );

  const EXPANDED_WIDTH = '20rem';
  const COLLAPSED_WIDTH = '3rem';

  return (
    <div
      className="relative h-full flex-shrink-0 transition-[width] duration-300 ease-in-out"
      style={{ width: isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}>
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-roman-marble via-white to-roman-parchment border-r border-roman-red/20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-48 h-48 bg-gradient-to-r from-roman-gold/20 to-amber-300/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
          <div className="absolute bottom-0 right-0 w-48 h-48 bg-gradient-to-l from-roman-red/15 to-roman-terracotta/10 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
        </div>

        <div
          className={cn(
            'absolute top-0 bottom-0 left-0 w-80 flex flex-col transition-opacity duration-200',
            isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          )}>
          <div className="relative px-6 py-8 border-b border-roman-red/10 bg-white/40 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="relative h-12 w-12 bg-gradient-to-br from-roman-red/20 to-roman-terracotta/10 rounded-xl flex items-center justify-center shadow-lg border border-roman-red/20">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl" />
                <BookOpen className="h-6 w-6 text-roman-red drop-shadow-lg relative" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-2xl font-serif text-gray-800">Your Lessons</h3>
              </div>
            </div>
            <p className="text-base text-roman-stone ml-15">
              {isLoading ? 'Loading...' : `${lessons.length} lessons available`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto relative">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red" />
              </div>
            ) : lessons.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="relative h-16 w-16 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
                  <BookOpen className="h-8 w-8 text-gray-300 relative" />
                </div>
                <p className="text-base text-gray-500">No lessons available</p>
              </div>
            ) : (
              <div className="space-y-3 p-4">
                {lessons.map(lesson => {
                  const config = sidebarStatusConfig[lesson.status || 'available'];
                  const isCurrentLesson = lesson.id === currentLessonId;

                  return (
                    <div
                      key={lesson.id}
                      onClick={() => handleLessonClick(lesson.id, lesson.status || 'available')}
                      className={`
                        group relative cursor-pointer transition-all duration-300 rounded-2xl shadow-lg hover:shadow-xl transform hover:-translate-y-1
                        ${config.card}
                        ${isCurrentLesson ? 'ring-2 ring-roman-red ring-offset-2' : ''}
                        ${lesson.status === 'locked' ? 'cursor-not-allowed' : ''}
                      `}>
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
                      <div className="relative p-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`relative flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center shadow-md border ${config.iconBg} ${config.icon} border-current/20`}>
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl" />
                            <div className="relative">{config.showIcon || <BookOpen className="h-5 w-5" />}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-base font-serif text-gray-900 truncate mb-1">{lesson.title}</h4>
                            {lesson.description && (
                              <p className="text-sm text-roman-stone mt-1 line-clamp-2">
                                {stripHtmlTags(lesson.description)}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-2 text-xs text-roman-stone font-medium">
                              <span>{lesson.totalPages} pages</span>
                              {lesson.currentPageIndex !== undefined && lesson.currentPageIndex > 0 && (
                                <span>• Page {lesson.currentPageIndex + 1}</span>
                              )}
                            </div>

                            {typeof lesson.progress === 'number' && lesson.progress > 0 && (
                              <div className="mt-3">
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="text-xs text-gray-600 font-medium">Progress</span>
                                  <span className="text-xs font-semibold text-gray-700">{lesson.progress}%</span>
                                </div>
                                <div className="h-1.5 bg-white/50 rounded-full overflow-hidden shadow-inner">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      lesson.status === 'completed'
                                        ? 'bg-gradient-to-r from-roman-green to-emerald-600'
                                        : 'bg-gradient-to-r from-roman-red to-roman-terracotta'
                                    }`}
                                    style={{ width: `${lesson.progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center pt-5 transition-opacity duration-200',
            isCollapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}>
          <div className="relative h-10 w-10 bg-gradient-to-br from-roman-red/20 to-roman-terracotta/10 rounded-xl flex items-center justify-center shadow-lg border border-roman-red/20">
            <BookOpen className="h-5 w-5 text-roman-red" />
          </div>
          <span
            className="mt-6 text-xs font-medium uppercase tracking-wide text-roman-stone"
            style={{ writingMode: 'vertical-rl' }}>
            Lessons
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? 'Expand lessons sidebar' : 'Collapse lessons sidebar'}
        className="absolute top-1/2 -translate-y-1/2 left-full z-20 inline-flex h-10 w-6 items-center justify-center rounded-r-lg border border-roman-red/20 border-l-0 bg-white text-roman-red shadow-md transition-colors hover:bg-roman-red/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red">
        <ChevronLeft
          className="h-4 w-4 transition-transform duration-300"
          style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none' }}
        />
      </button>
    </div>
  );
}
