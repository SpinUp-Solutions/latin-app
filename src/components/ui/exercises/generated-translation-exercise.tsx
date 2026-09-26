'use client';

import { usePracticeGeneratedExerciseWords } from '@/src/hooks/usePracticeGeneratedExerciseWords';
import React, { useState, useMemo } from 'react';
import { GeneratedTranslationExercise } from '@/src/types/exercises';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import { ExerciseIntro } from './exercise-intro';
import { applySequentialItemResult } from './sequential-item-result';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { type GeneratedExerciseQuerySource } from '@/src/store/api/advancedVocabularyApi';
import { Card, CardContent } from '../card';
import { ExerciseLoadingCard, ExerciseMessageCard } from './exercise-status-card';
import {
  validateGeneratedTranslationExercise,
  type GeneratedTranslationItem,
} from '@/src/utils/exercises/generatedTranslationExercise';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';
import { getContentTypeLabel } from '@/src/lib/content/registry';
import { createGeneratedTranslationItems } from '@/src/lib/tests/generated-exercises';
import { useSectionedTest } from '../test/sectioned-test-context';
import { RecordedAnswerControls } from './recorded-answer-controls';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';

interface Props {
  exercise: GeneratedTranslationExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
  resolvedItems?: GeneratedTranslationItem[];
  allowGeneratedExerciseQueries?: boolean;
  generatedExerciseSource?: GeneratedExerciseQuerySource;
}

const GeneratedTranslationExerciseComponent: React.FC<Props> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
  resolvedItems,
  allowGeneratedExerciseQueries = false,
  generatedExerciseSource,
}) => {
  const mode = runtimeMode ?? 'practice';
  const assessmentMode = mode !== 'practice';
  const testAnswerMode = mode === 'test';
  const sectioned = useSectionedTest();

  const translationDirection = exercise.translationDirection || 'latin-to-english';

  const { data, isLoading, isError } = usePracticeGeneratedExerciseWords(
    {
      exercise: {
        type: 'generated-translation',
        translationDirection,
        data: exercise.data,
      },
      source: generatedExerciseSource ?? { kind: 'admin-preview' },
    },
    {
      skip:
        (!generatedExerciseSource && !allowGeneratedExerciseQueries) ||
        (mode === 'test' && !allowGeneratedExerciseQueries) ||
        resolvedItems !== undefined,
    }
  );

  const items: GeneratedTranslationItem[] = useMemo(() => {
    if (resolvedItems) return resolvedItems;
    if (!data?.words) return [];
    return createGeneratedTranslationItems(exercise, data.words);
  }, [data, exercise, resolvedItems]);
  const restoredAnswers = initialAnswer?.type === 'generated-translation' ? initialAnswer.answers : [];
  const firstIncompleteIndex = items.findIndex((_, index) => !restoredAnswers[index]?.trim());
  const restoredIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(items.length - 1, 0);
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
    totalItems: items.length,
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
    if (isProcessing || items.length === 0 || !userAnswer.trim() || resetRequired) return;

    const currentItem = items[currentIndex];
    const nextAnswers = [...submittedAnswers];
    nextAnswers[currentIndex] = userAnswer;
    setSubmittedAnswers(nextAnswers);
    setIsProcessing(true);

    if (testAnswerMode) {
      onAnswer?.({ type: 'generated-translation', answers: nextAnswers });
      setTestSubmitted(true);
      if (sectioned) {
        if (isLastItem) onComplete?.(0);
        else continueTest();
      }
      return;
    }

    const validation = validateGeneratedTranslationExercise(userAnswer, currentItem);
    const finalScore = isLastItem
      ? Math.round(
          gradeExercisePercentage(
            { exercise, resolvedItems: items },
            { type: 'generated-translation', answers: nextAnswers }
          )
        )
      : null;

    applySequentialItemResult({
      isCorrect: validation.isCorrect,
      isLastItem,
      assessmentMode,
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

  if (!resolvedItems && isLoading) return <ExerciseLoadingCard />;

  if (!resolvedItems && isError) {
    return (
      <ExerciseMessageCard
        title="Error loading exercise"
        message="Unable to fetch vocabulary words. Please try again later."
      />
    );
  }

  if (items.length === 0) {
    return (
      <ExerciseMessageCard
        tone="warning"
        title="No vocabulary found"
        message="No words match the configured filters for this exercise."
      />
    );
  }

  const currentItem = items[currentIndex];
  const inputPlaceholder =
    translationDirection === 'english-to-latin' ? 'Type the Latin root word...' : 'Type your answer...';

  return (
    <div className="space-y-4">
      <ExerciseIntro
        variant="plain"
        title={exercise.title || getContentTypeLabel(exercise.type)}
        audioPath={exercise.audioPath}
        instructions={exercise.instructions}
      />

      <ExerciseProgress
        currentIndex={currentIndex}
        completed={
          mode === 'practice'
            ? currentIndex + (isCorrect === true ? 1 : 0)
            : submittedAnswers.filter(answer => Boolean(answer?.trim())).length
        }
        total={items.length}
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="text-lg font-medium">
            <SimpleRichDisplay content={currentItem.text} />
          </div>

          <ExerciseInput
            value={userAnswer}
            onChange={handleAnswerChange}
            onSubmit={handleSubmit}
            placeholder={inputPlaceholder}
            disabled={isProcessing || resetRequired}
          />

          {testAnswerMode ? (
            !sectioned && testSubmitted && <RecordedAnswerControls isLastItem={isLastItem} onContinue={continueTest} />
          ) : (
            <FeedbackDisplay
              isCorrect={isCorrect}
              message={assessmentMode ? '' : message}
              level={assessmentMode ? null : level}
              hint={assessmentMode ? undefined : currentItem.hint}
              correctAnswer={assessmentMode ? undefined : currentItem.acceptedAnswers.join(' OR ')}
              showExplanation={!assessmentMode && showExplanation}
              onContinue={(isCorrect || assessmentMode) && isAwaitingConfirmation ? confirmAdvance : undefined}
              allowContinueOnIncorrect={assessmentMode}
              onStartOver={resetRequired ? handleExerciseReset : undefined}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GeneratedTranslationExerciseComponent;
