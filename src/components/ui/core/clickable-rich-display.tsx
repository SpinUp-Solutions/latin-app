import React, { useMemo } from 'react';
import { cn } from '@/src/lib/utils';
import { splitHtmlIntoWords } from '@/src/utils/htmlWordSplitter';
import { SimpleRichDisplay } from './simple-rich-display';

interface ClickableRichDisplayProps {
  content: string;
  onWordClick: (wordIndex: number) => void;
  selectedWordIndex: number | null;
  isCorrect: boolean | null;
  className?: string;
}

export const ClickableRichDisplay: React.FC<ClickableRichDisplayProps> = ({
  content,
  onWordClick,
  selectedWordIndex,
  isCorrect,
  className = '',
}) => {
  const wordFragments = useMemo(() => {
    return splitHtmlIntoWords(content);
  }, [content]);

  const getSelectionClasses = (index: number) => {
    if (selectedWordIndex !== index) return '';
    if (isCorrect === true) return 'text-green-600 bg-green-50';
    if (isCorrect === false) return 'text-red-600 bg-red-50';
    return '';
  };

  return (
    <div className={cn('font-serif text-lg leading-relaxed', className)}>
      {wordFragments.map((wordHtml, index) => (
        <div
          key={`${index}-${wordHtml.slice(0, 10)}`}
          className={cn(
            'inline-block cursor-pointer rounded hover:bg-roman-parchment hover:text-roman-red transition-colors',
            'mr-1',
            getSelectionClasses(index)
          )}
          onClick={() => onWordClick(index)}>
          <SimpleRichDisplay content={wordHtml} className="inline not-prose" />
        </div>
      ))}
    </div>
  );
};

export default ClickableRichDisplay;
