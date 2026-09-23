'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import { ExerciseIntro } from './exercise-intro';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import {
  useGetGeneratedExerciseWordsQuery,
  useSaveGeneratedFormDraftMutation,
  useResetGeneratedFormDraftMutation,
  type GeneratedExerciseQuerySource,
} from '@/src/store/api/advancedVocabularyApi';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { toast } from 'sonner';
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

const GeneratedFormIdentificationExerciseComponent: React.FC<Props> = ({
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
  const [saveGeneratedFormDraft] = useSaveGeneratedFormDraftMutation();
  const [resetGeneratedFormDraft] = useResetGeneratedFormDraftMutation();
  const draftHydratedRef = useRef(false);
  const [wordAnswers, setWordAnswers] = useState<Record<string, Record<string, string>>>({});
  const [multiAnswerSlots, setMultiAnswerSlots] = useState<Record<string, string[][]>>({});

  const isSingleField = exercise.data.mode === 'single-field';
  const requireAllPrimaryAnswers = exercise.data.requireAllPrimaryAnswers ?? false;
  const isMultiAnswerMode = !isSingleField && requireAllPrimaryAnswers;

  const { data, isLoading, isError } = useGetGeneratedExerciseWordsQuery(
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

  const items: ItemType[] = useMemo(() => {
    if (resolvedItems) return resolvedItems;
    if (data?.draftItems) return data.draftItems;
    if (!data?.words) return [];
    return createGeneratedFormIdentificationItems(exercise, data.words, wordAnswers);
  }, [data?.draftItems, data?.words, exercise, wordAnswers, resolvedItems]);

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
    initialAnswer?.type === 'generated-form-identification'
      ? initialAnswer.answers
      : mode === 'practice'
        ? (data?.draftAnswers ?? {})
        : {};
  const firstUnansweredIndex = validatedItems.findIndex(item => !restoredAnswers[item.id]?.trim());
  const restoredIndex = firstUnansweredIndex >= 0 ? firstUnansweredIndex : Math.max(validatedItems.length - 1, 0);
  const restoredItemId = validatedItems[restoredIndex]?.id;
  const [userAnswer, setUserAnswer] = useState(restoredItemId ? (restoredAnswers[restoredItemId] ?? '') : '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(
    Boolean(restoredItemId && restoredAnswers[restoredItemId]?.trim())
  );
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, string>>(restoredAnswers);

  const {
    currentIndex,
    isLastItem,
    isAwaitingConfirmation,
    autoAdvanceIfEnabled,
    confirmAdvance,
    resetIndex,
    nextItem,
    goToItem,
    cancelPendingAdvance,
  } = useExerciseProgression({
    totalItems: validatedItems.length,
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

  useEffect(() => {
    if (draftHydratedRef.current || mode !== 'practice' || !data?.draftItems || validatedItems.length === 0) return;
    draftHydratedRef.current = true;
    const answers = data.draftAnswers ?? {};
    const firstUnanswered = validatedItems.findIndex(item => !answers[item.id]);
    const index = firstUnanswered >= 0 ? firstUnanswered : validatedItems.length - 1;
    setSubmittedAnswers(answers);
    setUserAnswer(answers[validatedItems[index].id] ?? '');
    goToItem(index);
  }, [data?.draftAnswers, data?.draftItems, goToItem, mode, validatedItems]);

  const handleExerciseReset = async () => {
    if (mode === 'practice' && isSingleField && generatedExerciseSource?.kind === 'lesson') {
      try {
        await resetGeneratedFormDraft({
          exercise: { type: 'generated-form-identification', data: exercise.data },
          source: generatedExerciseSource,
        }).unwrap();
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'Unable to restart this exercise. Please try again.'));
        return;
      }
    }
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

  const handleSubmit = async () => {
    if (isProcessing || validatedItems.length === 0 || !userAnswer.trim() || resetRequired) return;
    if (currentIndex >= validatedItems.length) return;

    const currentItem = validatedItems[currentIndex];
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

    if (assessmentMode) {
      let fullyCorrect = false;

      if (isSingleField) {
        const credit = scoreSingleFieldFormIdentificationAnswer(
          userAnswer,
          currentItem as SingleFieldFormIdentificationItem
        );
        fullyCorrect = credit.availableUnits > 0 && credit.earnedUnits === credit.availableUnits;
      } else if (isMultiAnswerMode) {
        const multiItem = currentItem as MultiAnswerFormIdentificationItem;
        const validation = validateMultiAnswerStep(userAnswer, multiItem);
        fullyCorrect = validation.isCorrect;
        if (fullyCorrect) {
          const updatedSlots = [...(multiAnswerSlots[multiItem.wordId] || [])];
          updatedSlots[multiItem.stepIndex] = validation.answerSlots;
          fullyCorrect = validatePartialMultiAnswerPaths(
            updatedSlots,
            multiItem.steps.slice(0, multiItem.stepIndex + 1),
            multiItem.primaryFormPaths
          ).isCorrect;
          if (fullyCorrect) {
            setMultiAnswerSlots(prev => ({ ...prev, [multiItem.wordId]: updatedSlots }));
          }
        }
      } else {
        const stepItem = currentItem as FormIdentificationItem;
        const validation = validateGeneratedFormIdentificationExercise(userAnswer, stepItem);
        fullyCorrect = validation.isCorrect;
        if (fullyCorrect) {
          setWordAnswers(prev => ({
            ...prev,
            [stepItem.wordId]: { ...(prev[stepItem.wordId] || {}), [stepItem.step]: normalize(userAnswer) },
          }));
        }
      }

      setTestSubmitted(true);
      if (fullyCorrect) handleCorrect(isLastItem);
      else handleIncorrect();
      return;
    }

    if (isMultiAnswerMode) {
      const multiItem = currentItem as MultiAnswerFormIdentificationItem;
      const stepValidation = validateMultiAnswerStep(userAnswer, multiItem);

      if (!stepValidation.isCorrect) {
        handleIncorrect();
        setIsProcessing(false);
        return;
      }

      const wordId = multiItem.wordId;
      const stepIndex = multiItem.stepIndex;

      const updatedSlots = [...(multiAnswerSlots[wordId] || [])];
      updatedSlots[stepIndex] = stepValidation.answerSlots;

      const stepsCompleted = multiItem.steps.slice(0, stepIndex + 1);
      const partialValidation = validatePartialMultiAnswerPaths(
        updatedSlots,
        stepsCompleted,
        multiItem.primaryFormPaths
      );

      if (!partialValidation.isCorrect) {
        handleIncorrect();
        setIsProcessing(false);
        return;
      }

      setMultiAnswerSlots(prev => ({
        ...prev,
        [wordId]: updatedSlots,
      }));

      handleCorrect(isLastItem);

      const finalScore = isLastItem
        ? Math.round(
            gradeExercisePercentage(
              { exercise, resolvedItems: validatedItems },
              { type: 'generated-form-identification', answers: nextAnswers }
            )
          )
        : null;

      autoAdvanceIfEnabled(() => {
        if (finalScore !== null) {
          onComplete?.(finalScore);
          return;
        }
        setUserAnswer('');
        reset();
        setIsProcessing(false);
      }, false);
      if (!assessmentMode && finalScore !== null) onCompletionAccepted?.(finalScore);
      return;
    }

    const validation = isSingleField
      ? validateSingleFieldFormIdentificationExercise(userAnswer, currentItem as SingleFieldFormIdentificationItem)
      : validateGeneratedFormIdentificationExercise(userAnswer, currentItem as FormIdentificationItem);

    if (validation.isCorrect) {
      if (mode === 'practice' && isSingleField && generatedExerciseSource?.kind === 'lesson') {
        try {
          await saveGeneratedFormDraft({
            queryArgs: {
              exercise: { type: 'generated-form-identification', data: exercise.data },
              source: generatedExerciseSource,
            },
            itemId: currentItem.id,
            answer: userAnswer,
          }).unwrap();
        } catch (error) {
          setIsProcessing(false);
          setSubmittedAnswers(submittedAnswers);
          toast.error(getApiErrorMessage(error, 'Unable to save this answer. Please try again.'));
          return;
        }
      }
      if (!isSingleField) {
        const stepItem = currentItem as FormIdentificationItem;
        setWordAnswers(prev => ({
          ...prev,
          [stepItem.wordId]: {
            ...(prev[stepItem.wordId] || {}),
            [stepItem.step]: normalize(userAnswer),
          },
        }));
      }

      handleCorrect(isLastItem);

      const finalScore = isLastItem
        ? Math.round(
            gradeExercisePercentage(
              { exercise, resolvedItems: validatedItems },
              { type: 'generated-form-identification', answers: nextAnswers }
            )
          )
        : null;

      autoAdvanceIfEnabled(() => {
        if (finalScore !== null) {
          onComplete?.(finalScore);
          return;
        }
        setUserAnswer('');
        reset();
        setIsProcessing(false);
      }, false);
      if (!assessmentMode && finalScore !== null) onCompletionAccepted?.(finalScore);
    } else {
      handleIncorrect();
      setIsProcessing(false);
    }
  };

  const handleAnswerChange = (value: string) => {
    setUserAnswer(value);
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

  if (!resolvedItems && isLoading) return <ExerciseLoadingCard />;

  if (!resolvedItems && isError) {
    return (
      <ExerciseMessageCard
        title="Error loading exercise"
        message="Unable to fetch vocabulary words. Please try again later."
      />
    );
  }

  if (validatedItems.length === 0) {
    return (
      <ExerciseMessageCard
        tone="warning"
        title="No items found"
        message="No vocabulary words match the configured filters for this exercise."
      />
    );
  }

  const safeIndex = Math.min(currentIndex, Math.max(0, validatedItems.length - 1));
  const currentItem = validatedItems[safeIndex];

  return (
    <div className="space-y-4">
      <ExerciseIntro
        variant="plain"
        title={exercise.title || getContentTypeLabel(exercise.type)}
        audioPath={exercise.audioPath}
        instructions={exercise.instructions}
      />

      <ExerciseProgress
        currentIndex={safeIndex}
        completed={
          mode === 'practice'
            ? safeIndex + (isCorrect === true ? 1 : 0)
            : validatedItems.filter(item => Boolean(submittedAnswers[item.id]?.trim())).length
        }
        total={validatedItems.length}
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
            onChange={handleAnswerChange}
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
              message={message}
              level={level}
              hint={currentItem.hint}
              correctAnswer={
                isSingleField
                  ? (currentItem as SingleFieldFormIdentificationItem).correctAnswerDisplay
                  : isMultiAnswerMode
                    ? (currentItem as MultiAnswerFormIdentificationItem).correctAnswerDisplay
                    : (currentItem as FormIdentificationItem).correctAnswer
              }
              showExplanation={showExplanation}
              onContinue={!assessmentMode && isCorrect && isAwaitingConfirmation ? confirmAdvance : undefined}
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
