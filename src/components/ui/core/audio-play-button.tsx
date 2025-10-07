import React from 'react';
import { Button } from '@/src/components/ui/button';
import { PlayCircle, PauseCircle, Loader2, Volume2 } from 'lucide-react';
import { useAudio } from '@/src/hooks/useAudio';

interface AudioPlayButtonProps {
  audioPath: string;
  variant?: 'default' | 'vocabulary';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  showLabel?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}
const AudioPlayButton: React.FC<AudioPlayButtonProps> = props => {
  const {
    audioPath,
    variant = 'default',
    size = 'sm',
    className = '',
    showLabel = false,
    disabled = false,
    onClick,
  } = props;

  const { audioRef, isPlaying, isLoading, play, pause } = useAudio(audioPath);

  if (variant === 'vocabulary') {
    const handlePlay = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onClick) onClick(e);

      console.log('🎤 Vocabulary audio play requested:', audioPath);
      if (isPlaying) {
        pause();
      } else {
        play();
      }
    };

    if (!audioPath) return null;

    return (
      <>
        <Button
          variant="ghost"
          size={size}
          onClick={handlePlay}
          disabled={disabled || isLoading}
          className={`rounded-full text-roman-terracotta hover:bg-roman-parchment focus-visible:ring-roman-terracotta/40 ${className}`}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
          {showLabel && <span className="ml-2">{isLoading ? 'Loading...' : 'Play'}</span>}
        </Button>
        <audio ref={audioRef} />
      </>
    );
  }

  // Default variant

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) onClick(e);

    if (isPlaying) {
      console.log('⏸️ Pausing default audio');
      pause();
    } else {
      console.log('▶️ Playing default audio');
      play();
    }
  };

  if (!audioPath) return null;

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={`rounded-full text-roman-terracotta hover:bg-roman-parchment focus-visible:ring-roman-terracotta/40 ${className}`}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <PauseCircle className="h-4 w-4" />
        ) : (
          <PlayCircle className="h-4 w-4" />
        )}
        {showLabel && <span className="ml-2">{isLoading ? 'Loading...' : isPlaying ? 'Pause' : 'Play'}</span>}
      </Button>
      <audio ref={audioRef} />
    </>
  );
};

export default AudioPlayButton;
