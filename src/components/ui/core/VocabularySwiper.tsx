'use client';

import { memo } from 'react';
import React from 'react';
import { LessonWithProgress } from '@/src/types/lesson';
import { Swiper, SwiperSlide } from 'swiper/react';
import { VerticalSwiperNavigation } from '@/src/components/ui/core/VerticalSwiperNavigation';
import { VocabLessonCard } from '@/src/components/ui/core/VocabLessonCard';
import 'swiper/css';

interface VocabularySwiperProps {
  lessons: LessonWithProgress[];
  onPracticeClick: (lessonId: string) => void;
}

export const VocabularySwiper = memo(({ lessons, onPracticeClick }: VocabularySwiperProps) => {
  if (lessons.length === 0) {
    return null;
  }

  return (
    <div className="h-96 relative">
      <Swiper
        direction="vertical"
        slidesPerView={3}
        spaceBetween={0}
        centeredSlides={true}
        resistance={false}
        modules={[]}
        className="h-full pr-20">
        <VerticalSwiperNavigation />

        {lessons.map(lesson => (
          <SwiperSlide key={lesson.id}>
            {({ isActive }) => (
              <div
                className={`transform transition-transform duration-200 ${isActive ? 'scale-100' : 'scale-95'} pr-20 pl-10`}>
                <VocabLessonCard lesson={lesson} onPracticeClick={onPracticeClick} />
              </div>
            )}
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
});

VocabularySwiper.displayName = 'VocabularySwiper';
