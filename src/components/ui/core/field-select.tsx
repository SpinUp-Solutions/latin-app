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
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      <h4 className="text-sm font-medium text-roman-stone mb-2">{label}</h4>
      {items.map((item, index) => {
        const isMatched =
          matchType === 'key'
            ? Object.keys(matches).includes(item)
            : matchedIndices
              ? matchedIndices.has(index)
              : Object.values(matches).includes(item);

        const isSelected =
          selectedIndex !== null && selectedIndex !== undefined
            ? selectedIndex === index && selectedItem === item
            : selectedItem === item;

        return (
          <button
            key={`${matchType}-${index}`}
            className={`w-full p-3 text-left rounded-md transition-all ${
              showIncorrect && isSelected
                ? 'bg-red-50 border border-red-500 text-red-700 animate-pulse'
                : isMatched
                  ? 'bg-roman-green/10 border border-roman-green text-roman-green'
                  : isSelected
                    ? 'bg-roman-gold/10 border border-roman-gold'
                    : 'bg-white border border-gray-200 hover:border-roman-red/50'
            }`}
            onClick={() => onSelect(item, index)}
            disabled={isMatched}>
            <SimpleRichDisplay content={item} />
          </button>
        );
      })}
    </div>
  );
};

export default FieldSelect;
