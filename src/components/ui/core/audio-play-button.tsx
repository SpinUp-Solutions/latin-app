import React, { useContext, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { PlayCircle, PauseCircle, Loader2, Volume2 } from 'lucide-react';
import { useAudio } from '@/src/hooks/useAudio';
import { LessonPageVisibilityContext } from '@/src/components/ui/lesson/page-visibility-context';

interface AudioPlayButtonProps {
  audioPath: string;
  variant?: 'default' | 'vocabulary';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  showLabel?: boolean;
}

const AudioPlayButton: React.FC<AudioPlayButtonProps> = ({
  audioPath,
  variant = 'default',
  size = 'sm',
  className = '',
  showLabel = false,
}) => {
  const { audioRef, isPlaying, isLoading, play, pause } = useAudio(audioPath);
  const pageIsVisible = useContext(LessonPageVisibilityContext);

  useEffect(() => {
    if (!pageIsVisible) pause();
  }, [pageIsVisible, pause]);

  if (!audioPath) return null;

  // Vocabulary buttons sit inside clickable cards and always show the speaker icon.
  const isVocabulary = variant === 'vocabulary';
  const showPause = isPlaying && !isVocabulary;
  const Icon = isLoading ? Loader2 : isVocabulary ? Volume2 : showPause ? PauseCircle : PlayCircle;

  const handleClick = (e: React.MouseEvent) => {
    if (isVocabulary) e.stopPropagation();
    if (isPlaying) pause();
    else play();
  };

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        onClick={handleClick}
        disabled={isLoading}
        className={`rounded-full text-roman-terracotta hover:bg-roman-parchment focus-visible:ring-roman-terracotta/40 ${className}`}>
        <Icon className={isLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        {showLabel && <span className="ml-2">{isLoading ? 'Loading...' : showPause ? 'Pause' : 'Play'}</span>}
      </Button>
      <audio ref={audioRef} />
    </>
  );
};

export default AudioPlayButton;
