'use client';

import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useGetStudentDashboardQuery } from '@/src/store/api/lessonApi';
import { LessonStatus, type StudentLearningUnitSummary } from '@/src/types/lesson';
import { BookOpen, CheckCircle, Lock, Play, ChevronLeft, FileCheck2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
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

  const {
    data: studentDashboard,
    isLoading,
    isError,
    refetch,
  } = useGetStudentDashboardQuery(user?.uid ?? '', {
    skip: !user?.uid,
  });

  const learningUnits = useMemo(() => {
    return studentDashboard?.learningPath ?? [];
  }, [studentDashboard]);

  const handleUnitClick = useCallback(
    (unit: StudentLearningUnitSummary) => {
      if (unit.status === 'locked') {
        toast.error(unit.lockedReason || 'Complete the previous learning unit to unlock this one');
        return;
      }
      router.push(unit.kind === 'test' ? `/test/${unit.id}` : `/lesson/${unit.id}`);
    },
    [router]
  );

  return (
    <div
      className={cn(
        'relative h-full flex-shrink-0 transition-[width] duration-300 ease-in-out max-[640px]:w-0',
        isCollapsed ? 'w-12' : 'w-12 min-[901px]:w-80'
      )}>
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-roman-marble via-white to-roman-parchment border-r border-roman-red/20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-48 h-48 bg-gradient-to-r from-roman-gold/20 to-amber-300/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
          <div className="absolute bottom-0 right-0 w-48 h-48 bg-gradient-to-l from-roman-red/15 to-roman-terracotta/10 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
        </div>

        <div
          className={cn(
            'absolute top-0 bottom-0 left-0 w-80 flex flex-col transition-opacity duration-200',
            isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100',
            'max-[900px]:pointer-events-none max-[900px]:opacity-0'
          )}>
          <div className="relative px-6 py-8 border-b border-roman-red/10 bg-white/40 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="relative h-12 w-12 bg-gradient-to-br from-roman-red/20 to-roman-terracotta/10 rounded-xl flex items-center justify-center shadow-lg border border-roman-red/20">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl" />
                <BookOpen className="h-6 w-6 text-roman-red drop-shadow-lg relative" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-2xl font-serif text-gray-800">Your Learning Path</h3>
              </div>
            </div>
            <p className="text-base text-roman-stone ml-15">
              {isLoading
                ? 'Loading...'
                : isError
                  ? 'Unable to load your path'
                  : `${learningUnits.length} learning units available`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto relative">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red" />
              </div>
            ) : isError ? (
              <div className="space-y-3 px-6 py-12 text-center">
                <p className="text-sm text-gray-600">Your Learning Path could not be loaded.</p>
                <button
                  type="button"
                  className="rounded-lg bg-roman-red px-4 py-2 text-sm font-medium text-white hover:bg-roman-red/90"
                  onClick={() => void refetch()}>
                  Retry
                </button>
              </div>
            ) : learningUnits.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="relative h-16 w-16 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
                  <BookOpen className="h-8 w-8 text-gray-300 relative" />
                </div>
                <p className="text-base text-gray-500">No learning units available</p>
              </div>
            ) : (
              <div className="space-y-3 p-4">
                {learningUnits.map(unit => {
                  const config = sidebarStatusConfig[unit.status || 'available'];
                  const isTest = unit.kind === 'test';
                  const isCurrentLesson = unit.id === currentLessonId;

                  return (
                    <button
                      type="button"
                      key={unit.id}
                      onClick={() => handleUnitClick(unit)}
                      aria-current={isCurrentLesson ? 'page' : undefined}
                      aria-disabled={unit.status === 'locked'}
                      className={`
                        group relative w-full cursor-pointer rounded-2xl text-left shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl
                        ${isTest ? 'border border-indigo-200 bg-gradient-to-br from-indigo-100 via-violet-50 to-white' : config.card}
                        ${isCurrentLesson ? 'ring-2 ring-roman-red ring-offset-2' : ''}
                        ${unit.status === 'locked' ? 'cursor-not-allowed opacity-60' : ''}
                      `}>
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
                      <div className="relative p-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`relative flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center shadow-md border ${
                              isTest
                                ? 'border-indigo-300 bg-indigo-700 text-white'
                                : `${config.iconBg} ${config.icon} border-current/20`
                            }`}>
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-xl" />
                            <div className="relative">
                              {isTest ? (
                                <FileCheck2 className="h-5 w-5" />
                              ) : (
                                config.showIcon || <BookOpen className="h-5 w-5" />
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="min-w-0 flex-1 truncate text-base font-serif text-gray-900">
                                <SimpleRichDisplay content={unit.title} className="truncate" />
                              </h4>
                              {isTest && (
                                <span className="rounded-full bg-indigo-700 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
                                  TEST
                                </span>
                              )}
                            </div>
                            {unit.description && (
                              <div className="mt-1 line-clamp-2 text-sm text-roman-stone">
                                <SimpleRichDisplay content={unit.description} />
                              </div>
                            )}

                            <div className="flex items-center gap-2 mt-2 text-xs text-roman-stone font-medium">
                              {unit.kind === 'test' ? (
                                <span>
                                  {unit.passingPercentage === null ? 'Score only' : `Pass ≥ ${unit.passingPercentage}%`}
                                </span>
                              ) : (
                                <>
                                  <span>{unit.totalPages} pages</span>
                                  {unit.currentPageIndex !== undefined && unit.currentPageIndex > 0 && (
                                    <span>• Page {unit.currentPageIndex + 1}</span>
                                  )}
                                </>
                              )}
                            </div>

                            {unit.status === 'locked' && unit.lockedReason && (
                              <p className="mt-2 text-xs font-medium text-gray-600">{unit.lockedReason}</p>
                            )}

                            {unit.kind === 'lesson' && typeof unit.progress === 'number' && unit.progress > 0 && (
                              <div className="mt-3">
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="text-xs text-gray-600 font-medium">Progress</span>
                                  <span className="text-xs font-semibold text-gray-700">{unit.progress}%</span>
                                </div>
                                <div className="h-1.5 bg-white/50 rounded-full overflow-hidden shadow-inner">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      unit.status === 'completed'
                                        ? 'bg-gradient-to-r from-roman-green to-emerald-600'
                                        : 'bg-gradient-to-r from-roman-red to-roman-terracotta'
                                    }`}
                                    style={{ width: `${unit.progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center pt-5 transition-opacity duration-200',
            isCollapsed ? 'opacity-100' : 'opacity-0 pointer-events-none',
            'max-[640px]:pointer-events-none max-[640px]:opacity-0 max-[900px]:opacity-100'
          )}>
          <div className="relative h-10 w-10 bg-gradient-to-br from-roman-red/20 to-roman-terracotta/10 rounded-xl flex items-center justify-center shadow-lg border border-roman-red/20">
            <BookOpen className="h-5 w-5 text-roman-red" />
          </div>
          <span
            className="mt-6 text-xs font-medium uppercase tracking-wide text-roman-stone"
            style={{ writingMode: 'vertical-rl' }}>
            Path
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? 'Expand lessons sidebar' : 'Collapse lessons sidebar'}
        className="absolute left-full top-1/2 z-20 inline-flex h-10 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-roman-red/20 bg-white text-roman-red shadow-md transition-colors hover:bg-roman-red/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red max-[900px]:hidden">
        <ChevronLeft
          className="h-4 w-4 transition-transform duration-300"
          style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none' }}
        />
      </button>
    </div>
  );
}
