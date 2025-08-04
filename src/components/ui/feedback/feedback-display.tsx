import React from 'react';
import { Check, X, HelpCircle } from 'lucide-react';
import type { FeedbackLevel } from '@/src/types/exercises/base';
import { SimpleRichDisplay } from '../core/simple-rich-display';

interface FeedbackDisplayProps {
  isCorrect: boolean | null;
  message: string;
  level?: FeedbackLevel | null;
  hint?: string;
  explanation?: string;
  showExplanation?: boolean;
  className?: string;
}

export const FeedbackDisplay: React.FC<FeedbackDisplayProps> = ({
  isCorrect,
  message,
  level,
  hint,
  explanation,
  showExplanation = false,
  className = '',
}) => {
  if (isCorrect === null || !message) return null;

  const baseClasses = 'mt-4 p-3 rounded-lg shadow-md border transition-all duration-200';
  const statusClasses = isCorrect
    ? 'bg-green-50 border-green-200 text-green-700'
    : 'bg-red-50 border-red-200 text-red-700';

  return (
    <div className={`${className}`}>
      <div className={`${baseClasses} ${statusClasses}`}>
        <div className="flex items-start gap-2">
          {isCorrect ? (
            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          ) : (
            <X className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 space-y-2">
            <span className="font-medium block">
              <SimpleRichDisplay content={message} />
            </span>

            {!isCorrect && level?.showHint && hint && (
              <div className="flex items-start gap-2 mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                <HelpCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="text-sm">
                  <SimpleRichDisplay content={hint} />
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Show explanation after correct answer */}
      {isCorrect && showExplanation && explanation && (
        <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <SimpleRichDisplay content={explanation} className="text-blue-800 text-sm leading-relaxed" />
        </div>
      )}
    </div>
  );
};

export default FeedbackDisplay;
