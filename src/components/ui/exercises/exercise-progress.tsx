import React from 'react';

interface ExerciseProgressProps {
  current: number;
  total: number;
  label?: string;
  showProgress?: boolean;
}

export const ExerciseProgress: React.FC<ExerciseProgressProps> = ({
  current,
  total,
  label = 'Question',
  showProgress = true,
}) => {
  if (!showProgress) return null;

  const isMatching = label === 'Match';
  const currentDisplay = isMatching ? current : current + 1;
  const progressPercentage = Math.round((currentDisplay / total) * 100);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
        <span>
          {isMatching ? `${label}es: ${currentDisplay}` : `${label} ${currentDisplay}`} of {total}
        </span>
        <span>{progressPercentage}% Complete</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-roman-red h-2 rounded-full transition-all duration-300"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
};

export default ExerciseProgress;
