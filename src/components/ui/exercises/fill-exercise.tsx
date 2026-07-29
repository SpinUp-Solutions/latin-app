'use client';

import React, { useState } from 'react';
import { FillExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useDelayedExerciseReset } from '@/src/hooks/useDelayedExerciseReset';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { validateFillExercise } from '@/src/utils/exercises/fillExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { hasVisibleFeedbackContent } from '@/src/utils/feedbackVisibility';
import type { ExerciseAnswer, ExerciseAnswerHandler, RuntimeMode } from '@/src/types/runtime-mode';
import { RecordedAnswerControls } from './recorded-answer-controls';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';

interface Props {
  exercise: FillExercise;
  onComplete?: (score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
}

const FillExerciseComponent: React.FC<Props> = ({ exercise, onComplete, runtimeMode, onAnswer, initialAnswer }) => {
  const mode = runtimeMode ?? 'practice';
  const assessmentMode = mode !== 'practice';
  const testAnswerMode = mode === 'test';
  const restoredAnswers = initialAnswer?.type === 'fill' ? initialAnswer.answers : [];
  const firstIncompleteIndex = exercise.data.items.findIndex((_, index) => !restoredAnswers[index]?.trim());
  const restoredIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(exercise.data.items.length - 1, 0);
  const [userAnswer, setUserAnswer] = useState(restoredAnswers[restoredIndex] ?? '');
  const [submittedAnswers, setSubmittedAnswers] = useState<string[]>(restoredAnswers);
  const [isProcessing, setIsProcessing] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(Boolean(restoredAnswers[restoredIndex]?.trim()));

  const {
    currentIndex,
    isLastItem,
    isAwaitingConfirmation,
    autoAdvanceIfEnabled,
    confirmAdvance,
    resetIndex,
    nextItem,
  } = useExerciseProgression({
    totalItems: exercise.data.items.length,
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
      setUserAnswer('');
      setIsProcessing(false);
      setTestSubmitted(false);
      setSubmittedAnswers([]);
      resetIndex();
      resetExercise();
    },
  });

  const handleSubmit = () => {
    if (isProcessing || !userAnswer.trim()) return;

    const nextAnswers = [...submittedAnswers];
    nextAnswers[currentIndex] = userAnswer;
    setSubmittedAnswers(nextAnswers);
    setIsProcessing(true);

    if (testAnswerMode) {
      onAnswer?.({ type: 'fill', answers: nextAnswers });
      setTestSubmitted(true);
      return;
    }

    const validation = validateFillExercise(userAnswer, exercise, currentIndex);
    const finalScore = isLastItem
      ? Math.round(gradeExercisePercentage({ exercise }, { type: 'fill', answers: nextAnswers }))
      : null;

    if (validation.isCorrect) {
      handleCorrect(isLastItem);

      const hasVisibleExplanation =
        (exercise.feedbackConfig.successMessage?.showExplanation ?? true) &&
        hasVisibleFeedbackContent(currentItem.explanation);

      if (isLastItem) {
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
          onComplete?.(finalScore!);
        }, hasVisibleExplanation);
      } else {
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
        }, hasVisibleExplanation);
      }
    } else {
      handleIncorrect();
      if (assessmentMode) {
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
          if (finalScore !== null) onComplete?.(finalScore);
        }, false);
      } else {
        setIsProcessing(false);
      }
    }
  };

  const handleAnswerChange = (value: string) => {
    setUserAnswer(value);
  };

  const continueTest = () => {
    if (isLastItem) {
      onComplete?.(0);
      return;
    }
    const nextAnswer = submittedAnswers[currentIndex + 1] ?? '';
    setUserAnswer(nextAnswer);
    setTestSubmitted(Boolean(nextAnswer.trim()));
    setIsProcessing(false);
    reset();
    nextItem();
  };

  const currentItem = exercise.data.items[currentIndex];

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

      {/* Progress indicator */}
      <ExerciseProgress
        current={currentIndex}
        total={exercise.data.items.length}
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <SimpleRichDisplay content={currentItem.text} className="mb-4" />
        <ExerciseInput
          value={userAnswer}
          onChange={handleAnswerChange}
          onSubmit={handleSubmit}
          placeholder="Type your answer"
          disabled={isProcessing}
        />

        {testAnswerMode ? (
          testSubmitted && <RecordedAnswerControls isLastItem={isLastItem} onContinue={continueTest} />
        ) : (
          <FeedbackDisplay
            isCorrect={isCorrect}
            message={assessmentMode ? '' : message}
            level={assessmentMode ? null : level}
            hint={assessmentMode ? undefined : currentItem.hint}
            correctAnswer={assessmentMode ? undefined : currentItem.answer}
            explanation={assessmentMode ? undefined : currentItem.explanation}
            showExplanation={!assessmentMode && showExplanation}
            onContinue={(isCorrect || assessmentMode) && isAwaitingConfirmation ? confirmAdvance : undefined}
            allowContinueOnIncorrect={assessmentMode}
          />
        )}
      </div>
    </div>
  );
};

export default FillExerciseComponent;
