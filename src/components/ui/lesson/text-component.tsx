'use client';

import React from 'react';
import { useAudio } from '@/src/hooks/useAudio';
import { Button } from '@/src/components/ui/button';
import { PlayCircle, PauseCircle, Loader2 } from 'lucide-react';

interface TextComponentProps {
  title: string;
  content: string;
  className?: string;
  audioPath?: string | null;
}

export const TextComponent: React.FC<TextComponentProps> = ({ title, content, className = '', audioPath }) => {
  const { audioRef, isPlaying, isLoading, togglePlay } = useAudio(audioPath);

  return (
    <div className={`text-component relative ${className}`}>
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-serif text-roman-red mb-2">{title}</h3>
        {audioPath && (
          <Button onClick={togglePlay} variant="ghost" size="sm" className="ml-2" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : isPlaying ? (
              <PauseCircle className="h-6 w-6" />
            ) : (
              <PlayCircle className="h-6 w-6" />
            )}
          </Button>
        )}
      </div>
      <div
        className="p-4 bg-roman-parchment rounded-lg prose dark:prose-invert max-w-none prose-p:my-2 prose-p:leading-snug prose-headings:my-4 prose-ul:my-2 prose-ol:my-2"
        dangerouslySetInnerHTML={{ __html: content }}
      />
      <audio ref={audioRef} />
    </div>
  );
};

export default TextComponent;
