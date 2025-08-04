import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SimpleRichDisplay } from './simple-rich-display';

interface RichTextSelectOption {
  id: string;
  value: string;
}

interface RichTextSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: RichTextSelectOption[];
  className?: string;
  placeholder?: string;
}

export const RichTextSelect: React.FC<RichTextSelectProps> = ({
  value,
  onChange,
  options,
  className = '',
  placeholder = '-- Select an option --'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(opt => opt.id === value);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex-1 w-full p-2 border rounded-md text-sm bg-white hover:bg-gray-50 flex items-center justify-between"
      >
        <div className="flex-1 text-left">
          {selectedOption && selectedOption.id !== '' ? (
            <SimpleRichDisplay content={selectedOption.value} />
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {options.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
              className="w-full p-2 text-left hover:bg-gray-50 border-b last:border-b-0"
            >
              {option.id === '' ? (
                <span className="text-gray-500">{option.value}</span>
              ) : (
                <SimpleRichDisplay content={option.value} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default RichTextSelect;