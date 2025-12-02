import React from 'react';
import { Input } from '../input';
import { Button } from '../button';

interface ExerciseInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  buttonText?: string;
  className?: string;
}

const ExerciseInput: React.FC<ExerciseInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type your answer in Latin...',
  buttonText = 'Check',
  className = '',
}) => {
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <div className={`${className}`}>
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            className="w-full"
          />
        </div>
        <Button onClick={onSubmit} className="bg-roman-red text-white hover:bg-red-700">
          {buttonText}
        </Button>
      </div>
    </div>
  );
};

export default ExerciseInput;
