'use client';

import React, { useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, LayoutGrid, Check } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/src/components/ui/popover';
import { cn } from '@/src/lib/utils';
import { stripHtmlTags } from '@/src/utils/exercises';

interface LessonNavigationProps {
  currentPageIndex: number;
  totalPages: number;
  isLessonCompleted?: boolean;
  pageTitles?: (string | undefined)[];
  placement?: 'fixed' | 'contained';
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
  onGoToPage: (index: number) => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
  hasAudio: boolean;
  isFinishing?: boolean;
  isFinishBlocked?: boolean;
}

export const LessonNavigation: React.FC<LessonNavigationProps> = ({
  currentPageIndex,
  totalPages,
  isLessonCompleted = false,
  pageTitles = [],
  placement = 'fixed',
  onPrevious,
  onNext,
  onFinish,
  onGoToPage,
  onTogglePlay,
  isPlaying,
  hasAudio,
  isFinishing = false,
  isFinishBlocked = false,
}) => {
  const [jumpOpen, setJumpOpen] = useState(false);

  const canGoPrevious = currentPageIndex > 0;
  const canGoNext = currentPageIndex < totalPages - 1;
  const progressPercentage = totalPages > 0 ? Math.round(((currentPageIndex + 1) / totalPages) * 100) : 0;
  const isContained = placement === 'contained';
  const clampedProgress = Math.max(0, Math.min(100, Number.isFinite(progressPercentage) ? progressPercentage : 0));
  const isFinalActionDisabled = !canGoNext && (isFinishing || isLessonCompleted || isFinishBlocked);

  const handleSelectPage = (index: number) => {
    onGoToPage(index);
    setJumpOpen(false);
  };

  return (
    <div
      className={cn(
        isContained
          ? 'sticky bottom-3 z-20 mt-6 flex w-full justify-center'
          : 'pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4'
      )}>
      <div
        className={cn(
          'overflow-hidden border border-roman-red/15 bg-white/95 shadow-xl ring-1 ring-black/5 backdrop-blur supports-[backdrop-filter]:bg-white/80',
          isContained ? 'w-full rounded-xl' : 'pointer-events-auto w-full max-w-2xl rounded-2xl'
        )}>
        <div className="h-1 w-full bg-roman-parchment/40">
          <div
            className="h-full bg-roman-red transition-all duration-300 ease-out"
            style={{ width: `${clampedProgress}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <Button
            variant="outline"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className="rounded-full gap-1 px-3 sm:px-4">
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Prev</span>
          </Button>

          <div className="flex items-center gap-2">
            {hasAudio && (
              <Button variant="outline" size="icon" onClick={onTogglePlay} className="rounded-full">
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            )}

            <Popover open={jumpOpen} onOpenChange={setJumpOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="gap-2 rounded-full px-3 text-roman-stone hover:text-foreground">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="font-medium tabular-nums">
                    Page {currentPageIndex + 1} / {totalPages}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="center"
                sideOffset={12}
                className="w-72 border-roman-red/15 bg-white/95 p-3 text-foreground shadow-xl ring-1 ring-black/5 backdrop-blur supports-[backdrop-filter]:bg-white/90">
                <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-roman-stone">Jump to page</p>
                <div className="grid max-h-64 grid-cols-5 gap-1.5 overflow-y-auto pr-1">
                  {Array.from({ length: totalPages }).map((_, index) => {
                    const isCurrent = index === currentPageIndex;
                    const rawTitle = pageTitles[index];
                    const title = rawTitle ? stripHtmlTags(rawTitle) : '';
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSelectPage(index)}
                        title={title ? `Page ${index + 1}: ${title}` : `Page ${index + 1}`}
                        className={cn(
                          'relative flex h-10 items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors',
                          isCurrent
                            ? 'border-roman-red bg-roman-red text-white shadow-sm'
                            : 'border-roman-red/15 bg-white text-roman-stone hover:border-roman-red/40 hover:bg-roman-red/5 hover:text-foreground'
                        )}>
                        {index + 1}
                        {isCurrent && <Check className="absolute right-1 top-1 h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Button
            variant="outline"
            onClick={canGoNext ? onNext : onFinish}
            disabled={isFinalActionDisabled}
            className="rounded-full gap-1 px-3 sm:px-4">
            {canGoNext ? (
              <>
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </>
            ) : isFinishing ? (
              <>
                <span>Finishing…</span>
                <Check className="h-4 w-4" />
              </>
            ) : isLessonCompleted ? (
              <>
                <span>Lesson Complete</span>
                <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                <span>Finish Lesson</span>
                <Check className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LessonNavigation;
