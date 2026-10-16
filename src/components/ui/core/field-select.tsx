import React from 'react';
import { SimpleRichDisplay } from './simple-rich-display';

interface FieldSelectProps {
  items: string[];
  selectedItem: string | null;
  selectedIndex?: number | null;
  onSelect: (item: string, index?: number) => void;
  matches: Record<string, string>;
  matchType: 'key' | 'value';
  label: string;
  matchedIndices?: Set<number>;
  showIncorrect?: boolean;
  /** False keeps an incorrect selection red without the pulse, for one that stays on screen. */
  pulseIncorrect?: boolean;
  disabled?: boolean;
  className?: string;
}

const FieldSelect: React.FC<FieldSelectProps> = ({
  items,
  selectedItem,
  selectedIndex,
  onSelect,
  matches,
  matchType,
  label,
  matchedIndices,
  showIncorrect = false,
  pulseIncorrect = true,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      <h4 className="text-sm font-medium text-roman-stone mb-2">{label}</h4>
      {items.map((item, index) => {
        const isMatched = matchedIndices
          ? matchedIndices.has(index)
          : matchType === 'key'
            ? Object.keys(matches).includes(item)
            : Object.values(matches).includes(item);

        const isSelected =
          selectedIndex !== null && selectedIndex !== undefined
            ? selectedIndex === index && selectedItem === item
            : selectedItem === item;

        return (
          <button
            key={`${matchType}-${index}`}
            className={`w-full p-3 text-left rounded-md transition-all ${
              isMatched
                ? 'bg-gray-200 border border-gray-300 text-gray-400 opacity-50 cursor-not-allowed pointer-events-none'
                : showIncorrect && isSelected
                  ? `bg-red-100 border-2 border-red-400 text-red-700 ${pulseIncorrect ? 'animate-pulse' : ''}`
                  : isSelected
                    ? 'bg-roman-gold/10 border border-roman-gold'
                    : 'bg-white border border-gray-200 hover:border-roman-red/50'
            }`}
            onClick={() => !isMatched && !disabled && onSelect(item, index)}
            disabled={isMatched || disabled}>
            <SimpleRichDisplay content={item} />
          </button>
        );
      })}
    </div>
  );
};

export default FieldSelect;
