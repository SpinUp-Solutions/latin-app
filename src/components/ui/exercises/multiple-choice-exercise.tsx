'use client';

import React, { useState } from 'react';
import { MultipleChoiceExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useDelayedExerciseReset } from '@/src/hooks/useDelayedExerciseReset';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FeedbackDisplay } from '../feedback';
import { validateMultipleChoiceExercise } from '@/src/utils/exercises/multipleChoiceExercise';
import { Button } from '@/src/components/ui/button';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { cn } from '@/src/lib/utils';
import { hasVisibleFeedbackContent } from '@/src/utils/feedbackVisibility';
import type { ExerciseAnswer, ExerciseAnswerHandler, RuntimeMode } from '@/src/types/runtime-mode';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';

interface Props {
  exercise: MultipleChoiceExercise;
  onComplete?: (score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
  /** @deprecated Use runtimeMode="test". */
}

const MultipleChoiceExerciseComponent: React.FC<Props> = ({
  exercise,
  onComplete,
  runtimeMode,
  onAnswer,
  initialAnswer,
}) => {
  const mode = runtimeMode ?? 'practice';
  const assessmentMode = mode !== 'practice';
  const testAnswerMode = mode === 'test';
  const restoredOptionIds = initialAnswer?.type === 'multiple-choice' ? initialAnswer.selectedOptionIds : [];
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(restoredOptionIds);
  const [hasSubmitted, setHasSubmitted] = useState(restoredOptionIds.length > 0);
  const [isProcessing, setIsProcessing] = useState(false);
  const { isAwaitingConfirmation, autoAdvanceIfEnabled, confirmAdvance } = useExerciseProgression({
    totalItems: 1,
    itemProgressionDelay: exercise.itemProgressionDelay,
    progressionRules: exercise.feedbackConfig.progressionRules,
  });

  const {
    isCorrect,
    message,
    level,
    showExplanation,
    handleCorrect,
    handleIncorrect,
    clearFeedback,
    shouldResetExercise,
    resetExercise,
  } = useExerciseFeedback(exercise.feedbackConfig);

  useDelayedExerciseReset({
    shouldReset: !assessmentMode && shouldResetExercise,
    delayMs: exercise.itemProgressionDelay,
    onReset: () => {
      setSelectedOptionIds([]);
      setHasSubmitted(false);
      setIsProcessing(false);
      resetExercise();
    },
  });

  const handleOptionSelect = (optionId: string) => {
    if (hasSubmitted || isProcessing) return;

    const hasMultipleCorrect = exercise.data.options.filter(opt => opt.isCorrect).length > 1;
    const allowMultiple = hasMultipleCorrect || exercise.data.allowMultipleSelections;

    if (allowMultiple) {
      setSelectedOptionIds(prev =>
        prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]
      );
    } else {
      setSelectedOptionIds([optionId]);
    }
  };

  const handleSubmit = () => {
    if (selectedOptionIds.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setHasSubmitted(true);
    if (testAnswerMode) {
      onAnswer?.({ type: 'multiple-choice', selectedOptionIds });
      setIsProcessing(false);
      onComplete?.(0);
      return;
    }

    const score = Math.round(gradeExercisePercentage({ exercise }, { type: 'multiple-choice', selectedOptionIds }));
    const validation = validateMultipleChoiceExercise(selectedOptionIds, exercise);

    if (validation.isCorrect) {
      handleCorrect(true);
      const hasVisibleExplanation =
        (exercise.feedbackConfig.successMessage?.showExplanation ?? true) &&
        hasVisibleFeedbackContent(exercise.data.explanation);

      autoAdvanceIfEnabled(() => {
        setIsProcessing(false);
        onComplete?.(score);
      }, hasVisibleExplanation);
    } else {
      handleIncorrect();
      setIsProcessing(false);
      if (assessmentMode) onComplete?.(score);
    }
  };

  const handleReset = () => {
    setSelectedOptionIds([]);
    setHasSubmitted(false);
    clearFeedback();
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

      {exercise.instructions && exercise.instructions.replace(/<[^>]*>/g, '').trim() !== '' && (
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

        {!hasSubmitted && (
          <div className="flex justify-center">
            <Button onClick={handleSubmit} disabled={selectedOptionIds.length === 0 || isProcessing} className="px-8">
              {isProcessing ? 'Submitting...' : 'Submit Answer'}
            </Button>
          </div>
        )}

        {/* Try Again Button */}
        {hasSubmitted && isCorrect === false && !assessmentMode && (
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
          />
        )}
      </div>
    </div>
  );
};

export default MultipleChoiceExerciseComponent;
