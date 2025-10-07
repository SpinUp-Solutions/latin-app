import React, { useMemo } from 'react';
import { cn } from '@/src/lib/utils';
import { splitHtmlIntoWords } from '@/src/utils/htmlWordSplitter';
import { SimpleRichDisplay } from './simple-rich-display';

interface MultiClickableRichDisplayProps {
  content: string;
  onWordClick: (wordIndex: number) => void;
  selectedWordIndices: Set<number>;
  correctIndices?: Set<number>;
  incorrectIndices?: Set<number>;
  missedIndices?: Set<number>;
  isSubmitted: boolean;
  className?: string;
}

export const MultiClickableRichDisplay: React.FC<MultiClickableRichDisplayProps> = ({
  content,
  onWordClick,
  selectedWordIndices,
  correctIndices,
  incorrectIndices,
  missedIndices,
  isSubmitted,
  className = '',
}) => {
  const wordFragments = useMemo(() => {
    return splitHtmlIntoWords(content);
  }, [content]);

  const getWordClasses = (index: number) => {
    const baseClasses =
      'inline-block cursor-pointer rounded hover:bg-roman-parchment hover:text-roman-red transition-colors mr-1';

    if (isSubmitted) {
      // After submission, show feedback states
      if (correctIndices?.has(index)) {
        return cn(baseClasses, 'text-green-600 bg-green-50 border border-green-200');
      } else if (incorrectIndices?.has(index)) {
        return cn(baseClasses, 'text-red-600 bg-red-50 border border-red-200');
      } else if (missedIndices?.has(index)) {
        return cn(baseClasses, 'text-orange-600 bg-orange-50 border border-orange-200 border-dashed');
      }
      return baseClasses;
    } else {
      // Before submission, show selection state
      if (selectedWordIndices.has(index)) {
        return cn(baseClasses, 'text-blue-600 bg-blue-50 border border-blue-200');
      }
      return baseClasses;
    }
  };

  const handleWordClick = (index: number) => {
    if (isSubmitted) return;
    onWordClick(index);
  };

  return (
    <div className={cn('font-serif text-lg leading-relaxed', className)}>
      {wordFragments.map((wordHtml, index) => (
        <div
          key={`${index}-${wordHtml.slice(0, 10)}`}
          className={getWordClasses(index)}
          onClick={() => handleWordClick(index)}
          role="button"
          tabIndex={isSubmitted ? -1 : 0}
          onKeyDown={e => {
            if (!isSubmitted && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleWordClick(index);
            }
          }}
          aria-pressed={selectedWordIndices.has(index)}
          aria-label={`Word ${index + 1}: ${wordHtml.replace(/<[^>]*>/g, '')}`}>
          <SimpleRichDisplay content={wordHtml} className="inline not-prose" />
        </div>
      ))}
    </div>
  );
};

export default MultiClickableRichDisplay;
