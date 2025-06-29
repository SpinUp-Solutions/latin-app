import React from 'react';

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
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <div className={`${className}`}>
      <div className="flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyPress={handleKeyPress}
            className="w-full p-2 border rounded"
            placeholder={placeholder}
          />
        </div>
        <button onClick={onSubmit} className="bg-roman-red text-white px-4 py-2 rounded hover:bg-red-700">
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default ExerciseInput;
