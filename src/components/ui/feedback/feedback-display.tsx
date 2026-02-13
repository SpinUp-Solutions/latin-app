import React from 'react';
import { Check, X, HelpCircle, ChevronRight } from 'lucide-react';
import type { FeedbackLevel } from '@/src/types/exercises/base';
import { SimpleRichDisplay } from '../core/simple-rich-display';

interface FeedbackDisplayProps {
  isCorrect: boolean | null;
  message: string;
  level?: FeedbackLevel | null;
  hint?: string;
  correctAnswer?: string;
  explanation?: string;
  showExplanation?: boolean;
  className?: string;
  onContinue?: () => void;
}

export const FeedbackDisplay: React.FC<FeedbackDisplayProps> = ({
  isCorrect,
  message,
  level,
  hint,
  correctAnswer,
  explanation,
  showExplanation = false,
  className = '',
  onContinue,
}) => {
  const shouldShowHint = !isCorrect && Boolean(level?.showHint) && Boolean(hint);
  const shouldShowAnswer = !isCorrect && Boolean(level?.showAnswer) && Boolean(correctAnswer);
  const hasPrimaryMessage = Boolean(message);
  const shouldRender = isCorrect !== null && (hasPrimaryMessage || shouldShowHint || shouldShowAnswer);
  if (!shouldRender) return null;

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
            {hasPrimaryMessage && (
              <span className="font-medium block">
                <SimpleRichDisplay content={message} />
              </span>
            )}

            {shouldShowHint && (
              <div className="flex items-start gap-2 mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                <HelpCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="text-sm">
                  <SimpleRichDisplay content={hint as string} />
                </span>
              </div>
            )}

            {shouldShowAnswer && (
              <div className="flex items-start gap-2 mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-800">
                <Check className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600" />
                <span className="text-sm">
                  Correct answer: <span className="font-mono">{correctAnswer as string}</span>
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

      {isCorrect && onContinue && (
        <button
          onClick={onContinue}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors">
          Continue
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export default FeedbackDisplay;
