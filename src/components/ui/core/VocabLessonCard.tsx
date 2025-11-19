'use client';

import { memo } from 'react';
import React from 'react';
import { LessonWithProgress } from '@/src/types/lesson';
import { Button } from '@/src/components/ui/button';
import { CheckCircle, Clock } from 'lucide-react';

interface VocabLessonCardProps {
  lesson: LessonWithProgress;
  onPracticeClick: (id: string) => void;
}

const statusConfig = {
  completed: {
    badge: 'bg-roman-green text-white',
    icon: CheckCircle,
    text: 'Completed',
  },
  'in-progress': {
    badge: 'bg-roman-terracotta text-white',
    icon: Clock,
    text: 'In Progress',
  },
  available: {
    badge: 'bg-roman-gold text-white',
    icon: Clock,
    text: 'Ready to Practice',
  },
};

export const VocabLessonCard = memo(({ lesson, onPracticeClick }: VocabLessonCardProps) => {
  const config = statusConfig[lesson.status as keyof typeof statusConfig];

  if (!config) {
    return null;
  }

  const Icon = config.icon;
  const progress = typeof lesson.progress === 'number' ? lesson.progress : 0;

  return (
    <div className="group cursor-pointer transform hover:-translate-y-1 transition-all duration-300">
      <div className="relative bg-white rounded-2xl p-4 border border-roman-red/15 shadow-lg group-hover:shadow-xl transition-all duration-300 h-24">
        <div className="relative flex items-center h-full">
          <div
            className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${config.badge} shadow-md`}>
            <Icon className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0 ml-4">
            <h4 className="font-serif text-lg text-gray-900 truncate leading-tight">{lesson.title}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-roman-stone font-medium">{config.text}</span>
              {lesson.status === 'in-progress' && progress > 0 && (
                <span className="text-xs text-roman-red font-medium">{Math.round(progress)}%</span>
              )}
            </div>
          </div>

          <Button
            size="sm"
            onClick={() => onPracticeClick(lesson.id)}
            className="ml-3 bg-gradient-to-r from-roman-red to-roman-terracotta hover:from-roman-terracotta hover:to-roman-red text-white px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-all transform hover:scale-105 text-sm font-medium">
            Practice
          </Button>
        </div>
      </div>
    </div>
  );
});

VocabLessonCard.displayName = 'VocabLessonCard';
