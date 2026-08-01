import React, { useRef, useEffect } from 'react';
import { Input } from '../input';
import { Button } from '../button';

interface ExerciseInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  buttonText?: string;
  className?: string;
  disabled?: boolean;
}

const ExerciseInput: React.FC<ExerciseInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type your answer in Latin...',
  buttonText = 'Check',
  className = '',
  disabled,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const wasDisabledRef = useRef(false);

  // Refocus input when it transitions from disabled back to enabled (after correct answer auto-advance)
  useEffect(() => {
    if (wasDisabledRef.current && !disabled) {
      inputRef.current?.focus();
    }
    wasDisabledRef.current = !!disabled;
  }, [disabled]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !disabled && value.trim().length > 0) {
      onSubmit();
    }
  };

  const handleButtonClick = () => {
    onSubmit();
    // Refocus input after clicking the button (handles incorrect answer case where disabled never toggled)
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  return (
    <div className={`${className}`}>
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            className="w-full"
            disabled={disabled}
          />
        </div>
        <Button
          onClick={handleButtonClick}
          disabled={disabled || value.trim().length === 0}
          className="bg-roman-red text-white hover:bg-red-700">
          {buttonText}
        </Button>
      </div>
    </div>
  );
};

export default ExerciseInput;
