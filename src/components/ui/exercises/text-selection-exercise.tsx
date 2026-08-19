'use client';

import React, { useState } from 'react';
import { TextSelectionExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useDelayedExerciseReset } from '@/src/hooks/useDelayedExerciseReset';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FeedbackDisplay } from '../feedback';
import { validateTextSelectionExercise } from '@/src/utils/exercises/textSelectionExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { ClickableRichDisplay } from '../core/clickable-rich-display';
import { hasVisibleFeedbackContent } from '@/src/utils/feedbackVisibility';
import type { ExerciseAnswer, ExerciseAnswerHandler, RuntimeMode } from '@/src/types/runtime-mode';
import { RecordedAnswerControls } from './recorded-answer-controls';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';
import { splitHtmlIntoWords } from '@/src/utils/htmlWordSplitter';

interface Props {
  exercise: TextSelectionExercise;
  onComplete?: (score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
}

const TextSelectionExerciseComponent: React.FC<Props> = ({
  exercise,
  onComplete,
  runtimeMode,
  onAnswer,
  initialAnswer,
}) => {
  const mode = runtimeMode ?? 'practice';
  const assessmentMode = mode !== 'practice';
  const testAnswerMode = mode === 'test';
  const passageWords = splitHtmlIntoWords(exercise.data.passage);
  const restoredIndices = initialAnswer?.type === 'text-selection' ? initialAnswer.selectedWordIndices : [];
  const restoredIndex = Math.min(restoredIndices.length, Math.max(exercise.data.questions.length - 1, 0));
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(restoredIndices[restoredIndex] ?? null);
  const [submittedIndices, setSubmittedIndices] = useState<number[]>(restoredIndices);
  const [isProcessing, setIsProcessing] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(restoredIndices[restoredIndex] !== undefined);

  const {
    currentIndex,
    isLastItem,
    isAwaitingConfirmation,
    autoAdvanceIfEnabled,
    confirmAdvance,
    resetIndex,
    nextItem,
  } = useExerciseProgression({
    totalItems: exercise.data.questions.length,
    initialIndex: restoredIndex,
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
    reset,
    shouldResetExercise,
    resetExercise,
  } = useExerciseFeedback(exercise.feedbackConfig);

  useDelayedExerciseReset({
    shouldReset: !assessmentMode && shouldResetExercise,
    delayMs: exercise.itemProgressionDelay,
    onReset: () => {
      setSelectedWordIndex(null);
      setIsProcessing(false);
      setTestSubmitted(false);
      setSubmittedIndices([]);
      resetIndex();
      resetExercise();
    },
  });

  const handleWordClick = (wordIndex: number) => {
    if (isProcessing) return; // Prevent multiple rapid clicks

    setSelectedWordIndex(wordIndex);
    const nextIndices = [...submittedIndices];
    nextIndices[currentIndex] = wordIndex;
    setSubmittedIndices(nextIndices);
    setIsProcessing(true);

    if (testAnswerMode) {
      onAnswer?.({ type: 'text-selection', selectedWordIndices: nextIndices });
      setTestSubmitted(true);
      return;
    }

    const validation = validateTextSelectionExercise(wordIndex, exercise, currentIndex);
    const finalScore = isLastItem
      ? Math.round(gradeExercisePercentage({ exercise }, { type: 'text-selection', selectedWordIndices: nextIndices }))
      : null;

    if (validation.isCorrect) {
      handleCorrect(isLastItem);

      const hasVisibleExplanation =
        (exercise.feedbackConfig.successMessage?.showExplanation ?? true) &&
        hasVisibleFeedbackContent(currentQuestion.explanation);

      if (isLastItem) {
        autoAdvanceIfEnabled(() => {
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
          onComplete?.(finalScore!);
        }, hasVisibleExplanation);
      } else {
        autoAdvanceIfEnabled(() => {
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
        }, hasVisibleExplanation);
      }
    } else {
      handleIncorrect();
      if (assessmentMode) {
        autoAdvanceIfEnabled(() => {
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
          if (finalScore !== null) onComplete?.(finalScore);
        }, false);
      } else {
        setIsProcessing(false);
      }
    }
  };

  const currentQuestion = exercise.data.questions[currentIndex];

  const continueTest = () => {
    if (isLastItem) {
      onComplete?.(0);
      return;
    }
    setSelectedWordIndex(null);
    setTestSubmitted(false);
    setIsProcessing(false);
    reset();
    nextItem();
  };

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex justify-between items-start">
        {exercise.title && (
          <h3 className="text-xl font-serif text-roman-red mb-4">
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
        <div className="p-6 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} className="whitespace-pre-wrap break-words" />
        </div>
      )}

      {/* Progress indicator */}
      <ExerciseProgress
        current={currentIndex}
        total={exercise.data.questions.length}
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

      <div className="p-6 bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <SimpleRichDisplay
            content={currentQuestion.text}
            className="mb-6 whitespace-pre-wrap break-words min-w-[300px]"
          />
          <ClickableRichDisplay
            content={exercise.data.passage}
            onWordClick={handleWordClick}
            selectedWordIndex={selectedWordIndex}
            isCorrect={isCorrect}
            className="min-w-[300px]"
          />
        </div>

        {testAnswerMode ? (
          testSubmitted && <RecordedAnswerControls isLastItem={isLastItem} onContinue={continueTest} />
        ) : (
          <FeedbackDisplay
            isCorrect={isCorrect}
            message={assessmentMode ? '' : message}
            level={assessmentMode ? null : level}
            hint={assessmentMode ? undefined : currentQuestion.hint}
            correctAnswer={
              assessmentMode || !passageWords[currentQuestion.correctWordIndex] ? undefined : (
                <SimpleRichDisplay content={passageWords[currentQuestion.correctWordIndex]} />
              )
            }
            explanation={assessmentMode ? undefined : currentQuestion.explanation}
            showExplanation={!assessmentMode && showExplanation}
            onContinue={(isCorrect || assessmentMode) && isAwaitingConfirmation ? confirmAdvance : undefined}
            allowContinueOnIncorrect={assessmentMode}
          />
        )}
      </div>
    </div>
  );
};

export default TextSelectionExerciseComponent;
