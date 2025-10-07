'use client';

import React from 'react';
import AudioPlayButton from '../core/audio-play-button';
import { TooltipRenderer } from '../core/tooltip-renderer';
import { SimpleRichDisplay } from '../core/simple-rich-display';

interface TextComponentProps {
  title: string;
  content: string;
  className?: string;
  audioPath?: string;
}

export const TextComponent: React.FC<TextComponentProps> = ({ title, content, className = '', audioPath }) => {
  return (
    <div className={`text-component relative ${className}`}>
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-serif text-roman-red mb-2">
          <SimpleRichDisplay content={title} />
        </h3>
        {audioPath && (
          <AudioPlayButton
            audioPath={audioPath}
            variant="default"
            size="sm"
            className="ml-2 rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
          />
        )}
      </div>
      <TooltipRenderer
        content={content}
        className="p-4 bg-roman-parchment rounded-lg prose dark:prose-invert max-w-none prose-p:my-2 prose-p:leading-snug prose-headings:my-4 prose-ul:my-2 prose-ol:my-2"
      />
    </div>
  );
};

export default TextComponent;
