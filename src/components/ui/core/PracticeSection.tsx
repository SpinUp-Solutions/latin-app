'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LessonWithProgress } from '@/src/types/lesson';
import { BookOpen, Pencil, Headphones, CheckCircle, Play } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';

type PracticeTab = 'vocab' | 'diagramming' | 'listening';

interface PracticeSectionProps {
  vocabLessons: LessonWithProgress[];
  diagrammingLessons: LessonWithProgress[];
  listeningLessons: LessonWithProgress[];
}

const tabConfig: Record<
  PracticeTab,
  {
    label: string;
    icon: React.ElementType;
    gradient: string;
    activeText: string;
    border: string;
    iconColor: string;
    emptyIcon: React.ElementType;
    emptyLabel: string;
  }
> = {
  vocab: {
    label: 'Vocabulary',
    icon: BookOpen,
    gradient: 'from-amber-500 to-amber-600',
    activeText: 'text-amber-700',
    border: 'border-amber-400/30',
    iconColor: 'text-amber-600',
    emptyIcon: BookOpen,
    emptyLabel: 'No vocabulary lessons available',
  },
  diagramming: {
    label: 'Diagramming',
    icon: Pencil,
    gradient: 'from-blue-500 to-blue-600',
    activeText: 'text-blue-700',
    border: 'border-blue-400/30',
    iconColor: 'text-blue-600',
    emptyIcon: Pencil,
    emptyLabel: 'No diagramming lessons available',
  },
  listening: {
    label: 'Listening',
    icon: Headphones,
    gradient: 'from-purple-500 to-purple-600',
    activeText: 'text-purple-700',
    border: 'border-purple-400/30',
    iconColor: 'text-purple-600',
    emptyIcon: Headphones,
    emptyLabel: 'No listening lessons available',
  },
};

export const PracticeSection: React.FC<PracticeSectionProps> = ({
  vocabLessons,
  diagrammingLessons,
  listeningLessons,
}) => {
  const [activeTab, setActiveTab] = useState<PracticeTab>('vocab');
  const router = useRouter();

  const lessonsMap: Record<PracticeTab, LessonWithProgress[]> = {
    vocab: vocabLessons,
    diagramming: diagrammingLessons,
    listening: listeningLessons,
  };

  const hasAnyLessons = vocabLessons.length > 0 || diagrammingLessons.length > 0 || listeningLessons.length > 0;
  if (!hasAnyLessons) return null;

  const currentLessons = lessonsMap[activeTab];
  const config = tabConfig[activeTab];
  const EmptyIcon = config.emptyIcon;

  return (
    <div className="relative">
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-l from-roman-gold/30 to-amber-300/20 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-r from-roman-red/25 to-roman-terracotta/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
      </div>

      <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl border border-roman-red/20 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />

        <div className="relative p-8 border-b border-roman-red/10">
          <h3 className="text-3xl font-serif text-gray-900 mb-6">Practice</h3>

          <div className="flex gap-3">
            {(Object.keys(tabConfig) as PracticeTab[]).map(tab => {
              const tc = tabConfig[tab];
              const Icon = tc.icon;
              const count = lessonsMap[tab].length;
              const isActive = activeTab === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? `bg-gradient-to-r ${tc.gradient} text-white shadow-lg`
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}>
                  <Icon className="h-4 w-4" />
                  {tc.label}
                  <span
                    className={cn(
                      'ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold',
                      isActive ? 'bg-white/20' : 'bg-gray-200'
                    )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative p-8">
          {currentLessons.length === 0 ? (
            <div className="text-center py-16">
              <div className="relative h-24 w-24 bg-gradient-to-br from-gray-100 to-gray-50 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl" />
                <EmptyIcon className="h-12 w-12 text-gray-300 relative" />
              </div>
              <h4 className="text-xl font-serif text-gray-700 mb-2">{config.emptyLabel}</h4>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentLessons.map(lesson => {
                const isCompleted = lesson.status === 'completed';

                return (
                  <div
                    key={lesson.id}
                    onClick={() => router.push(`/lesson/${lesson.id}`)}
                    className={cn(
                      'group relative cursor-pointer rounded-2xl p-4 transition-all duration-300 hover:shadow-lg transform hover:-translate-y-1',
                      isCompleted
                        ? 'bg-gradient-to-br from-roman-green/10 to-emerald-50 border border-roman-green/20'
                        : `bg-gradient-to-br from-gray-50 to-white border ${config.border}`
                    )}>
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center',
                          isCompleted ? 'bg-roman-green/15 text-roman-green' : `bg-gray-100 ${config.iconColor}`
                        )}>
                        {isCompleted ? <CheckCircle className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-serif text-gray-900 truncate">{lesson.title}</h4>
                        {lesson.description && (
                          <p className="text-sm text-roman-stone mt-1 line-clamp-2">
                            {stripHtmlTags(lesson.description)}
                          </p>
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
    </div>
  );
};
