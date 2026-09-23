'use client';

import React, { useState } from 'react';
import { FillExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { validateFillExercise } from '@/src/utils/exercises/fillExercise';
import { ExerciseProgress } from './exercise-progress';
import { ExerciseIntro } from './exercise-intro';
import { applySequentialItemResult } from './sequential-item-result';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';
import { useSectionedTest } from '../test/sectioned-test-context';
import { RecordedAnswerControls } from './recorded-answer-controls';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';

interface Props {
  exercise: FillExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
}

const FillExerciseComponent: React.FC<Props> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
}) => {
  const mode = runtimeMode ?? 'practice';
  const assessmentMode = mode !== 'practice';
  const testAnswerMode = mode === 'test';
  const sectioned = useSectionedTest();
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
    cancelPendingAdvance,
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

  const resetRequired = mode === 'practice' && shouldResetExercise;

  const handleExerciseReset = () => {
    cancelPendingAdvance();
    setUserAnswer('');
    setIsProcessing(false);
    setTestSubmitted(false);
    setSubmittedAnswers([]);
    resetIndex();
    resetExercise();
  };

  const handleSubmit = () => {
    if (isProcessing || !userAnswer.trim() || resetRequired) return;

    const nextAnswers = [...submittedAnswers];
    nextAnswers[currentIndex] = userAnswer;
    setSubmittedAnswers(nextAnswers);
    setIsProcessing(true);

    if (testAnswerMode) {
      onAnswer?.({ type: 'fill', answers: nextAnswers });
      setTestSubmitted(true);

      if (sectioned) {
        if (isLastItem) onComplete?.(0);
        else continueTest();
      } else if (isLastItem) onComplete?.(0);
      return;
    }

    const validation = validateFillExercise(userAnswer, exercise, currentIndex);
    const finalScore = isLastItem
      ? Math.round(gradeExercisePercentage({ exercise }, { type: 'fill', answers: nextAnswers }))
      : null;

    applySequentialItemResult({
      isCorrect: validation.isCorrect,
      isLastItem,
      assessmentMode,
      showExplanation: exercise.feedbackConfig.successMessage?.showExplanation,
      explanation: currentItem.explanation,
      finalScore,
      handleCorrect,
      handleIncorrect,
      autoAdvanceIfEnabled,
      onCompletionAccepted,
      onComplete,
      clearItem: () => {
        setUserAnswer('');
        reset();
      },
      stopProcessing: () => setIsProcessing(false),
    });
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
      <ExerciseIntro title={exercise.title} audioPath={exercise.audioPath} instructions={exercise.instructions} />

      {/* Progress indicator */}
      <ExerciseProgress
        currentIndex={currentIndex}
        completed={
          mode === 'practice'
            ? currentIndex + (isCorrect === true ? 1 : 0)
            : submittedAnswers.filter(answer => Boolean(answer?.trim())).length
        }
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
          disabled={isProcessing || resetRequired}
        />

        {testAnswerMode ? (
          !sectioned &&
          testSubmitted && <RecordedAnswerControls isLastItem={isLastItem} onContinue={continueTest} hideFinishAction />
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
            onStartOver={resetRequired ? handleExerciseReset : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default FillExerciseComponent;
