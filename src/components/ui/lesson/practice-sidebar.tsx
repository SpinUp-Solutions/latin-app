'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGetStudentDashboardQuery } from '@/src/store/api/lessonApi';
import { BookOpen, Pencil, Headphones, CheckCircle, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/src/lib/utils';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import WordSearchPanel from './word-search-panel';

type PracticeView = 'vocab' | 'sentence-diagramming' | 'listening';

interface PracticeSidebarProps {
  currentLessonId: string;
  showWordSearch?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const sectionConfig: Record<
  PracticeView,
  {
    label: string;
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    iconBorder: string;
    headerBg: string;
    border: string;
    ringColor: string;
    emptyLabel: string;
    lessonType: string;
  }
> = {
  vocab: {
    label: 'Vocabulary',
    icon: BookOpen,
    iconColor: 'text-amber-600',
    iconBg: 'bg-gradient-to-br from-amber-400/20 to-amber-300/10',
    iconBorder: 'border-amber-400/30',
    headerBg: 'hover:bg-amber-50/40',
    border: 'border-amber-400/30',
    ringColor: 'ring-amber-500',
    emptyLabel: 'No vocabulary lessons available',
    lessonType: 'vocab',
  },
  'sentence-diagramming': {
    label: 'Diagramming',
    icon: Pencil,
    iconColor: 'text-blue-600',
    iconBg: 'bg-gradient-to-br from-blue-400/20 to-blue-300/10',
    iconBorder: 'border-blue-400/30',
    headerBg: 'hover:bg-blue-50/40',
    border: 'border-blue-400/30',
    ringColor: 'ring-blue-500',
    emptyLabel: 'No diagramming lessons available',
    lessonType: 'sentence-diagramming',
  },
  listening: {
    label: 'Listening',
    icon: Headphones,
    iconColor: 'text-purple-600',
    iconBg: 'bg-gradient-to-br from-purple-400/20 to-purple-300/10',
    iconBorder: 'border-purple-400/30',
    headerBg: 'hover:bg-purple-50/40',
    border: 'border-purple-400/30',
    ringColor: 'ring-purple-500',
    emptyLabel: 'No listening lessons available',
    lessonType: 'listening',
  },
};

const sectionOrder: PracticeView[] = ['vocab', 'sentence-diagramming', 'listening'];

const EXPANDED_SECTIONS_KEY = 'practice-sidebar-expanded';

const defaultExpanded: Record<PracticeView, boolean> = {
  vocab: false,
  'sentence-diagramming': false,
  listening: false,
};

export default function PracticeSidebar({
  currentLessonId,
  showWordSearch = true,
  isCollapsed = false,
  onToggleCollapse,
}: PracticeSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Record<PracticeView, boolean>>(() => {
    if (typeof window === 'undefined') return defaultExpanded;
    try {
      const stored = sessionStorage.getItem(EXPANDED_SECTIONS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      /* ignore */
    }
    return defaultExpanded;
  });
  const router = useRouter();
  const { user } = useAuth();

  // Persist expanded sections to sessionStorage on change
  useEffect(() => {
    try {
      sessionStorage.setItem(EXPANDED_SECTIONS_KEY, JSON.stringify(expandedSections));
    } catch {
      /* ignore */
    }
  }, [expandedSections]);

  const { data: studentDashboard, isLoading } = useGetStudentDashboardQuery(user?.uid ?? '', {
    skip: !user?.uid,
  });

  const handleLessonClick = useCallback(
    (lessonId: string) => {
      router.push(`/lesson/${lessonId}`);
    },
    [router]
  );

  const toggleSection = (section: PracticeView) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getLessonsForType = (lessonType: string) => {
    if (!studentDashboard) return [];
    return studentDashboard.practiceLessons.filter(lesson => lesson.type === lessonType);
  };

  return (
    <>
      {!isCollapsed && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 min-[901px]:hidden"
          aria-label="Close practice sidebar"
          onClick={onToggleCollapse}
        />
      )}
      <div
        className={cn(
          'relative h-full shrink-0 transition-[width] duration-300 ease-in-out',
          isCollapsed ? 'w-0 min-[901px]:w-12' : 'w-0 min-[901px]:w-80'
        )}>
      <div
        className={cn(
          'overflow-hidden border-l border-roman-red/20 bg-gradient-to-br from-roman-marble via-white to-roman-parchment',
          isCollapsed
            ? 'hidden min-[901px]:absolute min-[901px]:inset-0 min-[901px]:block'
            : 'fixed inset-y-0 right-0 z-40 w-80 min-[901px]:absolute min-[901px]:inset-0 min-[901px]:w-auto'
        )}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-l from-roman-gold/20 to-amber-300/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-r from-roman-red/15 to-roman-terracotta/10 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
        </div>

        <div
          hidden={isCollapsed}
          style={{ display: isCollapsed ? 'none' : undefined }}
          className={cn(
            'absolute inset-0 flex flex-col',
            isCollapsed && 'pointer-events-none'
          )}>
          <div className="relative px-6 py-8 border-b border-roman-red/10 bg-white/40 backdrop-blur-sm flex-shrink-0">
            <h3 className="text-2xl font-serif text-gray-800">Practice</h3>
            <p className="text-base text-roman-stone">{isLoading ? 'Loading...' : 'Browse lessons by type'}</p>
          </div>

          {showWordSearch && (
            <div className="relative flex-shrink-0">
              <WordSearchPanel />
            </div>
          )}

          <div className="flex-1 overflow-y-auto relative">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red" />
              </div>
            ) : (
              <div className="py-2">
                {sectionOrder.map(sectionKey => {
                  const config = sectionConfig[sectionKey];
                  const Icon = config.icon;
                  const lessons = getLessonsForType(config.lessonType);
                  const isExpanded = expandedSections[sectionKey];

                  return (
                    <div key={sectionKey}>
                      <button
                        onClick={() => toggleSection(sectionKey)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-4 transition-colors duration-200',
                          config.headerBg
                        )}>
                        <div
                          className={cn(
                            'h-11 w-11 rounded-xl flex items-center justify-center border shadow-sm',
                            config.iconBg,
                            config.iconBorder,
                            config.iconColor
                          )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 text-left">
                          <span className="text-base font-serif text-gray-800">{config.label}</span>
                          <p className="text-xs text-roman-stone">
                            {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
                          </p>
                        </div>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 text-gray-400 transition-transform duration-200',
                            isExpanded && 'rotate-180'
                          )}
                        />
                      </button>

                      {isExpanded && (
                        <div className="pb-2">
                          {lessons.length === 0 ? (
                            <p className="px-6 py-4 text-sm text-gray-400 text-center">{config.emptyLabel}</p>
                          ) : (
                            <div className="max-h-72 overflow-y-auto space-y-2 px-4 py-2">
                              {lessons.map(lesson => {
                                const isCompleted = lesson.status === 'completed';
                                const isCurrentLesson = lesson.id === currentLessonId;

                                return (
                                  <div
                                    key={lesson.id}
                                    onClick={() => handleLessonClick(lesson.id)}
                                    className={cn(
                                      'group cursor-pointer rounded-2xl p-3 transition-all duration-300 hover:shadow-lg transform hover:-translate-y-1',
                                      isCompleted
                                        ? 'bg-gradient-to-br from-roman-green/10 to-emerald-50 border border-roman-green/20'
                                        : `bg-gradient-to-br from-gray-50 to-white border ${config.border}`,
                                      isCurrentLesson && `ring-2 ${config.ringColor} ring-offset-2`
                                    )}>
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={cn(
                                          'flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center',
                                          isCompleted
                                            ? 'bg-roman-green/15 text-roman-green'
                                            : `bg-gray-100 ${config.iconColor}`
                                        )}>
                                        {isCompleted ? (
                                          <CheckCircle className="h-4 w-4" />
                                        ) : (
                                          <Play className="h-4 w-4" />
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-serif text-gray-900 truncate">
                                          <SimpleRichDisplay content={lesson.title} className="truncate" />
                                        </h4>
                                        {lesson.description && (
                                          <div className="mt-0.5 line-clamp-1 text-xs text-roman-stone">
                                            <SimpleRichDisplay content={lesson.description} />
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div
          hidden={!isCollapsed}
          style={{ display: isCollapsed ? undefined : 'none' }}
          className="absolute inset-0 hidden flex-col items-center pt-5 min-[901px]:flex">
          <div className="relative h-10 w-10 bg-gradient-to-br from-roman-red/20 to-roman-terracotta/10 rounded-xl flex items-center justify-center shadow-lg border border-roman-red/20">
            <Pencil className="h-5 w-5 text-roman-red" />
          </div>
          <span
            className="mt-6 text-xs font-medium uppercase tracking-wide text-roman-stone"
            style={{ writingMode: 'vertical-rl' }}>
            Practice
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? 'Expand practice sidebar' : 'Collapse practice sidebar'}
        className="absolute right-full top-1/2 z-20 hidden h-10 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-roman-red/20 bg-white text-roman-red shadow-md transition-colors hover:bg-roman-red/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red min-[901px]:inline-flex">
        <ChevronRight
          className="h-4 w-4 transition-transform duration-300"
          style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none' }}
        />
      </button>
    </div>
    </>
  );
}
