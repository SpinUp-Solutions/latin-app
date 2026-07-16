'use client';

import React, { useState, useMemo } from 'react';
import { GeneratedTranslationExercise } from '@/src/types/exercises';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useDelayedExerciseReset } from '@/src/hooks/useDelayedExerciseReset';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { useGetMultiPosWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { Card, CardContent } from '../card';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import {
  validateGeneratedTranslationExercise,
  splitTranslationAnswers,
  type GeneratedTranslationItem,
} from '@/src/utils/exercises/generatedTranslationExercise';
import { getExerciseDisplayForm, hasSelectedForm } from '@/src/utils/exercises/formSelection';
import { normalizeCollection, buildLegacyPosConfigs } from '@/src/utils/exercises/legacyExerciseCompat';
import type { ExerciseAnswerHandler, RuntimeMode } from '@/src/types/runtime-mode';
import { resolveRuntimeMode } from '@/src/types/runtime-mode';

interface Props {
  exercise: GeneratedTranslationExercise;
  onComplete?: (score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  resolvedItems?: GeneratedTranslationItem[];
  testMode?: boolean;
}

const GeneratedTranslationExerciseComponent: React.FC<Props> = ({
  exercise,
  onComplete,
  runtimeMode,
  onAnswer,
  resolvedItems,
  testMode,
}) => {
  const mode = resolveRuntimeMode(runtimeMode, testMode);
  const assessmentMode = mode !== 'practice';
  const [userAnswer, setUserAnswer] = useState('');
  const [submittedAnswers, setSubmittedAnswers] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);

  const config = exercise.data.generatorConfig;
  const translationDirection = exercise.translationDirection || 'latin-to-english';

  // Backward compat: old exercises stored filters/formSelection in generatorConfig
  // with no posConfigs, wordSource, or poolId
  const hasNewFormatPosConfigs =
    exercise.data.posConfigs &&
    typeof exercise.data.posConfigs === 'object' &&
    Object.keys(exercise.data.posConfigs).length > 0;

  const posConfigs = hasNewFormatPosConfigs
    ? exercise.data.posConfigs
    : buildLegacyPosConfigs(config as Parameters<typeof buildLegacyPosConfigs>[0]);

  const { data, isLoading, isError } = useGetMultiPosWordsQuery(
    {
      exerciseType: 'generated-translation',
      collection: normalizeCollection(config.collection),
      wordSource: config.wordSource || 'filters',
      poolId: config.poolId ?? null,
      poolWordLimit: config.poolWordLimit ?? null,
      count: config.count,
      posConfigs,
    },
    { skip: mode === 'test' || resolvedItems !== undefined }
  );

  const items: GeneratedTranslationItem[] = useMemo(() => {
    if (resolvedItems) return resolvedItems;
    if (!data?.words) return [];

    const words = data.words as unknown as ExerciseWordResponse[];

    const mapped = words.map<GeneratedTranslationItem | null>(word => {
      const translations = splitTranslationAnswers(word.translation);
      const definitionsText = word.definitions && word.definitions.length > 0 ? word.definitions.join(', ') : '';

      if (translationDirection === 'english-to-latin') {
        if (translations.length === 0 || !word.root_word) {
          return null;
        }

        const answerToAccept = hasSelectedForm(word) ? word.selected_form : word.dictionary_entry || word.selected_form;

        return {
          text: translations.join(', '),
          acceptedAnswers: [answerToAccept],
          hint: definitionsText || undefined,
          stripInfinitive: false,
          stripMacrons: true,
        };
      }

      if (translations.length === 0) {
        return null;
      }

      // If no form selected, show dictionary_entry (if exists) or root_word
      // If form selected, show the selected_form
      const displayText = getExerciseDisplayForm(word);

      return {
        text: displayText,
        acceptedAnswers: translations,
        hint: definitionsText || undefined,
        stripInfinitive: true,
      };
    });

    return mapped.filter((item): item is GeneratedTranslationItem => item !== null);
  }, [data, resolvedItems, translationDirection]);

  const { currentIndex, isLastItem, isAwaitingConfirmation, autoAdvanceIfEnabled, confirmAdvance, resetIndex } =
    useExerciseProgression({
      totalItems: items.length,
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
      setCorrectAnswers(0);
      setIsProcessing(false);
      resetIndex();
      resetExercise();
    },
  });

  const handleSubmit = () => {
    if (isProcessing || items.length === 0) return;

    const currentItem = items[currentIndex];
    const nextAnswers = [...submittedAnswers];
    nextAnswers[currentIndex] = userAnswer;
    setSubmittedAnswers(nextAnswers);
    if (mode === 'test') onAnswer?.({ type: 'generated-translation', answers: nextAnswers });
    const validation = validateGeneratedTranslationExercise(userAnswer, currentItem);

    setIsProcessing(true);

    if (validation.isCorrect) {
      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      if (isLastItem) {
        const finalScore = Math.round((newCorrectAnswers / items.length) * 100);

        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
          onComplete?.(finalScore);
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
        const finalScore = isLastItem ? Math.round((correctAnswers / items.length) * 100) : null;
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
        {exercise.title && (
          <h3 className="text-lg font-serif text-roman-red mb-2">
            <SimpleRichDisplay content={exercise.title} />
          </h3>
        )}
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
            disabled={isProcessing}
          />

          <FeedbackDisplay
            isCorrect={isCorrect}
            message={assessmentMode ? '' : message}
            level={assessmentMode ? null : level}
            hint={assessmentMode ? undefined : currentItem.hint}
            correctAnswer={assessmentMode ? undefined : currentItem.acceptedAnswers.join(' OR ')}
            showExplanation={!assessmentMode && showExplanation}
            onContinue={(isCorrect || assessmentMode) && isAwaitingConfirmation ? confirmAdvance : undefined}
            allowContinueOnIncorrect={assessmentMode}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default GeneratedTranslationExerciseComponent;
