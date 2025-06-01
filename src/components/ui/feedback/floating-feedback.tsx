import React from 'react';

interface FloatingFeedbackProps {
  isCorrect: boolean | null;
  show: boolean;
}

const FloatingFeedback: React.FC<FloatingFeedbackProps> = ({ isCorrect, show }) => {
  if (!show || isCorrect === null) return null;

  return (
    <div
      className={`
        absolute -top-12 left-1/2 transform -translate-x-1/2
        px-4 py-2 rounded-lg shadow-lg
        ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}
        transition-opacity duration-300
        ${show ? 'opacity-100' : 'opacity-0'}
      `}>
      <div className="flex items-center gap-2">
        {isCorrect ? (
          <>
            <span className="text-green-600">✓</span>
            <span className="font-serif italic">Correct!</span>
          </>
        ) : (
          <>
            <span className="text-red-600">✗</span>
            <span className="font-serif italic">Try again</span>
          </>
        )}
      </div>
    </div>
  );
};

export default FloatingFeedback;
