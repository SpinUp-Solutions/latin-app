'use client';
import React from 'react';
import { memo } from 'react';
import { useRouter } from 'next/navigation';
import { LessonWithProgress } from '@/src/types/lesson';
import { Button } from '@/src/components/ui/button';
import { BookOpen, RotateCcw } from 'lucide-react';
import { VocabularySwiper } from '@/src/components/ui/core/VocabularySwiper';

interface VocabularyPracticeWidgetProps {
  lessons: LessonWithProgress[];
}

export const VocabularyPracticeWidget = memo(({ lessons }: VocabularyPracticeWidgetProps) => {
  const router = useRouter();

  const handlePracticeClick = (lessonId: string) => {
    router.push(`/lesson/${lessonId}`);
  };

  const handleRedoAll = () => {};

  return (
    <div className="relative">
      {/* Background effects similar to landing page */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-l from-roman-gold/30 to-amber-300/20 rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-r from-roman-red/25 to-roman-terracotta/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
      </div>

      <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl border border-roman-red/20 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>

        {/* Header */}
        <div className="relative p-8 border-b border-roman-red/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 bg-gradient-to-br from-roman-gold/20 via-roman-gold/15 to-amber-100/10 rounded-2xl flex items-center justify-center shadow-lg border border-roman-gold/30">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl"></div>
                <BookOpen className="h-8 w-8 text-roman-gold drop-shadow-lg relative" />
              </div>
              <div>
                <h3 className="text-3xl font-serif text-gray-900 mb-1">Vocabulary Practice</h3>
                <p className="text-lg text-roman-stone leading-relaxed">Review and strengthen your Latin vocabulary</p>
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleRedoAll}
              className="bg-gradient-to-r from-roman-gold to-amber-600 hover:from-amber-600 hover:to-roman-gold text-white px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 hover:scale-105 border border-amber-600">
              <RotateCcw className="h-5 w-5 mr-2" />
              Redo All Vocab
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="relative p-8">
          {lessons.length === 0 ? (
            <div className="text-center py-16">
              <div className="relative h-24 w-24 bg-gradient-to-br from-gray-100 to-gray-50 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl"></div>
                <BookOpen className="h-12 w-12 text-gray-300 relative" />
              </div>
              <h4 className="text-xl font-serif text-gray-700 mb-2">No lessons available</h4>
              <p className="text-gray-500 text-lg">Complete or start a lesson to practice vocabulary</p>
            </div>
          ) : (
            <VocabularySwiper lessons={lessons} onPracticeClick={handlePracticeClick} />
          )}
        </div>
      </div>
    </div>
  );
});

VocabularyPracticeWidget.displayName = 'VocabularyPracticeWidget';
