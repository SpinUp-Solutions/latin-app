import React from 'react';

interface ExerciseFeedbackProps {
  message?: string;
  className?: string;
  isCorrect?: boolean;
  correctAnswer?: string;
  customSuccessMessage?: string;
  customErrorMessage?: string;
}

const ExerciseFeedback: React.FC<ExerciseFeedbackProps> = ({
  message,
  className = '',
  isCorrect,
  correctAnswer,
  customSuccessMessage,
  customErrorMessage,
}) => {
  if (isCorrect !== undefined) {
    return (
      <div
        className={`
        mt-6 p-6 rounded-lg
        ${
          isCorrect
            ? 'bg-gradient-to-r from-green-100 to-green-50 border border-green-200'
            : 'bg-gradient-to-r from-red-100 to-red-50 border border-red-200'
        }
        ${className}
      `}>
        <div className="flex items-center justify-center gap-4">
          <div className="text-2xl">{isCorrect ? '✅' : '❌'}</div>
          <p className={`font-serif text-lg ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
            {isCorrect
              ? customSuccessMessage || 'Correct!'
              : customErrorMessage || `Incorrect. The correct answer is "${correctAnswer}"`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
      mt-6 p-6 rounded-lg
      bg-gradient-to-r from-roman-red/10 to-roman-red/5
      border border-roman-red/20
      ${className}
    `}>
      <div className="flex items-center justify-center gap-4">
        <div className="text-2xl">🎉</div>
        <p className="font-serif text-lg text-roman-red">
          {message || 'Congratulations! You have completed this exercise.'}
        </p>
        <div className="text-2xl">🎉</div>
      </div>
    </div>
  );
};

export default ExerciseFeedback;
