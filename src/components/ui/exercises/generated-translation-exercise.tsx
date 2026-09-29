'use client';

import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { usePracticeGeneratedExerciseWords } from '@/src/hooks/usePracticeGeneratedExerciseWords';
import React, { useState, useMemo } from 'react';
import { GeneratedTranslationExercise } from '@/src/types/exercises';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useGeneratedExerciseQueue } from '@/src/hooks/useGeneratedExerciseQueue';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import { ExerciseIntro } from './exercise-intro';
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

const GeneratedTranslationExerciseComponent: React.FC<Props> = props => {
  const {
    exercise,
    runtimeMode,
    resolvedItems,
    allowGeneratedExerciseQueries = false,
    generatedExerciseSource,
  } = props;
  const mode = runtimeMode ?? 'practice';
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

  if (!resolvedItems && isLoading) return <ExerciseLoadingCard />;
  if (!resolvedItems && isError) {
    return (
      <ExerciseMessageCard
        title="Error loading exercise"
        message="Unable to fetch vocabulary words. Please try again later."
      />
    );
  }
  // A different exercise or sample starts a fresh session and cancels pending advancement.
  return (
    <GeneratedExerciseSession
      key={JSON.stringify([exercise, mode, resolvedItems ?? data?.words ?? []])}
      {...props}
      words={data?.words ?? []}
    />
  );
};

const GeneratedExerciseSession: React.FC<Props & { words: ExerciseWordResponse[] }> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
  resolvedItems,
  words,
}) => {
  const mode = runtimeMode ?? 'practice';
  const assessmentMode = mode !== 'practice';
  const queueEnabled = mode === 'practice' && (exercise.data.retryIncorrectAnswers ?? true);
  const testAnswerMode = mode === 'test';
  const sectioned = useSectionedTest();

  const translationDirection = exercise.translationDirection || 'latin-to-english';

  const items: GeneratedTranslationItem[] = useMemo(() => {
    if (resolvedItems) return resolvedItems;
    return createGeneratedTranslationItems(exercise, words);
  }, [words, exercise, resolvedItems]);
  const restoredAnswers = !queueEnabled && initialAnswer?.type === 'generated-translation' ? initialAnswer.answers : [];
  const firstIncompleteIndex = items.findIndex((_, index) => !restoredAnswers[index]?.trim());
  const restoredIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(items.length - 1, 0);
  const [userAnswer, setUserAnswer] = useState(restoredAnswers[restoredIndex] ?? '');
  const [submittedAnswers, setSubmittedAnswers] = useState<string[]>(restoredAnswers);
  const [isProcessing, setIsProcessing] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(Boolean(restoredAnswers[restoredIndex]?.trim()));

  const { order, requeueWord } = useGeneratedExerciseQueue(items.map((_, index) => index));
  const [failures, setFailures] = useState<Record<number, number>>({});
  const {
    currentIndex,
    isLastItem,
    isAwaitingConfirmation,
    autoAdvanceIfEnabled,
    confirmAdvance,
    resetIndex,
    goToItem,
    nextItem,
    cancelPendingAdvance,
  } = useExerciseProgression({
    totalItems: items.length,
    initialIndex: restoredIndex,
    itemProgressionDelay: exercise.itemProgressionDelay,
    progressionRules: exercise.feedbackConfig.progressionRules,
  });

  const itemIndex = order[currentIndex];

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

  const resetRequired = mode === 'practice' && !queueEnabled && shouldResetExercise;
  const escalationLevels = exercise.feedbackConfig.escalationLevels ?? [];
  const queueLevel = escalationLevels[Math.min((failures[itemIndex] ?? 0) - 1, escalationLevels.length - 1)];
  const feedbackLevel = queueEnabled && isCorrect === false ? queueLevel : level;
  const feedbackMessage =
    queueEnabled && isCorrect === false ? queueLevel?.message || 'Incorrect. You’ll try this word again.' : message;

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

    const currentItem = items[itemIndex];
    const nextAnswers = [...submittedAnswers];
    nextAnswers[itemIndex] = userAnswer;
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

    const correct = validateGeneratedTranslationExercise(userAnswer, currentItem).isCorrect;
    if (correct) handleCorrect(isLastItem);
    else handleIncorrect();

    if (queueEnabled && !correct) {
      setFailures(previous => ({ ...previous, [itemIndex]: (previous[itemIndex] ?? 0) + 1 }));
    }
    if (!queueEnabled && !correct && !assessmentMode) {
      setIsProcessing(false);
      return;
    }

    let finalScore: number | null = null;
    if (isLastItem && (correct || assessmentMode)) {
      finalScore = Math.round(
        gradeExercisePercentage(
          { exercise, resolvedItems: items },
          { type: 'generated-translation', answers: nextAnswers }
        )
      );
    }
    if (!assessmentMode && finalScore !== null) onCompletionAccepted?.(finalScore);
    autoAdvanceIfEnabled(() => {
      if (correct && finalScore !== null) {
        onComplete?.(finalScore);
        return;
      }
      if (queueEnabled && !correct) goToItem(requeueWord(currentIndex));
      setUserAnswer('');
      reset();
      setIsProcessing(false);
      if (finalScore !== null) onComplete?.(finalScore);
    }, false);
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

  if (items.length === 0) {
    return (
      <ExerciseMessageCard
        tone="warning"
        title="No vocabulary found"
        message="No words match the configured filters for this exercise."
      />
    );
  }

  const currentItem = items[itemIndex];
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
        label={queueEnabled ? 'Word' : 'Question'}
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="text-lg font-medium">
            <SimpleRichDisplay content={currentItem.text} />
          </div>

          <ExerciseInput
            value={userAnswer}
            onChange={setUserAnswer}
            onSubmit={handleSubmit}
            placeholder={inputPlaceholder}
            disabled={isProcessing || resetRequired}
          />

          {testAnswerMode ? (
            !sectioned && testSubmitted && <RecordedAnswerControls isLastItem={isLastItem} onContinue={continueTest} />
          ) : (
            <FeedbackDisplay
              isCorrect={isCorrect}
              message={assessmentMode ? '' : feedbackMessage}
              level={assessmentMode ? null : feedbackLevel}
              hint={assessmentMode ? undefined : currentItem.hint}
              correctAnswer={assessmentMode ? undefined : currentItem.acceptedAnswers.join(' OR ')}
              showExplanation={!assessmentMode && showExplanation}
              onContinue={
                (isCorrect || assessmentMode || queueEnabled) && isAwaitingConfirmation ? confirmAdvance : undefined
              }
              allowContinueOnIncorrect={assessmentMode || queueEnabled}
              onStartOver={resetRequired ? handleExerciseReset : undefined}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GeneratedTranslationExerciseComponent;
