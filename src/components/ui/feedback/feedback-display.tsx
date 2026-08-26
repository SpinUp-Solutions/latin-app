import React from 'react';
import { Check, X, HelpCircle, ChevronRight, RotateCcw } from 'lucide-react';
import type { FeedbackLevel } from '@/src/types/exercises/base';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { hasVisibleFeedbackContent } from '@/src/utils/feedbackVisibility';

type FeedbackBody = React.ReactNode;

interface FeedbackDisplayProps {
  isCorrect: boolean | null;
  message: string;
  level?: FeedbackLevel | null;
  hint?: FeedbackBody;
  correctAnswer?: FeedbackBody;
  explanation?: FeedbackBody;
  showExplanation?: boolean;
  className?: string;
  onContinue?: () => void;
  allowContinueOnIncorrect?: boolean;
  onStartOver?: () => void;
}

const renderFeedbackBody = (content: FeedbackBody, className?: string) => {
  if (typeof content === 'string') {
    return <SimpleRichDisplay content={content} className={className} />;
  }

  return content;
};

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
  allowContinueOnIncorrect = false,
  onStartOver,
}) => {
  const shouldShowHint = !isCorrect && Boolean(level?.showHint) && hasVisibleFeedbackContent(hint);
  const shouldShowAnswer = !isCorrect && Boolean(level?.showAnswer) && hasVisibleFeedbackContent(correctAnswer);
  const shouldShowExplanationPanel = Boolean(isCorrect && showExplanation && hasVisibleFeedbackContent(explanation));
  const hasPrimaryMessage = Boolean(message);
  const hasFeedbackContent =
    hasPrimaryMessage || shouldShowHint || shouldShowAnswer || shouldShowExplanationPanel || Boolean(onContinue);
  const shouldRender = Boolean(onStartOver) || (isCorrect !== null && hasFeedbackContent);
  if (!shouldRender) return null;

  const showStatusPanel = isCorrect !== null && hasFeedbackContent;

  const baseClasses = 'mt-4 p-3 rounded-lg shadow-md border transition-all duration-200';
  const statusClasses = isCorrect
    ? 'bg-green-50 border-green-200 text-green-700'
    : 'bg-red-50 border-red-200 text-red-700';

  return (
    <div className={`${className}`}>
      {showStatusPanel ? (
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
                  <div className="flex-1 text-sm">{renderFeedbackBody(hint as FeedbackBody)}</div>
                </div>
              )}

              {shouldShowAnswer && (
                <div className="flex items-start gap-2 mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-800">
                  <Check className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600" />
                  <div className="flex-1 text-sm">
                    {typeof correctAnswer === 'string' ? (
                      <span>
                        Correct answer: <span className="font-mono">{correctAnswer}</span>
                      </span>
                    ) : (
                      <div className="space-y-2">
                        <div className="font-medium">Correct answer</div>
                        {correctAnswer}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Show explanation after correct answer */}
      {shouldShowExplanationPanel && (
        <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-blue-800">{renderFeedbackBody(explanation, 'text-sm leading-relaxed')}</div>
        </div>
      )}

      {(isCorrect || allowContinueOnIncorrect) && onContinue && (
        <button
          onClick={onContinue}
          className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white font-medium rounded-lg transition-colors ${
            isCorrect ? 'bg-green-600 hover:bg-green-700' : 'bg-roman-red hover:bg-red-700'
          }`}>
          Continue
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {onStartOver && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-gray-600 text-center">Too many mistakes on this question.</p>
          <button
            onClick={onStartOver}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-roman-red hover:bg-red-700 text-white font-medium rounded-lg transition-colors">
            <RotateCcw className="h-4 w-4" />
            Start over
          </button>
        </div>
      )}
    </div>
  );
};

export default FeedbackDisplay;
