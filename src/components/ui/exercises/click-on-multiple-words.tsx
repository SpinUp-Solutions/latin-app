'use client';

import React, { useState } from 'react';
import { ClickOnMultipleWordsExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { FeedbackDisplay } from '../feedback';
import { validateClickOnMultipleWords } from '@/src/utils/exercises/clickOnMultipleWords';
import { Button } from '@/src/components/ui/button';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { MultiClickableRichDisplay } from '../core/multi-clickable-rich-display';

interface Props {
  exercise: ClickOnMultipleWordsExercise;
  onComplete?: (score: number) => void;
}

const ClickOnMultipleWordsComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationResult, setValidationResult] = useState<ReturnType<typeof validateClickOnMultipleWords> | null>(null);

  const { isCorrect, message, level, showExplanation, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleWordClick = (wordIndex: number) => {
    if (hasSubmitted || isProcessing) return;

    setSelectedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(wordIndex)) {
        newSet.delete(wordIndex);
      } else {
        newSet.add(wordIndex);
      }
      return newSet;
    });

    if (isCorrect !== null) {
      reset();
    }
  };

  const handleSubmit = () => {
    if (isProcessing) return;

    setIsProcessing(true);
    setHasSubmitted(true);

    const validation = validateClickOnMultipleWords(selectedIndices, exercise);
    setValidationResult(validation);

    if (validation.isCorrect) {
      handleCorrect();
      onComplete?.(validation.score);
    } else {
      handleIncorrect();
    }

    setIsProcessing(false);
  };

  const handleReset = () => {
    setSelectedIndices(new Set());
    setHasSubmitted(false);
    setValidationResult(null);
    reset();
  };

  const getSelectionSummary = () => {
    if (!validationResult) {
      return `${selectedIndices.size} of ${exercise.data.correctWordIndices.length} words selected`;
    }

    return `${validationResult.correctSelections} of ${validationResult.totalRequired} correct • Score: ${validationResult.score}%`;
  };

  return (
    <div className="space-y-4">
      {/* Exercise Header */}
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

      {/* Exercise Content */}
      <div className="p-6 bg-white rounded-lg border border-gray-200">
        {exercise.data.title && (
          <h4 className="text-lg font-serif text-roman-red mb-4">
            <SimpleRichDisplay content={exercise.data.title} />
          </h4>
        )}

        {/* Data Instructions */}
        {exercise.data.instructions && (
          <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
            <SimpleRichDisplay content={exercise.data.instructions} />
          </div>
        )}

        {/* Selection Counter */}
        <div className="mb-4 text-sm text-gray-600 text-center">
          {getSelectionSummary()}
        </div>

        {/* Interactive Passage */}
        <div className="overflow-x-auto">
          <MultiClickableRichDisplay
            content={exercise.data.passage}
            onWordClick={handleWordClick}
            selectedWordIndices={selectedIndices}
            correctIndices={validationResult ? new Set(Array.from(validationResult.selectedIndices).filter(i => validationResult.correctIndices.has(i))) : undefined}
            incorrectIndices={validationResult?.extraIndices}
            missedIndices={validationResult?.missedIndices}
            isSubmitted={hasSubmitted}
            className="min-w-[300px]"
          />
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-center gap-4">
          {!hasSubmitted && (
            <Button
              onClick={handleSubmit}
              disabled={isProcessing || selectedIndices.size === 0}
              className="px-8"
            >
              {isProcessing ? 'Checking...' : 'Submit Selections'}
            </Button>
          )}

          {hasSubmitted && isCorrect === false && (
            <Button onClick={handleReset} variant="outline" disabled={isProcessing} className="px-8">
              Try Again
            </Button>
          )}
        </div>

        {/* Selection Details (after submission) */}
        {hasSubmitted && validationResult && (
          <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
            <div className="text-center space-y-1">
              <div>✅ Correct selections: {validationResult.correctSelections}</div>
              {validationResult.overSelections > 0 && (
                <div>❌ Incorrect selections: {validationResult.overSelections}</div>
              )}
              {validationResult.missedIndices.size > 0 && (
                <div>⚠️ Missed words: {validationResult.missedIndices.size}</div>
              )}
            </div>
          </div>
        )}

        {/* Feedback Display */}
        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={exercise.data.hint}
          explanation={exercise.data.explanation}
          showExplanation={showExplanation}
        />
      </div>
    </div>
  );
};

export default ClickOnMultipleWordsComponent;