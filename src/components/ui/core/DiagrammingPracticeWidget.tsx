'use client';
import React from 'react';
import { memo } from 'react';
import { useRouter } from 'next/navigation';
import { LessonWithProgress } from '@/src/types/lesson';
import { Pencil } from 'lucide-react';
import { VocabularySwiper } from '@/src/components/ui/core/VocabularySwiper';

interface DiagrammingPracticeWidgetProps {
  lessons: LessonWithProgress[];
}

export const DiagrammingPracticeWidget = memo(({ lessons }: DiagrammingPracticeWidgetProps) => {
  const router = useRouter();

  const handlePracticeClick = (lessonId: string) => {
    router.push(`/lesson/${lessonId}`);
  };

  return (
    <div className="relative">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-l from-blue-400/30 to-blue-300/20 rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-r from-blue-500/25 to-blue-400/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
      </div>

      <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl border border-blue-400/20 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>

        {/* Header */}
        <div className="relative p-8 border-b border-blue-400/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 bg-gradient-to-br from-blue-400/20 via-blue-400/15 to-blue-100/10 rounded-2xl flex items-center justify-center shadow-lg border border-blue-400/30">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl"></div>
                <Pencil className="h-8 w-8 text-blue-600 drop-shadow-lg relative" />
              </div>
              <div>
                <h3 className="text-3xl font-serif text-gray-900 mb-1">Sentence Diagramming Practice</h3>
                <p className="text-lg text-roman-stone leading-relaxed">
                  Practice parsing and diagramming Latin sentences
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative p-8">
          {lessons.length === 0 ? (
            <div className="text-center py-16">
              <div className="relative h-24 w-24 bg-gradient-to-br from-gray-100 to-gray-50 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl"></div>
                <Pencil className="h-12 w-12 text-gray-300 relative" />
              </div>
              <h4 className="text-xl font-serif text-gray-700 mb-2">No lessons available</h4>
              <p className="text-gray-500 text-lg">Complete or start a lesson to practice diagramming</p>
            </div>
          ) : (
            <VocabularySwiper lessons={lessons} onPracticeClick={handlePracticeClick} />
          )}
        </div>
      </div>
    </div>
  );
});

DiagrammingPracticeWidget.displayName = 'DiagrammingPracticeWidget';
