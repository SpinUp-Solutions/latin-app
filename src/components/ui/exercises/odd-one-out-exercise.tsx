'use client';

import React, { useState } from 'react';
import { OddOneOutExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { FeedbackDisplay } from '../feedback';
import { validateOddOneOutExercise } from '@/src/utils/exercises/oddOneOutExercise';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { SimpleRichEditor } from '../core/simple-rich-editor';
import { Button } from '../button';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  exercise: OddOneOutExercise;
  onComplete?: () => void;
}

const OddOneOutExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [userExplanation, setUserExplanation] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const { isCorrect, message, level, showExplanation, handleCorrect, handleIncorrect } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleItemSelect = (itemId: string) => {
    if (hasSubmitted) return;
    setSelectedItemId(itemId);
  };

  const handleSubmit = () => {
    if (isProcessing || !selectedItemId) return;

    setIsProcessing(true);
    setHasSubmitted(true);

    const validation = validateOddOneOutExercise(selectedItemId, userExplanation, exercise);

    if (validation.isCorrect) {
      handleCorrect(true);

      // Auto-advance logic
      if (exercise.feedbackConfig.progressionRules?.autoAdvance !== false) {
        const delay = exercise.feedbackConfig.timingConfig?.nextExerciseDelay || 2000;
        setTimeout(() => {
          onComplete?.();
        }, delay);
      }
    } else {
      // Let the feedback system handle escalation - don't pass hint/correct answer
      handleIncorrect();
    }

    setIsProcessing(false);
  };

  const handleReset = () => {
    setSelectedItemId(null);
    setUserExplanation('');
    setHasSubmitted(false);
    // Don't reset feedback state - preserve escalation level for next attempt
  };

  return (
    <div className="space-y-4">
      {/* Header with title and audio */}
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

      {/* Instructions */}
      {exercise.instructions && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} />
        </div>
      )}

      <div className="p-6 bg-white rounded-lg border border-gray-200">
        {/* Question */}
        {exercise.data.question && (
          <div className="mb-6">
            <h4 className="text-base font-medium text-gray-900 mb-4">
              <SimpleRichDisplay content={exercise.data.question} />
            </h4>
          </div>
        )}

        {/* Items Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {exercise.data.items.map(item => {
            const isSelected = selectedItemId === item.id;
            const isCorrectItem = item.isOddOneOut;
            // Only show correct answer when user got it right OR feedback system says to show answer
            const showCorrectHighlight = hasSubmitted && isCorrectItem && (isCorrect === true || level?.showAnswer);
            const showIncorrectHighlight = hasSubmitted && isSelected && !isCorrectItem && level?.showAnswer;

            return (
              <button
                key={item.id}
                onClick={() => handleItemSelect(item.id)}
                disabled={hasSubmitted}
                className={`
                  relative p-4 rounded-lg border-2 transition-all duration-200 text-left
                  ${
                    showCorrectHighlight
                      ? 'border-green-500 bg-green-50'
                      : showIncorrectHighlight
                        ? 'border-red-500 bg-red-50'
                        : isSelected
                          ? 'border-roman-terracotta bg-roman-parchment'
                          : 'border-gray-200 hover:border-roman-terracotta/50 hover:bg-gray-50'
                  }
                  ${hasSubmitted ? 'cursor-default' : 'cursor-pointer'}
                `}>
                <div className="text-base font-medium">
                  <SimpleRichDisplay content={item.text} />
                </div>

                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle2
                      className={`w-5 h-5 ${
                        showCorrectHighlight
                          ? 'text-green-600'
                          : showIncorrectHighlight
                            ? 'text-red-600'
                            : 'text-roman-terracotta'
                      }`}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Optional explanation input */}
        {exercise.data.requireExplanation && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Explain why this item doesn&apos;t belong:
            </label>
            <SimpleRichEditor
              content={userExplanation}
              onChange={setUserExplanation}
              placeholder="Explain your reasoning..."
              rows={3}
              className="w-full"
              disabled={hasSubmitted}
            />
          </div>
        )}

        {/* Submit/Reset buttons */}
        <div className="flex gap-3 mb-4">
          {!hasSubmitted ? (
            <Button
              onClick={handleSubmit}
              disabled={!selectedItemId || isProcessing}
              className="bg-roman-terracotta hover:bg-roman-terracotta/90 text-white">
              {isProcessing ? 'Checking...' : 'Submit Answer'}
            </Button>
          ) : (
            <Button
              onClick={handleReset}
              variant="outline"
              className="border-roman-terracotta text-roman-terracotta hover:bg-roman-parchment">
              Try Again
            </Button>
          )}
        </div>

        {/* Feedback Display */}
        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={exercise.data.hint}
          correctAnswer={exercise.data.items.find(item => item.isOddOneOut)?.text}
          explanation={exercise.data.explanation}
          showExplanation={showExplanation}
        />
      </div>
    </div>
  );
};

export default OddOneOutExerciseComponent;
