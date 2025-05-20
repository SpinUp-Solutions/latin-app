import React from 'react';

interface FieldSelectProps {
  items: string[];
  selectedItem: string | null;
  onSelect: (item: string) => void;
  matches: Record<string, string>;
  matchType: 'key' | 'value';
  label: string;
}

const FieldSelect: React.FC<FieldSelectProps> = ({ items, selectedItem, onSelect, matches, matchType, label }) => {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-roman-stone mb-2">{label}</h4>
      {items.map((item, index) => {
        const isMatched =
          matchType === 'key' ? Object.keys(matches).includes(item) : Object.values(matches).includes(item);

        return (
          <button
            key={`${matchType}-${index}`}
            className={`w-full p-3 text-left rounded-md transition-all ${
              isMatched
                ? 'bg-roman-green/10 border border-roman-green text-roman-green'
                : selectedItem === item
                  ? 'bg-roman-gold/10 border border-roman-gold'
                  : 'bg-white border border-gray-200 hover:border-roman-red/50'
            }`}
            onClick={() => onSelect(item)}
            disabled={isMatched}>
            {item}
          </button>
        );
      })}
    </div>
  );
};

export default FieldSelect;
