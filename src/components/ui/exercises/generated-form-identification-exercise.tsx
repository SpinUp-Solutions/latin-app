'use client';

import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import { usePracticeGeneratedExerciseWords } from '@/src/hooks/usePracticeGeneratedExerciseWords';
import React, { useState, useMemo } from 'react';
import { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
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
  FormIdentificationItemSchema,
  type FormIdentificationItem,
  SingleFieldFormIdentificationItemSchema,
  type SingleFieldFormIdentificationItem,
  MultiAnswerFormIdentificationItemSchema,
  type MultiAnswerFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import {
  validateGeneratedFormIdentificationExercise,
  validateSingleFieldFormIdentificationExercise,
  validateMultiAnswerStep,
  validatePartialMultiAnswerPaths,
  scoreSingleFieldFormIdentificationAnswer,
  normalize,
} from '@/src/utils/exercises/generatedFormIdentificationExercise';
import {
  filterPathsByPreviousAnswers,
  extractStepValuesFromPaths,
  getAcceptedAnswersForMultipleValues,
  formatPrimaryAnswersDisplay,
} from '@/src/utils/exercises/formIdentificationHelpers';
import { formatLabel } from '@/src/utils/label-formatter';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';
import { getContentTypeLabel } from '@/src/lib/content/registry';
import { createGeneratedFormIdentificationItems } from '@/src/lib/tests/generated-exercises';
import { useSectionedTest } from '../test/sectioned-test-context';
import { RecordedAnswerControls } from './recorded-answer-controls';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';

interface Props {
  exercise: GeneratedFormIdentificationExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
  resolvedItems?: Array<FormIdentificationItem | SingleFieldFormIdentificationItem | MultiAnswerFormIdentificationItem>;
  allowGeneratedExerciseQueries?: boolean;
  generatedExerciseSource?: GeneratedExerciseQuerySource;
}

type ItemType = FormIdentificationItem | SingleFieldFormIdentificationItem | MultiAnswerFormIdentificationItem;

const getExpectedAnswerCount = (item: ItemType) => {
  const paths = (item as { primaryFormPaths?: unknown[] }).primaryFormPaths;
  const explicit = (item as { expectedAnswerCount?: unknown }).expectedAnswerCount;
  if (Array.isArray(paths)) return paths.length;
  return typeof explicit === 'number' && explicit > 0 ? explicit : 1;
};

const GeneratedFormIdentificationExerciseComponent: React.FC<Props> = props => {
  const {
    exercise,
    runtimeMode,
    resolvedItems,
    allowGeneratedExerciseQueries = false,
    generatedExerciseSource,
  } = props;
  const mode = runtimeMode ?? 'practice';
  const { data, isLoading, isError } = usePracticeGeneratedExerciseWords(
    {
      exercise: {
        type: 'generated-form-identification',
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
  const [wordAnswers, setWordAnswers] = useState<Record<string, Record<string, string>>>({});
  const [multiAnswerSlots, setMultiAnswerSlots] = useState<Record<string, string[][]>>({});

  const isSingleField = exercise.data.mode === 'single-field';
  const requireAllPrimaryAnswers = exercise.data.requireAllPrimaryAnswers ?? false;
  const isMultiAnswerMode = !isSingleField && requireAllPrimaryAnswers;

  const items: ItemType[] = useMemo(() => {
    if (resolvedItems) {
      if (!queueEnabled || isSingleField || isMultiAnswerMode) return resolvedItems;
      return resolvedItems.map(rawItem => {
        const parsed = FormIdentificationItemSchema.safeParse(rawItem);
        if (!parsed.success) return rawItem;
        const item = parsed.data;
        if (!item.primaryFormPaths.length && !item.optionalFormPaths.length) return item;
        const answers = wordAnswers[item.wordId] ?? {};
        const primary = filterPathsByPreviousAnswers(item.primaryFormPaths, answers);
        const optional = filterPathsByPreviousAnswers(item.optionalFormPaths, answers);
        const acceptedAnswers = getAcceptedAnswersForMultipleValues([
          ...extractStepValuesFromPaths(primary, item.step),
          ...extractStepValuesFromPaths(optional, item.step),
        ]);
        return {
          ...item,
          primaryFormPaths: primary,
          optionalFormPaths: optional,
          acceptedAnswers,
          correctAnswer:
            formatPrimaryAnswersDisplay(primary, item.step) || formatPrimaryAnswersDisplay(optional, item.step),
        };
      });
    }
    return createGeneratedFormIdentificationItems(exercise, words, wordAnswers);
  }, [words, exercise, wordAnswers, resolvedItems, queueEnabled, isSingleField, isMultiAnswerMode]);

  const validatedItems = useMemo(() => {
    if (mode === 'test') return items;

    if (isSingleField) {
      return items
        .map(item => SingleFieldFormIdentificationItemSchema.safeParse(item))
        .filter((result): result is { success: true; data: SingleFieldFormIdentificationItem } => result.success)
        .map(result => result.data);
    }

    if (isMultiAnswerMode) {
      const multiItems = items as MultiAnswerFormIdentificationItem[];
      const wordGroups = new Map<string, MultiAnswerFormIdentificationItem[]>();

      for (const item of multiItems) {
        const existing = wordGroups.get(item.wordId) || [];
        existing.push(item);
        wordGroups.set(item.wordId, existing);
      }

      const validatedResults: MultiAnswerFormIdentificationItem[] = [];

      for (const groupItems of wordGroups.values()) {
        const parsedItems = groupItems.map(item => ({
          item,
          result: MultiAnswerFormIdentificationItemSchema.safeParse(item),
        }));

        const allValid = parsedItems.every(p => p.result.success);

        if (allValid) {
          for (const p of parsedItems) {
            if (p.result.success) {
              validatedResults.push(p.result.data);
            }
          }
        }
      }

      return validatedResults;
    }

    return items
      .map(item => FormIdentificationItemSchema.safeParse(item))
      .filter((result): result is { success: true; data: FormIdentificationItem } => result.success)
      .map(result => result.data);
  }, [items, isSingleField, isMultiAnswerMode, mode]);
  const restoredAnswers =
    !queueEnabled && initialAnswer?.type === 'generated-form-identification' ? initialAnswer.answers : {};
  const firstUnansweredIndex = validatedItems.findIndex(item => !restoredAnswers[item.id]?.trim());
  const restoredIndex = firstUnansweredIndex >= 0 ? firstUnansweredIndex : Math.max(validatedItems.length - 1, 0);
  const restoredItemId = validatedItems[restoredIndex]?.id;
  const [userAnswer, setUserAnswer] = useState(restoredItemId ? (restoredAnswers[restoredItemId] ?? '') : '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(
    Boolean(restoredItemId && restoredAnswers[restoredItemId]?.trim())
  );
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, string>>(restoredAnswers);

  const { order, requeueWord } = useGeneratedExerciseQueue(validatedItems.map(item => item.wordId));
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
    totalItems: validatedItems.length,
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
    setTestSubmitted(false);
    setIsProcessing(false);
    resetIndex();
    resetExercise();
  };

  const handleSubmit = () => {
    if (isProcessing || validatedItems.length === 0 || !userAnswer.trim() || resetRequired) return;
    if (currentIndex >= validatedItems.length) return;

    const currentItem = validatedItems[itemIndex];
    const nextAnswers = { ...submittedAnswers, [currentItem.id]: userAnswer };
    setSubmittedAnswers(nextAnswers);
    setIsProcessing(true);

    if (testAnswerMode) {
      onAnswer?.({ type: 'generated-form-identification', answers: nextAnswers });
      setTestSubmitted(true);
      if (sectioned) {
        if (isLastItem) onComplete?.(0);
        else continueTest();
      }
      return;
    }

    let correct = false;
    if (isSingleField) {
      const item = currentItem as SingleFieldFormIdentificationItem;
      if (assessmentMode) {
        const credit = scoreSingleFieldFormIdentificationAnswer(userAnswer, item);
        correct = credit.availableUnits > 0 && credit.earnedUnits === credit.availableUnits;
      } else {
        correct = validateSingleFieldFormIdentificationExercise(userAnswer, item).isCorrect;
      }
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
          [item.wordId]: { ...previous[item.wordId], [item.step]: normalize(userAnswer) },
        }));
      }
    }

    if (correct) handleCorrect(isLastItem);
    else handleIncorrect();

    if (assessmentMode) {
      setTestSubmitted(true);
      return;
    }
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
          { exercise, resolvedItems: validatedItems },
          { type: 'generated-form-identification', answers: nextAnswers }
        )
      );
    }
    if (finalScore !== null) onCompletionAccepted?.(finalScore);
    autoAdvanceIfEnabled(() => {
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
          for (const item of validatedItems) if (item.wordId === wordId) delete next[item.id];
          return next;
        });
        goToItem(requeueWord(currentIndex));
      }
      setUserAnswer('');
      reset();
      setIsProcessing(false);
    }, false);
  };

  const continueTest = () => {
    if (isLastItem) {
      const score = testAnswerMode
        ? 0
        : gradeExercisePercentage(
            { exercise, resolvedItems: validatedItems },
            { type: 'generated-form-identification', answers: submittedAnswers }
          );
      onComplete?.(score);
      return;
    }
    const nextItemId = validatedItems[currentIndex + 1]?.id;
    const nextAnswer = nextItemId ? (submittedAnswers[nextItemId] ?? '') : '';
    setUserAnswer(nextAnswer);
    setTestSubmitted(Boolean(nextAnswer.trim()));
    setIsProcessing(false);
    reset();
    nextItem();
  };

  if (validatedItems.length === 0) {
    return (
      <ExerciseMessageCard
        tone="warning"
        title="No items found"
        message="No vocabulary words match the configured filters for this exercise."
      />
    );
  }

  const currentItem = validatedItems[itemIndex];
  const nextWordId = validatedItems[order[currentIndex + 1]]?.wordId;
  const completedWords =
    new Set(
      order
        .slice(0, currentIndex)
        .map(index => validatedItems[index].wordId)
        .filter(id => id !== currentItem.wordId)
    ).size + (isCorrect === true && nextWordId !== currentItem.wordId ? 1 : 0);
  const totalWords = new Set(validatedItems.map(item => item.wordId)).size;

  return (
    <div className="space-y-4">
      <ExerciseIntro
        variant="plain"
        title={exercise.title || getContentTypeLabel(exercise.type)}
        audioPath={exercise.audioPath}
        instructions={exercise.instructions}
      />

      <ExerciseProgress
        currentIndex={queueEnabled ? completedWords : currentIndex}
        completed={
          queueEnabled
            ? completedWords
            : mode === 'practice'
              ? currentIndex + (isCorrect === true ? 1 : 0)
              : validatedItems.filter(item => Boolean(submittedAnswers[item.id]?.trim())).length
        }
        total={queueEnabled ? totalWords : validatedItems.length}
        label={queueEnabled ? 'Word' : 'Question'}
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
            disabled={isProcessing || testSubmitted || resetRequired}
          />

          {!assessmentMode && (
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
              onContinue={
                !assessmentMode && (isCorrect || queueEnabled) && isAwaitingConfirmation ? confirmAdvance : undefined
              }
              allowContinueOnIncorrect={queueEnabled}
              onStartOver={resetRequired ? handleExerciseReset : undefined}
            />
          )}
          {assessmentMode && testSubmitted && !sectioned && (
            <RecordedAnswerControls isLastItem={isLastItem} onContinue={continueTest} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GeneratedFormIdentificationExerciseComponent;
