'use client';

import React, { useState } from 'react';
import { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useGeneratedExerciseQueue } from '@/src/hooks/useGeneratedExerciseQueue';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import { ExerciseIntro } from './exercise-intro';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { type GeneratedExerciseQuerySource } from '@/src/store/api/generatedExerciseApi';
import { Card, CardContent } from '../card';
import { ExerciseMessageCard } from './exercise-status-card';
import { GeneratedExerciseItems } from './generated-exercise-items';
import type {
  FormIdentificationItem,
  SingleFieldFormIdentificationItem,
  MultiAnswerFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import {
  validateGeneratedFormIdentificationExercise,
  validateSingleFieldFormIdentificationExercise,
  validateMultiAnswerStep,
  validatePartialMultiAnswerPaths,
} from '@/src/utils/exercises/generatedFormIdentificationExercise';
import { normalizeAnswer } from '@/src/utils/exercises/helpers';
import { formatLabel } from '@/src/utils/label-formatter';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';
import { getContentTypeLabel } from '@/src/lib/content/registry';
import { narrowFormIdentificationItem, type ResolvedFormIdentificationItem } from '@/src/lib/tests/generated-exercises';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';
import { MISSED_ANSWER_PROGRESSION_DELAY } from '@/src/utils/feedbackDefaults';

interface Props {
  exercise: GeneratedFormIdentificationExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
  resolvedItems?: ResolvedFormIdentificationItem[];
  generatedExerciseSource?: GeneratedExerciseQuerySource;
}

const getExpectedAnswerCount = (item: ResolvedFormIdentificationItem) => {
  const paths = (item as { primaryFormPaths?: unknown[] }).primaryFormPaths;
  const explicit = (item as { expectedAnswerCount?: unknown }).expectedAnswerCount;
  if (Array.isArray(paths)) return paths.length;
  return typeof explicit === 'number' && explicit > 0 ? explicit : 1;
};

const GeneratedFormIdentificationExerciseComponent: React.FC<Props> = props => (
  <GeneratedExerciseItems
    exercise={props.exercise}
    runtimeMode={props.runtimeMode}
    resolvedItems={props.resolvedItems}
    source={props.generatedExerciseSource}>
    {items => <GeneratedExerciseSession {...props} items={items} />}
  </GeneratedExerciseItems>
);

const GeneratedExerciseSession: React.FC<Props & { items: ResolvedFormIdentificationItem[] }> = ({
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
  const [wordAnswers, setWordAnswers] = useState<Record<string, Record<string, string>>>({});
  const [multiAnswerSlots, setMultiAnswerSlots] = useState<Record<string, string[][]>>({});

  const isSingleField = exercise.data.mode === 'single-field';
  const requireAllPrimaryAnswers = exercise.data.requireAllPrimaryAnswers ?? false;
  const isMultiAnswerMode = !isSingleField && requireAllPrimaryAnswers;

  // A word's earlier correct answers narrow which forms its later steps accept.
  const itemAt = (index: number) => {
    const item = items[index];
    return isSingleField || isMultiAnswerMode
      ? item
      : narrowFormIdentificationItem(item as FormIdentificationItem, wordAnswers[item.wordId] ?? {});
  };
  const restoredAnswers =
    !queueEnabled && initialAnswer?.type === 'generated-form-identification' ? initialAnswer.answers : {};
  const firstUnansweredIndex = items.findIndex(item => !restoredAnswers[item.id]?.trim());
  const restoredIndex = firstUnansweredIndex >= 0 ? firstUnansweredIndex : Math.max(items.length - 1, 0);
  const restoredItemId = items[restoredIndex]?.id;
  const [userAnswer, setUserAnswer] = useState(restoredItemId ? (restoredAnswers[restoredItemId] ?? '') : '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, string>>(restoredAnswers);

  const { order, requeueWord } = useGeneratedExerciseQueue(items.map(item => item.wordId));
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
    setWordAnswers({});
    setMultiAnswerSlots({});
    setSubmittedAnswers({});
    setIsProcessing(false);
    resetIndex();
    resetExercise();
  };

  const handleSubmit = () => {
    if (isProcessing || items.length === 0 || !userAnswer.trim() || resetRequired) return;
    if (currentIndex >= items.length) return;

    const currentItem = itemAt(itemIndex);
    const nextAnswers = { ...submittedAnswers, [currentItem.id]: userAnswer };
    setSubmittedAnswers(nextAnswers);
    setIsProcessing(true);

    if (testAnswerMode) {
      onAnswer?.({ type: 'generated-form-identification', answers: nextAnswers });
      continueTest();
      return;
    }

    let correct = false;
    if (isSingleField) {
      correct = validateSingleFieldFormIdentificationExercise(
        userAnswer,
        currentItem as SingleFieldFormIdentificationItem
      ).isCorrect;
    } else if (isMultiAnswerMode) {
      const item = currentItem as MultiAnswerFormIdentificationItem;
      const validation = validateMultiAnswerStep(userAnswer, item);
      if (validation.isCorrect) {
        const slots = [...(multiAnswerSlots[item.wordId] || [])];
        slots[item.stepIndex] = validation.answerSlots;
        correct = validatePartialMultiAnswerPaths(
          slots,
          item.steps.slice(0, item.stepIndex + 1),
          item.primaryFormPaths
        ).isCorrect;
        if (correct) setMultiAnswerSlots(previous => ({ ...previous, [item.wordId]: slots }));
      }
    } else {
      const item = currentItem as FormIdentificationItem;
      correct = validateGeneratedFormIdentificationExercise(userAnswer, item).isCorrect;
      if (correct) {
        setWordAnswers(previous => ({
          ...previous,
          [item.wordId]: { ...previous[item.wordId], [item.step]: normalizeAnswer(userAnswer) },
        }));
      }
    }

    if (correct) handleCorrect(isLastItem);
    else handleIncorrect();

    if (queueEnabled && !correct) {
      setFailures(previous => ({ ...previous, [itemIndex]: (previous[itemIndex] ?? 0) + 1 }));
    }
    if (!queueEnabled && !correct) {
      setIsProcessing(false);
      return;
    }

    let finalScore: number | null = null;
    if (correct && isLastItem) {
      finalScore = Math.round(
        gradeExercisePercentage(
          { exercise, resolvedItems: items },
          { type: 'generated-form-identification', answers: nextAnswers }
        )
      );
    }
    if (finalScore !== null) onCompletionAccepted?.(finalScore);
    autoAdvanceIfEnabled(
      () => {
        if (finalScore !== null) {
          onComplete?.(finalScore);
          return;
        }
        if (queueEnabled && !correct) {
          const wordId = currentItem.wordId;
          setWordAnswers(previous => ({ ...previous, [wordId]: {} }));
          setMultiAnswerSlots(previous => ({ ...previous, [wordId]: [] }));
          setSubmittedAnswers(previous => {
            const next = { ...previous };
            for (const item of items) if (item.wordId === wordId) delete next[item.id];
            return next;
          });
          goToItem(requeueWord(currentIndex));
        }
        setUserAnswer('');
        reset();
        setIsProcessing(false);
      },
      false,
      correct ? 0 : MISSED_ANSWER_PROGRESSION_DELAY
    );
  };

  const continueTest = () => {
    if (isLastItem) {
      onComplete?.(0);
      return;
    }
    const nextItemId = items[currentIndex + 1]?.id;
    setUserAnswer(nextItemId ? (submittedAnswers[nextItemId] ?? '') : '');
    setIsProcessing(false);
    reset();
    nextItem();
  };

  if (items.length === 0) {
    return (
      <ExerciseMessageCard
        tone="warning"
        title="No items found"
        message="No vocabulary words match the configured filters for this exercise."
      />
    );
  }

  const currentItem = itemAt(itemIndex);
  const nextWordId = items[order[currentIndex + 1]]?.wordId;
  const completedWords =
    new Set(
      order
        .slice(0, currentIndex)
        .map(index => items[index].wordId)
        .filter(id => id !== currentItem.wordId)
    ).size + (isCorrect === true && nextWordId !== currentItem.wordId ? 1 : 0);
  const totalWords = new Set(items.map(item => item.wordId)).size;

  return (
    <div className="space-y-4">
      <ExerciseIntro
        variant="plain"
        title={exercise.title || getContentTypeLabel(exercise.type)}
        audioPath={exercise.audioPath}
        instructions={exercise.instructions}
      />

      {/* Practice counts words, matching the authored question count; tests grade and count each step. */}
      <ExerciseProgress
        currentIndex={testAnswerMode ? currentIndex : completedWords}
        completed={
          testAnswerMode ? items.filter(item => Boolean(submittedAnswers[item.id]?.trim())).length : completedWords
        }
        total={testAnswerMode ? items.length : totalWords}
        label={testAnswerMode ? 'Question' : 'Word'}
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            {!isSingleField && (
              <div className="text-sm text-gray-500">
                Step:{' '}
                <span className="font-medium">
                  {formatLabel(
                    isMultiAnswerMode
                      ? (currentItem as MultiAnswerFormIdentificationItem).step
                      : (currentItem as FormIdentificationItem).step
                  )}
                </span>
              </div>
            )}
            <div className="text-lg font-medium flex items-baseline gap-2">
              <span className="bg-roman-red text-white px-2 py-0.5 rounded">
                <SimpleRichDisplay
                  className="text-white prose-p:text-white"
                  content={
                    currentItem.hasSelectedForm
                      ? currentItem.selected_form
                      : currentItem.dictionary_entry || currentItem.selected_form
                  }
                />
              </span>
              {exercise.data.showDictionaryEntry &&
                currentItem.hasSelectedForm &&
                (currentItem.dictionary_entry || currentItem.root_word) &&
                (currentItem.dictionary_entry || currentItem.root_word) !== currentItem.selected_form && (
                  <span className="text-xs font-medium text-gray-400">
                    <SimpleRichDisplay content={currentItem.dictionary_entry || currentItem.root_word} />
                  </span>
                )}
            </div>
          </div>

          <div className="text-sm text-gray-600">
            {isSingleField ? (
              <>
                <strong>Question:</strong> Identify the:{' '}
                <span className="font-medium">
                  {(currentItem as SingleFieldFormIdentificationItem).steps.map(formatLabel).join(', ')}
                </span>
                <div className="text-xs text-gray-500 mt-1">
                  Format: values separated by commas
                  {getExpectedAnswerCount(currentItem) > 1 && ', multiple answers by semicolons'} (e.g.,{' '}
                  {getExpectedAnswerCount(currentItem) > 1
                    ? `${(currentItem as SingleFieldFormIdentificationItem).steps.map(() => 'x').join(',')};${(currentItem as SingleFieldFormIdentificationItem).steps.map(() => 'y').join(',')}`
                    : (currentItem as SingleFieldFormIdentificationItem).steps.map(() => 'x').join(',')}
                  )
                </div>
              </>
            ) : isMultiAnswerMode ? (
              <>
                <strong>Question:</strong> Identify the{' '}
                <span className="font-medium">
                  {formatLabel((currentItem as MultiAnswerFormIdentificationItem).step)}
                </span>
                {(currentItem as MultiAnswerFormIdentificationItem).expectedAnswerCount > 1 && (
                  <div className="text-xs text-gray-500 mt-1">
                    Enter {(currentItem as MultiAnswerFormIdentificationItem).expectedAnswerCount} answers separated by
                    semicolons (e.g., x;y)
                  </div>
                )}
              </>
            ) : (
              <>
                <strong>Question:</strong> What is the{' '}
                <span className="font-medium">{formatLabel((currentItem as FormIdentificationItem).step)}</span> of this
                word?
              </>
            )}
          </div>

          <ExerciseInput
            value={userAnswer}
            onChange={setUserAnswer}
            onSubmit={handleSubmit}
            placeholder={
              isSingleField
                ? `e.g., ${(currentItem as SingleFieldFormIdentificationItem).steps.map(() => 'value').join(',')}${getExpectedAnswerCount(currentItem) > 1 ? ';...' : ''}`
                : isMultiAnswerMode && (currentItem as MultiAnswerFormIdentificationItem).expectedAnswerCount > 1
                  ? `e.g., answer1;answer2`
                  : 'Type your answer...'
            }
            disabled={isProcessing || resetRequired}
          />

          {!testAnswerMode && (
            <FeedbackDisplay
              isCorrect={isCorrect}
              message={feedbackMessage}
              level={feedbackLevel}
              hint={currentItem.hint}
              correctAnswer={
                isSingleField
                  ? (currentItem as SingleFieldFormIdentificationItem).correctAnswerDisplay
                  : isMultiAnswerMode
                    ? (currentItem as MultiAnswerFormIdentificationItem).correctAnswerDisplay
                    : (currentItem as FormIdentificationItem).correctAnswer
              }
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

export default GeneratedFormIdentificationExerciseComponent;
