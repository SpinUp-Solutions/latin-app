import React from 'react';
import { TooltipRenderer } from './tooltip-renderer';
import { cn } from '@/src/lib/utils';

interface SimpleRichDisplayProps {
  content: string;
  className?: string;
}

export const SimpleRichDisplay: React.FC<SimpleRichDisplayProps> = ({ content, className = '' }) => {
  return (
    <TooltipRenderer
      content={content}
      className={cn(
        'prose prose-sm max-w-none',
        'prose-p:my-0 prose-p:leading-normal',
        '[&_strong]:font-semibold [&_em]:italic',
        className
      )}
    />
  );
};

export default SimpleRichDisplay;
