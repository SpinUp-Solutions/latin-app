'use client';

import React, { useState } from 'react';
import { MultipleChoiceExercise } from '@/src/types/exercise';
import { useSingleAnswerExercise } from '@/src/hooks/useSingleAnswerExercise';
import { FeedbackDisplay } from '../feedback';
import { validateMultipleChoiceExercise } from '@/src/utils/exercises/multipleChoiceExercise';
import { Button } from '@/src/components/ui/button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { ExerciseIntro } from './exercise-intro';
import { cn } from '@/src/lib/utils';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';

interface Props {
  exercise: MultipleChoiceExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
}

const MultipleChoiceExerciseComponent: React.FC<Props> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
}) => {
  const restoredOptionIds = initialAnswer?.type === 'multiple-choice' ? initialAnswer.selectedOptionIds : [];
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(restoredOptionIds);
  const {
    assessmentMode,
    hasSubmitted,
    isProcessing,
    resetRequired,
    isCorrect,
    message,
    level,
    showExplanation,
    isAwaitingConfirmation,
    confirmAdvance,
    submit,
    tryAgain,
    startOver,
  } = useSingleAnswerExercise({
    exercise,
    runtimeMode,
    // Restored test selections are saved drafts. Resuming must still let
    // students finish selecting options before they mark this exercise complete.
    initiallySubmitted: false,
    onAnswer,
    onComplete,
    onCompletionAccepted,
  });

  const handleExerciseReset = () => {
    startOver();
    setSelectedOptionIds([]);
  };

  const handleOptionSelect = (optionId: string) => {
    if (hasSubmitted || isProcessing || resetRequired) return;

    const hasMultipleCorrect = exercise.data.options.filter(opt => opt.isCorrect).length > 1;
    const allowMultiple = hasMultipleCorrect || exercise.data.allowMultipleSelections;

    const nextOptionIds = allowMultiple
      ? selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter(id => id !== optionId)
        : [...selectedOptionIds, optionId]
      : [optionId];
    setSelectedOptionIds(nextOptionIds);
    if (runtimeMode === 'test') onAnswer?.({ type: 'multiple-choice', selectedOptionIds: nextOptionIds });
  };

  const handleSubmit = () => {
    if (selectedOptionIds.length === 0 || hasSubmitted || isProcessing || resetRequired) return;
    submit(
      { type: 'multiple-choice', selectedOptionIds },
      () => validateMultipleChoiceExercise(selectedOptionIds, exercise).isCorrect
    );
  };

  const handleReset = () => {
    setSelectedOptionIds([]);
    tryAgain();
  };

  const getOptionClassName = (optionId: string) => {
    if (!hasSubmitted) {
      return selectedOptionIds.includes(optionId) ? 'bg-blue-50 border-blue-300 text-blue-900' : 'hover:bg-gray-50';
    }

    const option = exercise.data.options.find(opt => opt.id === optionId);
    const isSelected = selectedOptionIds.includes(optionId);
    const shouldRevealAnswers = !assessmentMode && (isCorrect || level?.showAnswer);

    if (option?.isCorrect && shouldRevealAnswers) {
      return 'bg-green-50 border-green-300 text-green-900';
    } else if (!assessmentMode && isSelected && !option?.isCorrect) {
      return 'bg-red-50 border-red-300 text-red-900';
    }

    return 'opacity-60';
  };

  return (
    <div className="space-y-4">
      <ExerciseIntro title={exercise.title} audioPath={exercise.audioPath} instructions={exercise.instructions} />

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
              type="button"
              aria-pressed={selectedOptionIds.includes(option.id)}
              onClick={() => handleOptionSelect(option.id)}
              disabled={hasSubmitted || isProcessing || resetRequired}
              className={cn(
                'w-full p-4 text-left rounded-lg border-2 transition-all duration-200',
                'flex items-center gap-3',
                getOptionClassName(option.id),
                !hasSubmitted && !isProcessing && !resetRequired && 'cursor-pointer',
                (hasSubmitted || isProcessing || resetRequired) && 'cursor-not-allowed'
              )}>
              <div
                className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                  selectedOptionIds.includes(option.id) ? 'border-current' : 'border-gray-300'
                )}>
                <span className="text-sm font-medium">{String.fromCharCode(65 + index)}</span>
              </div>
              <div className="flex-1">
                <SimpleRichDisplay content={option.text} />
              </div>
            </button>
          ))}
        </div>

        {!hasSubmitted && !resetRequired && (
          <div className="flex justify-center">
            <Button onClick={handleSubmit} disabled={selectedOptionIds.length === 0 || isProcessing} className="px-8">
              {isProcessing ? 'Submitting...' : 'Submit Answer'}
            </Button>
          </div>
        )}

        {/* Try Again Button */}
        {hasSubmitted && isCorrect === false && !assessmentMode && !resetRequired && (
          <div className="flex justify-center">
            <Button onClick={handleReset} variant="outline" disabled={isProcessing} className="px-8">
              Try Again
            </Button>
          </div>
        )}

        {!assessmentMode && (
          <FeedbackDisplay
            isCorrect={isCorrect}
            message={message}
            level={level}
            hint={exercise.data.hint}
            correctAnswer={exercise.data.options
              .filter(opt => opt.isCorrect)
              .map(opt => opt.text)
              .join(', ')}
            explanation={exercise.data.explanation}
            showExplanation={showExplanation}
            onContinue={isCorrect && isAwaitingConfirmation ? confirmAdvance : undefined}
            onStartOver={resetRequired ? handleExerciseReset : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default MultipleChoiceExerciseComponent;
