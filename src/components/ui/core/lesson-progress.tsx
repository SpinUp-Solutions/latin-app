import React from 'react';
import { cn } from '@/src/lib/utils';

interface LessonProgressProps {
  currentPage: number;
  totalPages: number;
  className?: string;
}

export const LessonProgress: React.FC<LessonProgressProps> = ({ currentPage, totalPages, className }) => {
  const progressPercentage = Math.round(((currentPage + 1) / totalPages) * 100);
  const pageText = `${currentPage + 1}/${totalPages}`;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-roman-stone font-medium">Page {pageText}</span>
        <span className="text-roman-stone font-medium">{progressPercentage}%</span>
      </div>

      <div className="w-full bg-roman-parchment/30 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-roman-red rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
};
