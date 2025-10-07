'use client';

import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { useGetStudentLessonsQuery } from '@/src/store/api/lessonApi';
import { LessonStatus } from '@/src/types/lesson';
import { BookOpen, CheckCircle, Lock, Play } from 'lucide-react';
import { toast } from 'sonner';
import type { RootState } from '@/src/store';

interface LessonSidebarProps {
  currentLessonId: string;
  className?: string;
}

const sidebarStatusConfig: Record<
  LessonStatus,
  {
    card: string;
    icon: string;
    text: string;
    showIcon: JSX.Element | null;
  }
> = {
  completed: {
    card: 'border-l-4 border-l-roman-green bg-roman-green/5',
    icon: 'text-roman-green',
    text: 'Review',
    showIcon: <CheckCircle className="h-4 w-4" />,
  },
  available: {
    card: 'border-l-4 border-l-roman-stone bg-roman-stone/5 hover:bg-roman-stone/10',
    icon: 'text-roman-stone',
    text: 'Start',
    showIcon: <Play className="h-4 w-4" />,
  },
  'in-progress': {
    card: 'border-l-4 border-l-roman-terracotta bg-roman-terracotta/5',
    icon: 'text-roman-terracotta',
    text: 'Continue',
    showIcon: <Play className="h-4 w-4" />,
  },
  locked: {
    card: 'border-l-4 border-l-gray-300 bg-gray-100 opacity-60',
    icon: 'text-gray-400',
    text: 'Locked',
    showIcon: <Lock className="h-4 w-4" />,
  },
};

export default function LessonSidebar({ currentLessonId, className = '' }: LessonSidebarProps) {
  const router = useRouter();
  const { user } = useSelector((state: RootState) => state.auth);

  const { data: studentLessons, isLoading } = useGetStudentLessonsQuery(undefined, {
    skip: !user?.uid,
  });

  const lessons = useMemo(() => {
    if (!studentLessons) return [];
    return studentLessons.map(lesson => ({
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

  if (isLoading) {
    return (
      <div className={`w-80 border-r border-border bg-white flex-shrink-0 ${className}`}>
        <div className="px-4 py-6 border-b border-border">
          <h3 className="text-lg font-serif text-gray-800">Your Lessons</h3>
          <p className="text-sm text-roman-stone">Loading...</p>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-roman-red"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-80 border-r border-border bg-white flex-shrink-0 flex flex-col ${className}`}>
      <div className="px-4 py-6 border-b border-border">
        <h3 className="text-lg font-serif text-gray-800">Your Lessons</h3>
        <p className="text-sm text-roman-stone">{lessons.length} lessons available</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {lessons.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <BookOpen className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No lessons available</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {lessons.map(lesson => {
              const config = sidebarStatusConfig[lesson.status || 'available'];
              const isCurrentLesson = lesson.id === currentLessonId;

              return (
                <div
                  key={lesson.id}
                  onClick={() => handleLessonClick(lesson.id, lesson.status || 'available')}
                  className={`
                    px-3 py-4 cursor-pointer transition-colors duration-150 rounded-md
                    ${config.card}
                    ${
                      isCurrentLesson
                        ? 'bg-roman-red/10 border-l-roman-red'
                        : lesson.status === 'locked'
                          ? 'cursor-not-allowed'
                          : ''
                    }
                  `}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 ${config.icon}`}>
                      {config.showIcon || <BookOpen className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 truncate">{lesson.title}</h4>
                      {lesson.description && (
                        <p className="text-xs text-roman-stone mt-1 line-clamp-2">{lesson.description}</p>
                      )}

                      <div className="flex items-center gap-2 mt-2 text-xs text-roman-stone">
                        <span>{lesson.totalPages} pages</span>
                        {lesson.currentPageIndex !== undefined && <span>• Page {lesson.currentPageIndex + 1}</span>}
                      </div>

                      {typeof lesson.progress === 'number' && lesson.progress > 0 && (
                        <div className="mt-2">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-600">Progress</span>
                            <span className="text-xs font-medium">{lesson.progress}%</span>
                          </div>
                          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                lesson.status === 'completed' ? 'bg-roman-green' : 'bg-roman-red'
                              }`}
                              style={{ width: `${lesson.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
