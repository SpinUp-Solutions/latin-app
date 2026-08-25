'use client';

import React, { useState, useMemo } from 'react';
import { GeneratedTranslationExercise } from '@/src/types/exercises';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import {
  useGetGeneratedExerciseWordsQuery,
  type GeneratedExerciseQuerySource,
} from '@/src/store/api/advancedVocabularyApi';
import { Card, CardContent } from '../card';
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

  const translationDirection = exercise.translationDirection || 'latin-to-english';

  const { data, isLoading, isError } = useGetGeneratedExerciseWordsQuery(
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

    if (validation.isCorrect) {
      handleCorrect(isLastItem);

      if (isLastItem) {
        if (!assessmentMode) onCompletionAccepted?.(finalScore!);
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
          onComplete?.(finalScore!);
        }, false);
      } else {
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
        }, false);
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

  if (!resolvedItems && isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red mr-3"></div>
            <div className="text-gray-600">Loading exercise...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!resolvedItems && isError) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <div className="font-medium">Error loading exercise</div>
            <div className="text-sm mt-2">Unable to fetch vocabulary words. Please try again later.</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-amber-600">
            <div className="font-medium">No vocabulary found</div>
            <div className="text-sm mt-2">No words match the configured filters for this exercise.</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentItem = items[currentIndex];
  const inputPlaceholder =
    translationDirection === 'english-to-latin' ? 'Type the Latin root word...' : 'Type your answer...';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-serif text-roman-red mb-2">
          <SimpleRichDisplay content={exercise.title || getContentTypeLabel(exercise.type)} />
        </h3>
        {exercise.audioPath && <AudioPlayButton audioPath={exercise.audioPath} />}
      </div>

      {exercise.instructions && exercise.instructions.replace(/<[^>]*>/g, '').trim() !== '' && (
        <div className="text-roman-stone">
          <SimpleRichDisplay content={exercise.instructions} />
        </div>
      )}

      <ExerciseProgress
        current={currentIndex}
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
            testSubmitted && <RecordedAnswerControls isLastItem={isLastItem} onContinue={continueTest} />
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
