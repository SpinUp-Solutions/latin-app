import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSwiper } from 'swiper/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type NavigationState = {
  activeIndex: number;
  isBeginning: boolean;
  isEnd: boolean;
};

const clampProgress = (value: number) => Math.max(0, Math.min(1, value));

export const SwiperNavigation = () => {
  const swiper = useSwiper();
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dragBoundsRef = useRef<DOMRect | null>(null);
  const pendingProgressRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [navigationState, setNavigationState] = useState<NavigationState>(() => ({
    activeIndex: swiper.activeIndex,
    isBeginning: swiper.isBeginning,
    isEnd: swiper.isEnd,
  }));

  const paintProgress = useCallback((progress: number) => {
    const clampedProgress = clampProgress(progress);

    if (fillRef.current) {
      fillRef.current.style.transform = `scaleX(${clampedProgress})`;
    }

    if (thumbRef.current) {
      thumbRef.current.style.left = `${clampedProgress * 100}%`;
    }
  }, []);

  const syncProgressFromSwiper = useCallback(() => {
    if (!isDraggingRef.current) {
      paintProgress(swiper.progress);
    }
  }, [paintProgress, swiper]);

  const syncNavigationFromSwiper = useCallback(() => {
    setNavigationState(previous => {
      const next = {
        activeIndex: swiper.activeIndex,
        isBeginning: swiper.isBeginning,
        isEnd: swiper.isEnd,
      };

      return previous.activeIndex === next.activeIndex &&
        previous.isBeginning === next.isBeginning &&
        previous.isEnd === next.isEnd
        ? previous
        : next;
    });
  }, [swiper]);

  const flushDragFrame = useCallback(() => {
    frameRef.current = null;
    const progress = pendingProgressRef.current;
    paintProgress(progress);
    swiper.setProgress(progress, 0);
  }, [paintProgress, swiper]);

  const updateDrag = useCallback(
    (clientX: number) => {
      const bounds = dragBoundsRef.current;
      if (!bounds || bounds.width === 0) return;

      pendingProgressRef.current = clampProgress((clientX - bounds.left) / bounds.width);

      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(flushDragFrame);
      }
    },
    [flushDragFrame]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !barRef.current) return;

      isDraggingRef.current = true;
      setIsDragging(true);
      dragBoundsRef.current = barRef.current.getBoundingClientRect();
      barRef.current.setPointerCapture(event.pointerId);
      updateDrag(event.clientX);
    },
    [updateDrag]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isDraggingRef.current) {
        updateDrag(event.clientX);
      }
    },
    [updateDrag]
  );

  const finishDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, useFinalPointerPosition: boolean) => {
      if (!isDraggingRef.current) return;

      if (useFinalPointerPosition) {
        updateDrag(event.clientX);
      }

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        flushDragFrame();
      }

      isDraggingRef.current = false;
      setIsDragging(false);
      dragBoundsRef.current = null;

      if (barRef.current?.hasPointerCapture(event.pointerId)) {
        barRef.current.releasePointerCapture(event.pointerId);
      }

      swiper.slideToClosest(200);
    },
    [flushDragFrame, swiper, updateDrag]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          event.preventDefault();
          swiper.slidePrev();
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          event.preventDefault();
          swiper.slideNext();
          break;
        case 'Home':
          event.preventDefault();
          swiper.slideTo(0);
          break;
        case 'End':
          event.preventDefault();
          swiper.slideTo(swiper.slides.length - 1);
          break;
      }
    },
    [swiper]
  );

  useEffect(() => {
    swiper.on('progress', syncProgressFromSwiper);
    swiper.on('slideChange', syncNavigationFromSwiper);
    swiper.on('breakpoint', syncNavigationFromSwiper);
    syncProgressFromSwiper();
    syncNavigationFromSwiper();

    return () => {
      swiper.off('progress', syncProgressFromSwiper);
      swiper.off('slideChange', syncNavigationFromSwiper);
      swiper.off('breakpoint', syncNavigationFromSwiper);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [swiper, syncNavigationFromSwiper, syncProgressFromSwiper]);

  const lastSlideIndex = Math.max(0, swiper.slides.length - 1);

  return (
    <div className="mx-auto w-full max-w-md px-2 py-4 sm:px-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          aria-label="Previous lesson"
          onClick={() => swiper.slidePrev()}
          disabled={navigationState.isBeginning}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-roman-red transition-colors duration-200 hover:bg-roman-red/10 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          ref={barRef}
          role="slider"
          tabIndex={0}
          aria-label="Choose a lesson"
          aria-valuemin={0}
          aria-valuemax={lastSlideIndex}
          aria-valuenow={Math.min(navigationState.activeIndex, lastSlideIndex)}
          className="relative h-7 flex-1 cursor-pointer touch-none select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2"
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={event => finishDrag(event, true)}
          onPointerCancel={event => finishDrag(event, false)}>
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full bg-gray-200">
            <div
              ref={fillRef}
              className={`absolute inset-0 origin-left bg-gradient-to-r from-roman-red to-roman-terracotta will-change-transform ${
                isDragging ? '' : 'transition-transform duration-200 ease-out'
              }`}
              style={{ transform: `scaleX(${swiper.progress})` }}
            />
          </div>

          <div
            ref={thumbRef}
            className={`pointer-events-none absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-roman-red bg-white shadow-lg ${
              isDragging ? '' : 'transition-[left] duration-200 ease-out'
            }`}
            style={{ left: `${swiper.progress * 100}%` }}
          />
        </div>

        <button
          type="button"
          aria-label="Next lesson"
          onClick={() => swiper.slideNext()}
          disabled={navigationState.isEnd}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-roman-red transition-colors duration-200 hover:bg-roman-red/10 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
