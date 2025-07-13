'use client';

import React from 'react';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';

interface TextComponentProps {
  title: string;
  content: string;
  className?: string;
  audioPath?: string | null;
}

export const TextComponent: React.FC<TextComponentProps> = ({ title, content, className = '', audioPath }) => {
  return (
    <div className={`text-component relative ${className}`}>
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-serif text-roman-red mb-2">{title}</h3>
        {audioPath && (
          <AudioPlayButton
            audioPath={audioPath}
            variant="default"
            size="sm"
            className="ml-2 rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
          />
        )}
      </div>
      <div
        className="p-4 bg-roman-parchment rounded-lg prose dark:prose-invert max-w-none prose-p:my-2 prose-p:leading-snug prose-headings:my-4 prose-ul:my-2 prose-ol:my-2"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
};

export default TextComponent;
