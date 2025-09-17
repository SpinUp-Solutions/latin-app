import React from 'react';
import { cn } from '@/src/lib/utils';
import { InlineTooltipWrapper } from './InlineTooltipWrapper';

interface ClickableWordDisplayProps {
  content: string;
  index: number;
  onClick: (index: number) => void;
  isSelected: boolean;
  isCorrect: boolean | null;
}

export const ClickableWordDisplay: React.FC<ClickableWordDisplayProps> = ({
  content,
  index,
  onClick,
  isSelected,
  isCorrect,
}) => {
  const handleClick = () => {
    onClick(index);
  };

  const getSelectionClasses = () => {
    if (!isSelected) return '';
    if (isCorrect === true) return 'text-green-600 bg-green-50';
    if (isCorrect === false) return 'text-red-600 bg-red-50';
    return '';
  };

  return (
    <InlineTooltipWrapper
      content={content}
      onMouseClick={handleClick}
      className={cn(
        'inline cursor-pointer rounded hover:bg-roman-parchment hover:text-roman-red transition-colors',
        'align-baseline leading-none',
        getSelectionClasses()
      )}
    />
  );
};

export default ClickableWordDisplay;