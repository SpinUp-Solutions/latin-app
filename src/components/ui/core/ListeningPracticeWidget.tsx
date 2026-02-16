'use client';
import React from 'react';
import { memo } from 'react';
import { useRouter } from 'next/navigation';
import { LessonWithProgress } from '@/src/types/lesson';
import { Headphones } from 'lucide-react';
import { VocabularySwiper } from '@/src/components/ui/core/VocabularySwiper';

interface ListeningPracticeWidgetProps {
  lessons: LessonWithProgress[];
}

export const ListeningPracticeWidget = memo(({ lessons }: ListeningPracticeWidgetProps) => {
  const router = useRouter();

  const handlePracticeClick = (lessonId: string) => {
    router.push(`/lesson/${lessonId}`);
  };

  return (
    <div className="relative">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-l from-purple-400/30 to-purple-300/20 rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-r from-purple-500/25 to-purple-400/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60"></div>
      </div>

      <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl border border-purple-400/20 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>

        {/* Header */}
        <div className="relative p-8 border-b border-purple-400/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 bg-gradient-to-br from-purple-400/20 via-purple-400/15 to-purple-100/10 rounded-2xl flex items-center justify-center shadow-lg border border-purple-400/30">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl"></div>
                <Headphones className="h-8 w-8 text-purple-600 drop-shadow-lg relative" />
              </div>
              <div>
                <h3 className="text-3xl font-serif text-gray-900 mb-1">Listening Practice</h3>
                <p className="text-lg text-roman-stone leading-relaxed">
                  Listen to Latin passages and follow along with the text
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
                <Headphones className="h-12 w-12 text-gray-300 relative" />
              </div>
              <h4 className="text-xl font-serif text-gray-700 mb-2">No lessons available</h4>
              <p className="text-gray-500 text-lg">Check back soon for listening practice lessons</p>
            </div>
          ) : (
            <VocabularySwiper lessons={lessons} onPracticeClick={handlePracticeClick} />
          )}
        </div>
      </div>
    </div>
  );
});

ListeningPracticeWidget.displayName = 'ListeningPracticeWidget';
