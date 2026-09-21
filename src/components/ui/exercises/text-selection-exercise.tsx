'use client';

import React, { useState } from 'react';
import { TextSelectionExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FeedbackDisplay } from '../feedback';
import { validateTextSelectionExercise } from '@/src/utils/exercises/textSelectionExercise';
import { ExerciseProgress } from './exercise-progress';
import { ExerciseIntro } from './exercise-intro';
import { applySequentialItemResult } from './sequential-item-result';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { ClickableRichDisplay } from '../core/clickable-rich-display';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';
import { useSectionedTest } from '../test/sectioned-test-context';
import { RecordedAnswerControls } from './recorded-answer-controls';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';
import { splitHtmlIntoWords } from '@/src/utils/htmlWordSplitter';

interface Props {
  exercise: TextSelectionExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
}

const TextSelectionExerciseComponent: React.FC<Props> = ({
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
    cancelPendingAdvance,
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

  const resetRequired = mode === 'practice' && shouldResetExercise;

  const handleExerciseReset = () => {
    cancelPendingAdvance();
    setSelectedWordIndex(null);
    setIsProcessing(false);
    setTestSubmitted(false);
    setSubmittedIndices([]);
    resetIndex();
    resetExercise();
  };

  const handleWordClick = (wordIndex: number) => {
    if (isProcessing || resetRequired) return;

    setSelectedWordIndex(wordIndex);
    const nextIndices = [...submittedIndices];
    nextIndices[currentIndex] = wordIndex;
    setSubmittedIndices(nextIndices);
    setIsProcessing(true);

    if (testAnswerMode) {
      onAnswer?.({ type: 'text-selection', selectedWordIndices: nextIndices });
      setTestSubmitted(true);
      if (sectioned) {
        if (isLastItem) onComplete?.(0);
        else continueTest();
      }
      return;
    }

    const validation = validateTextSelectionExercise(wordIndex, exercise, currentIndex);
    const finalScore = isLastItem
      ? Math.round(gradeExercisePercentage({ exercise }, { type: 'text-selection', selectedWordIndices: nextIndices }))
      : null;

    applySequentialItemResult({
      isCorrect: validation.isCorrect,
      isLastItem,
      assessmentMode,
      showExplanation: exercise.feedbackConfig.successMessage?.showExplanation,
      explanation: currentQuestion.explanation,
      finalScore,
      handleCorrect,
      handleIncorrect,
      autoAdvanceIfEnabled,
      onCompletionAccepted,
      onComplete,
      clearItem: () => {
        setSelectedWordIndex(null);
        reset();
      },
      stopProcessing: () => setIsProcessing(false),
    });
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
      <ExerciseIntro
        variant="passage"
        title={exercise.title}
        audioPath={exercise.audioPath}
        instructions={exercise.instructions}
      />

      {/* Progress indicator */}
      <ExerciseProgress
        currentIndex={currentIndex}
        completed={
          mode === 'practice'
            ? currentIndex + (isCorrect === true ? 1 : 0)
            : submittedIndices.filter(index => typeof index === 'number').length
        }
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
          !sectioned && testSubmitted && <RecordedAnswerControls isLastItem={isLastItem} onContinue={continueTest} />
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
            onStartOver={resetRequired ? handleExerciseReset : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default TextSelectionExerciseComponent;
