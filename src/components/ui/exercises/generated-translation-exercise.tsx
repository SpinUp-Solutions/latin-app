'use client';

import React, { useState } from 'react';
import { GeneratedTranslationExercise } from '@/src/types/exercises';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useGeneratedExerciseQueue } from '@/src/hooks/useGeneratedExerciseQueue';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import { ExerciseIntro } from './exercise-intro';
import { applySequentialItemResult } from './sequential-item-result';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { type GeneratedExerciseQuerySource } from '@/src/store/api/generatedExerciseApi';
import { Card, CardContent } from '../card';
import { ExerciseMessageCard } from './exercise-status-card';
import { GeneratedExerciseItems } from './generated-exercise-items';
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
import { gradeExercisePercentage } from '@/src/lib/tests/grading';
import { MISSED_ANSWER_PROGRESSION_DELAY } from '@/src/utils/feedbackDefaults';
import { revealsHintOrAnswer } from '@/src/utils/feedbackVisibility';

interface Props {
  exercise: GeneratedTranslationExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
  resolvedItems?: GeneratedTranslationItem[];
  generatedExerciseSource?: GeneratedExerciseQuerySource;
}

const GeneratedTranslationExerciseComponent: React.FC<Props> = props => (
  <GeneratedExerciseItems
    exercise={props.exercise}
    runtimeMode={props.runtimeMode}
    resolvedItems={props.resolvedItems}
    source={props.generatedExerciseSource}>
    {items => <GeneratedExerciseSession {...props} items={items} />}
  </GeneratedExerciseItems>
);

const GeneratedExerciseSession: React.FC<Props & { items: GeneratedTranslationItem[] }> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
  items,
}) => {
  const mode = runtimeMode ?? 'practice';
  const queueEnabled = mode === 'practice' && (exercise.data.retryIncorrectAnswers ?? true);
  const testAnswerMode = mode === 'test';
  const translationDirection = exercise.translationDirection || 'latin-to-english';

  const restoredAnswers = !queueEnabled && initialAnswer?.type === 'generated-translation' ? initialAnswer.answers : [];
  const firstIncompleteIndex = items.findIndex((_, index) => !restoredAnswers[index]?.trim());
  const restoredIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(items.length - 1, 0);
  const [userAnswer, setUserAnswer] = useState(restoredAnswers[restoredIndex] ?? '');
  const [submittedAnswers, setSubmittedAnswers] = useState<string[]>(restoredAnswers);
  const [isProcessing, setIsProcessing] = useState(false);

  const { order, requeueWord } = useGeneratedExerciseQueue(items.map((_, index) => index));
  const [failures, setFailures] = useState<Record<number, number>>({});

  const {
    currentIndex,
    isLastItem,
    isAwaitingConfirmation,
    autoAdvanceIfEnabled,
    awaitConfirmation,
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
  // A missed word leaves for the back of the queue, so it shows the answer at once when any level reveals it.
  const answerLevel = escalationLevels.find(candidate => candidate.showAnswer);
  const levelAfterMisses = (misses: number) =>
    answerLevel ?? escalationLevels[Math.min(misses - 1, escalationLevels.length - 1)];
  const queueLevel = levelAfterMisses(failures[itemIndex] ?? 0);
  const feedbackLevel = queueEnabled && isCorrect === false ? queueLevel : level;
  const correctAnswerOf = (item: GeneratedTranslationItem) => item.acceptedAnswers.join(' OR ');
  const feedbackMessage =
    queueEnabled && isCorrect === false ? queueLevel?.message || 'Incorrect. You’ll try this word again.' : message;

  const handleExerciseReset = () => {
    cancelPendingAdvance();
    setUserAnswer('');
    setIsProcessing(false);
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
      continueTest();
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

    if (queueEnabled && !validation.isCorrect) {
      handleIncorrect();
      setFailures(previous => ({ ...previous, [itemIndex]: (previous[itemIndex] ?? 0) + 1 }));
      const requeue = () => {
        goToItem(requeueWord(currentIndex));
        setUserAnswer('');
        reset();
        setIsProcessing(false);
      };
      // A shown hint or answer stays until the student acknowledges it.
      const missLevel = levelAfterMisses((failures[itemIndex] ?? 0) + 1);
      if (revealsHintOrAnswer(missLevel, currentItem.hint, correctAnswerOf(currentItem))) {
        awaitConfirmation(requeue);
      } else {
        autoAdvanceIfEnabled(requeue, false, exercise.incorrectItemProgressionDelay ?? MISSED_ANSWER_PROGRESSION_DELAY);
      }
      return;
    }

    applySequentialItemResult({
      isCorrect: validation.isCorrect,
      isLastItem,
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
            onChange={handleAnswerChange}
            onSubmit={handleSubmit}
            placeholder={inputPlaceholder}
            disabled={isProcessing || resetRequired}
          />

          {!testAnswerMode && (
            <FeedbackDisplay
              isCorrect={isCorrect}
              message={feedbackMessage}
              level={feedbackLevel}
              hint={currentItem.hint}
              correctAnswer={correctAnswerOf(currentItem)}
              showExplanation={showExplanation}
              onContinue={(isCorrect || queueEnabled) && isAwaitingConfirmation ? confirmAdvance : undefined}
              allowContinueOnIncorrect={queueEnabled}
              onStartOver={resetRequired ? handleExerciseReset : undefined}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GeneratedTranslationExerciseComponent;
