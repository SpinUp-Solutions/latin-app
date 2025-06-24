'use client';

import React from 'react';
import { Play, Pause, SkipForward, SkipBack } from 'lucide-react';
import { Button } from '@/src/components/ui/button';

interface LessonNavigationProps {
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
  hasAudio: boolean;
  canGoPrevious: boolean;
  canGoNext?: boolean;
}

export const LessonNavigation: React.FC<LessonNavigationProps> = ({
  onPrevious,
  onNext,
  onTogglePlay,
  isPlaying,
  hasAudio,
  canGoPrevious,
  canGoNext = true,
}) => {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={onPrevious} className="rounded-full" disabled={!canGoPrevious}>
        <SkipBack className="h-4 w-4" />
      </Button>

      {hasAudio ? (
        <Button variant="outline" size="icon" onClick={onTogglePlay} className="rounded-full">
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled className="rounded-full opacity-50 cursor-not-allowed">
          <Play className="h-4 w-4" />
        </Button>
      )}

      <Button variant="outline" size="icon" onClick={onNext} className="rounded-full" disabled={!canGoNext}>
        <SkipForward className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default LessonNavigation;
