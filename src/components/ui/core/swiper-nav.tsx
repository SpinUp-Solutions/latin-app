import React, { useState, useRef, useCallback } from 'react';
import { useSwiper } from 'swiper/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const SwiperNavigation = () => {
  const swiper = useSwiper();
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const updateProgress = useCallback(
    (clientX: number) => {
      if (!barRef.current || !swiper) return;

      const rect = barRef.current.getBoundingClientRect();
      const newProgress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setProgress(newProgress);

      const totalSlides = swiper.slides.length;
      if (totalSlides === 0) return;

      const maxSlideIndex = totalSlides - 1;
      const targetSlide = Math.round(newProgress * maxSlideIndex);

      swiper.slideTo(targetSlide);
    },
    [swiper]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      updateProgress(e.clientX);
    },
    [updateProgress]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        updateProgress(e.clientX);
      }
    },
    [isDragging, updateProgress]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  React.useEffect(() => {
    if (!swiper) return;

    const updateFromSwiper = () => {
      if (!isDragging && swiper.slides && swiper.slides.length > 0) {
        const maxSlideIndex = swiper.slides.length - 1;
        const currentProgress = maxSlideIndex > 0 ? swiper.activeIndex / maxSlideIndex : 0;
        setProgress(currentProgress);
      }
    };

    swiper.on('slideChange', updateFromSwiper);
    updateFromSwiper();

    return () => swiper.off('slideChange', updateFromSwiper);
  }, [swiper, isDragging]);

  if (!swiper) {
    return null;
  }

  return (
    <div className="w-full max-w-md mx-auto p-4">
      <div className="flex items-center gap-4">
        <button
          onClick={() => swiper.slidePrev()}
          disabled={swiper.activeIndex === 0}
          className="w-8 h-8 rounded-full flex items-center justify-center text-roman-red hover:bg-roman-red/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div
          ref={barRef}
          className="relative h-2 bg-gray-200 rounded-full cursor-pointer flex-1"
          onMouseDown={handleMouseDown}>
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-roman-red to-roman-terracotta rounded-full transition-all duration-150"
            style={{ width: `${progress * 100}%` }}
          />

          <div
            className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-roman-red rounded-full shadow-lg cursor-grab active:cursor-grabbing transition-all duration-150 hover:scale-110"
            style={{ left: `${progress * 100}%`, transform: 'translateX(-50%) translateY(-50%)' }}
          />
        </div>

        <button
          onClick={() => swiper.slideNext()}
          disabled={swiper.slides && swiper.activeIndex === swiper.slides.length - 1}
          className="w-8 h-8 rounded-full flex items-center justify-center text-roman-red hover:bg-roman-red/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
