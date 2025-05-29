import React, { useState, useEffect } from 'react';
import FloatingFeedback from './FloatingFeedback';

interface ExerciseInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isCorrect: boolean | null;
  correctAnswer?: string;
  placeholder?: string;
  buttonText?: string;
  className?: string;
}

const ExerciseInput: React.FC<ExerciseInputProps> = ({
  value,
  onChange,
  onSubmit,
  isCorrect,
  placeholder = 'Type your answer in Latin...',
  buttonText = 'Check',
  className = '',
}) => {
  const [showFloatingFeedback, setShowFloatingFeedback] = useState(false);

  useEffect(() => {
    if (isCorrect !== null) {
      setShowFloatingFeedback(true);
      const timer = setTimeout(() => {
        setShowFloatingFeedback(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isCorrect]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <div className={`${className} relative`}>
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyPress={handleKeyPress}
            className="w-full p-2 border rounded"
            placeholder={placeholder}
          />
          <FloatingFeedback isCorrect={isCorrect} show={showFloatingFeedback} />
        </div>
        <button onClick={onSubmit} className="bg-roman-red text-white px-4 py-2 rounded hover:bg-red-700">
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default ExerciseInput;
