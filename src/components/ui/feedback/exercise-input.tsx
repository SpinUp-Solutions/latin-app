import React from 'react';
import { SimpleRichEditor } from '../core/simple-rich-editor';
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
  return (
    <div className={`${className}`}>
      <div className="flex gap-4">
        <div className="flex-1">
          <SimpleRichEditor
            content={value}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={placeholder}
            singleLine={true}
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
