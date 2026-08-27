import React from 'react';

interface ExerciseProgressProps {
  currentIndex: number;
  completed: number;
  total: number;
  label?: string;
  showProgress?: boolean;
}

export const ExerciseProgress: React.FC<ExerciseProgressProps> = ({
  currentIndex,
  completed,
  total,
  label = 'Question',
  showProgress = true,
}) => {
  if (!showProgress) return null;

  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const position = safeTotal === 0 ? 0 : Math.min(Math.max(currentIndex, 0) + 1, safeTotal);
  const completedCount = safeTotal === 0 ? 0 : Math.min(Math.max(completed, 0), safeTotal);
  const progressPercentage = safeTotal === 0 ? 0 : Math.round((completedCount / safeTotal) * 100);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
        <span>
          {label} {position} of {safeTotal}
        </span>
        <span>
          {completedCount} of {safeTotal} complete ({progressPercentage}%)
        </span>
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
