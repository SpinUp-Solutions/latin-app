'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PlayCircle, PauseCircle, Loader2 } from 'lucide-react';
import { useAudio } from '@/src/hooks/useAudio';

interface AudioPlayerProps {
  audioPath: string;
  onEnded?: () => void;
  className?: string;
}

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioPath, onEnded, className = '' }) => {
  const { audioRef, isPlaying, isLoading, togglePlay } = useAudio(audioPath, onEnded);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Use requestAnimationFrame for smooth ~60fps progress updates while playing
  useEffect(() => {
    if (!isPlaying || isSeeking) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        setCurrentTime(audio.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, isSeeking, audioRef]);

  // Listen for duration changes and sync time when paused
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handlePause = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('pause', handlePause);
    };
  }, [audioRef]);

  const seekToPosition = useCallback(
    (clientX: number) => {
      const audio = audioRef.current;
      const bar = progressRef.current;
      if (!audio || !bar || !duration) return;

      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const seekTime = ratio * duration;
      audio.currentTime = seekTime;
      setCurrentTime(seekTime);
    },
    [audioRef, duration]
  );

  const handleProgressClick = (e: React.MouseEvent) => {
    seekToPosition(e.clientX);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsSeeking(true);
    seekToPosition(e.clientX);
  };

  useEffect(() => {
    if (!isSeeking) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      seekToPosition(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      setIsSeeking(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSeeking, seekToPosition]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!audioPath) return null;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl bg-roman-parchment/50 border border-roman-terracotta/20 px-4 py-3 ${className}`}>
      <button
        onClick={togglePlay}
        disabled={isLoading}
        className="flex-shrink-0 text-roman-terracotta hover:text-roman-terracotta/80 transition-colors disabled:opacity-50"
        aria-label={isPlaying ? 'Pause' : 'Play'}>
        {isLoading ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : isPlaying ? (
          <PauseCircle className="h-8 w-8" />
        ) : (
          <PlayCircle className="h-8 w-8" />
        )}
      </button>

      <span className="text-xs text-roman-stone tabular-nums w-10 text-right flex-shrink-0">
        {formatTime(currentTime)}
      </span>

      <div
        ref={progressRef}
        className="flex-1 h-2 bg-roman-stone/20 rounded-full cursor-pointer relative group"
        onClick={handleProgressClick}
        onMouseDown={handleMouseDown}>
        <div className="absolute inset-y-0 left-0 bg-roman-terracotta rounded-full" style={{ width: `${progress}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-roman-terracotta rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 7px)` }}
        />
      </div>

      <span className="text-xs text-roman-stone tabular-nums w-10 flex-shrink-0">{formatTime(duration)}</span>

      <audio ref={audioRef} />
    </div>
  );
};

export default AudioPlayer;
