'use client';

import React, { useState } from 'react';
import { ClickOnMultipleWordsExercise } from '@/src/types/exercise';
import { useSingleAnswerExercise } from '@/src/hooks/useSingleAnswerExercise';
import { FeedbackDisplay } from '../feedback';
import { validateClickOnMultipleWords } from '@/src/utils/exercises/clickOnMultipleWords';
import { Button } from '@/src/components/ui/button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { ExerciseIntro } from './exercise-intro';
import { MultiClickableRichDisplay } from '../core/multi-clickable-rich-display';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';
import { splitHtmlIntoWords } from '@/src/utils/htmlWordSplitter';

interface Props {
  exercise: ClickOnMultipleWordsExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
}

const ClickOnMultipleWordsComponent: React.FC<Props> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
}) => {
  const passageWords = splitHtmlIntoWords(exercise.data.passage);
  const restoredIndices = initialAnswer?.type === 'click-on-multiple-words' ? initialAnswer.selectedWordIndices : [];
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set(restoredIndices));
  const [validationResult, setValidationResult] = useState<ReturnType<typeof validateClickOnMultipleWords> | null>(
    null
  );
  const {
    testAnswerMode,
    hasSubmitted,
    isProcessing,
    resetRequired,
    isCorrect,
    message,
    level,
    showExplanation,
    clearFeedback,
    isAwaitingConfirmation,
    confirmAdvance,
    submit,
    tryAgain,
    startOver,
  } = useSingleAnswerExercise({
    exercise,
    runtimeMode,
    initiallySubmitted: restoredIndices.length > 0,
    onAnswer,
    onComplete,
    onCompletionAccepted,
  });

  const handleExerciseReset = () => {
    startOver();
    setSelectedIndices(new Set());
    setValidationResult(null);
  };

  const handleWordClick = (wordIndex: number) => {
    if (hasSubmitted || isProcessing || resetRequired) return;

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
      clearFeedback();
    }
  };

  const handleSubmit = () => {
    if (isProcessing || resetRequired) return;
    const selectedWordIndices = Array.from(selectedIndices).sort((a, b) => a - b);
    submit({ type: 'click-on-multiple-words', selectedWordIndices }, () => {
      const validation = validateClickOnMultipleWords(selectedIndices, exercise);
      setValidationResult(validation);
      return validation.isCorrect;
    });
  };

  const handleReset = () => {
    setSelectedIndices(new Set());
    setValidationResult(null);
    tryAgain();
  };

  const getSelectionSummary = () => {
    const requiredCount = exercise.data.correctWordIndices?.length ?? 0;
    if (testAnswerMode) return `${selectedIndices.size} words selected`;
    if (!validationResult) {
      return `${selectedIndices.size} of ${requiredCount} words selected`;
    }

    return `${validationResult.correctSelections} of ${validationResult.totalRequired} correct • Score: ${Math.round(validationResult.score)}%`;
  };

  return (
    <div className="space-y-4">
      {/* Exercise Header */}
      <ExerciseIntro title={exercise.title} audioPath={exercise.audioPath} instructions={exercise.instructions} />

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
        <div className="mb-4 text-sm text-gray-600 text-center">{getSelectionSummary()}</div>

        {/* Interactive Passage */}
        <div className="overflow-x-auto">
          <MultiClickableRichDisplay
            content={exercise.data.passage}
            onWordClick={handleWordClick}
            selectedWordIndices={selectedIndices}
            correctIndices={
              validationResult && !testAnswerMode
                ? new Set(
                    Array.from(validationResult.selectedIndices).filter(i => validationResult.correctIndices.has(i))
                  )
                : undefined
            }
            incorrectIndices={testAnswerMode ? undefined : validationResult?.extraIndices}
            missedIndices={testAnswerMode ? undefined : validationResult?.missedIndices}
            isSubmitted={!testAnswerMode && hasSubmitted}
            className="min-w-[300px]"
          />
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-center gap-4">
          {!hasSubmitted && !resetRequired && (
            <Button onClick={handleSubmit} disabled={isProcessing || selectedIndices.size === 0} className="px-8">
              {isProcessing ? 'Checking...' : 'Submit Selections'}
            </Button>
          )}

          {hasSubmitted && isCorrect === false && !testAnswerMode && !resetRequired && (
            <Button onClick={handleReset} variant="outline" disabled={isProcessing} className="px-8">
              Try Again
            </Button>
          )}
        </div>

        {/* Selection Details (after submission) */}
        {!testAnswerMode && hasSubmitted && validationResult && (
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
        {!testAnswerMode && (
          <FeedbackDisplay
            isCorrect={isCorrect}
            message={message}
            level={level}
            hint={exercise.data.hint}
            correctAnswer={
              <div className="flex flex-wrap items-center gap-1">
                {exercise.data.correctWordIndices.map(index => {
                  const word = passageWords[index];
                  if (!word) return null;
                  return (
                    <SimpleRichDisplay
                      key={`${index}-${word.slice(0, 10)}`}
                      content={word}
                      className="inline not-prose"
                    />
                  );
                })}
              </div>
            }
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

export default ClickOnMultipleWordsComponent;
