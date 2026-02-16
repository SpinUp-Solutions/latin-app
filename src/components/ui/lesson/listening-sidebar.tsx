'use client';

import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useGetStudentLessonsQuery } from '@/src/store/api/lessonApi';
import { Headphones, CheckCircle, Play } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';

interface ListeningSidebarProps {
  currentLessonId: string;
}

const listeningStatusConfig: Record<
  'completed' | 'available',
  {
    card: string;
    icon: string;
    iconBg: string;
    text: string;
    showIcon: JSX.Element;
  }
> = {
  completed: {
    card: 'bg-gradient-to-br from-roman-green/15 via-roman-green/10 to-emerald-100/5 border border-roman-green/20',
    icon: 'text-roman-green',
    iconBg: 'bg-gradient-to-br from-roman-green/20 to-emerald-100/10',
    text: 'Completed',
    showIcon: <CheckCircle className="h-5 w-5" />,
  },
  available: {
    card: 'bg-gradient-to-br from-purple-400/10 via-purple-300/5 to-purple-100/10 border border-purple-400/20',
    icon: 'text-purple-600',
    iconBg: 'bg-gradient-to-br from-purple-400/20 to-purple-300/10',
    text: 'Listen',
    showIcon: <Play className="h-5 w-5" />,
  },
};

export default function ListeningSidebar({ currentLessonId }: ListeningSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();

  const { data: studentLessons, isLoading } = useGetStudentLessonsQuery(undefined, {
    skip: !user?.uid,
  });

  const lessons = useMemo(() => {
    if (!studentLessons) return [];
    return studentLessons
      .filter(lesson => lesson.type === 'listening')
      .map(lesson => ({
        ...lesson,
        totalPages: lesson.pages.length,
      }));
  }, [studentLessons]);

  const handleLessonClick = useCallback(
    (lessonId: string) => {
      router.push(`/lesson/${lessonId}`);
    },
    [router]
  );

  if (isLoading) {
    return (
      <div className="w-80 flex-shrink-0 h-full flex flex-col bg-gradient-to-br from-purple-50 via-white to-purple-100/30 border-l border-purple-400/20 relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-l from-purple-400/20 to-purple-300/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
        </div>
        <div className="relative px-6 py-8 border-b border-purple-400/10 bg-white/40 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative h-12 w-12 bg-gradient-to-br from-purple-400/20 to-purple-300/10 rounded-xl flex items-center justify-center shadow-lg border border-purple-400/20">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl"></div>
              <Headphones className="h-6 w-6 text-purple-600 drop-shadow-lg relative" />
            </div>
            <div>
              <h3 className="text-2xl font-serif text-gray-800">Listening</h3>
            </div>
          </div>
          <p className="text-base text-roman-stone ml-15">Loading...</p>
        </div>
        <div className="flex-1 overflow-y-auto relative">
          <div className="relative flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 flex-shrink-0 h-full flex flex-col bg-gradient-to-br from-purple-50 via-white to-purple-100/30 border-l border-purple-400/20 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-l from-purple-400/20 to-purple-300/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-r from-purple-300/15 to-purple-200/10 rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
      </div>

      <div className="relative px-6 py-8 border-b border-purple-400/10 bg-white/40 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="relative h-12 w-12 bg-gradient-to-br from-purple-400/20 to-purple-300/10 rounded-xl flex items-center justify-center shadow-lg border border-purple-400/20">
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl"></div>
            <Headphones className="h-6 w-6 text-purple-600 drop-shadow-lg relative" />
          </div>
          <div>
            <h3 className="text-2xl font-serif text-gray-800">Listening</h3>
          </div>
        </div>
        <p className="text-base text-roman-stone ml-15">{lessons.length} lessons available</p>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        {lessons.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="relative h-16 w-16 bg-gradient-to-br from-purple-100 to-purple-50 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl"></div>
              <Headphones className="h-8 w-8 text-purple-400 relative" />
            </div>
            <p className="text-base text-gray-500">No listening lessons available</p>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {lessons.map(lesson => {
              const status = lesson.status === 'completed' ? 'completed' : 'available';
              const config = listeningStatusConfig[status];
              const isCurrentLesson = lesson.id === currentLessonId;

              return (
                <div
                  key={lesson.id}
                  onClick={() => handleLessonClick(lesson.id)}
                  className={`
                    group relative cursor-pointer transition-all duration-300 rounded-2xl shadow-lg hover:shadow-xl transform hover:-translate-y-1
                    ${config.card}
                    ${isCurrentLesson ? 'ring-2 ring-purple-500 ring-offset-2' : ''}
                  `}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl"></div>
                  <div className="relative p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`relative flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center shadow-md border ${config.iconBg} ${config.icon} border-current/20`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl"></div>
                        <div className="relative">{config.showIcon}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-serif text-gray-900 truncate mb-1">{lesson.title}</h4>
                        {lesson.description && (
                          <p className="text-sm text-roman-stone mt-1 line-clamp-2">{lesson.description}</p>
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
  );
}
