'use client';

import React, { useState } from 'react';
import { MultipleChoiceExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { FeedbackDisplay } from '../feedback';
import { validateMultipleChoiceExercise } from '@/src/utils/exercises/multipleChoiceExercise';
import { Button } from '@/src/components/ui/button';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { cn } from '@/src/lib/utils';

interface Props {
  exercise: MultipleChoiceExercise;
  onComplete?: (score: number) => void;
}

const MultipleChoiceExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { isCorrect, message, level, showExplanation, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleOptionSelect = (optionId: string) => {
    if (hasSubmitted || isProcessing) return;
    setSelectedOptionId(optionId);
    // Reset feedback when user selects an option
    if (isCorrect !== null) {
      reset();
    }
  };

  const handleSubmit = () => {
    if (!selectedOptionId || isProcessing) return;

    setIsProcessing(true);
    setHasSubmitted(true);

    const validation = validateMultipleChoiceExercise(selectedOptionId, exercise);

    if (validation.isCorrect) {
      handleCorrect(true);
      const score = 100;

      onComplete?.(score);
    } else {
      handleIncorrect();
    }

    setIsProcessing(false);
  };

  const handleReset = () => {
    setSelectedOptionId(null);
    setHasSubmitted(false);
    // Don't reset feedback state - preserve escalation level for next attempt
  };

  const getOptionClassName = (optionId: string) => {
    if (!hasSubmitted) {
      return selectedOptionId === optionId ? 'bg-blue-50 border-blue-300 text-blue-900' : 'hover:bg-gray-50';
    }

    const option = exercise.data.options.find(opt => opt.id === optionId);

    if (selectedOptionId === optionId && option?.isCorrect) {
      return 'bg-green-50 border-green-300 text-green-900';
    } else if (selectedOptionId === optionId && !option?.isCorrect) {
      return 'bg-red-50 border-red-300 text-red-900';
    }
    // All other options remain neutral
    return 'opacity-60';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        {exercise.title && (
          <h3 className="text-lg font-serif text-roman-red mb-2">
            <SimpleRichDisplay content={exercise.title} />
          </h3>
        )}
        {exercise.audioPath && (
          <AudioPlayButton
            audioPath={exercise.audioPath}
            variant="default"
            size="sm"
            className="ml-2 rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
          />
        )}
      </div>

      {exercise.instructions && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} />
        </div>
      )}

      <div className="p-6 bg-white rounded-lg border border-gray-200">
        {/* Question */}
        <div className="mb-6">
          <h4 className="text-lg font-medium mb-4">
            <SimpleRichDisplay content={exercise.data.question} />
          </h4>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          {exercise.data.options.map((option, index) => (
            <button
              key={option.id}
              onClick={() => handleOptionSelect(option.id)}
              disabled={hasSubmitted || isProcessing}
              className={cn(
                'w-full p-4 text-left rounded-lg border-2 transition-all duration-200',
                'flex items-center gap-3',
                getOptionClassName(option.id),
                !hasSubmitted && !isProcessing && 'cursor-pointer',
                (hasSubmitted || isProcessing) && 'cursor-not-allowed'
              )}>
              <div
                className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                  selectedOptionId === option.id ? 'border-current' : 'border-gray-300'
                )}>
                <span className="text-sm font-medium">{String.fromCharCode(65 + index)}</span>
              </div>
              <div className="flex-1">
                <SimpleRichDisplay content={option.text} />
              </div>
            </button>
          ))}
        </div>

        {/* Submit Button */}
        {!hasSubmitted && (
          <div className="flex justify-center">
            <Button onClick={handleSubmit} disabled={!selectedOptionId || isProcessing} className="px-8">
              {isProcessing ? 'Submitting...' : 'Submit Answer'}
            </Button>
          </div>
        )}

        {/* Try Again Button */}
        {hasSubmitted && isCorrect === false && (
          <div className="flex justify-center">
            <Button onClick={handleReset} variant="outline" disabled={isProcessing} className="px-8">
              Try Again
            </Button>
          </div>
        )}

        {/* Feedback Display */}
        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={exercise.data.hint}
          correctAnswer={exercise.data.options.find(opt => opt.isCorrect)?.text}
          explanation={exercise.data.explanation}
          showExplanation={showExplanation}
        />
      </div>
    </div>
  );
};

export default MultipleChoiceExerciseComponent;
