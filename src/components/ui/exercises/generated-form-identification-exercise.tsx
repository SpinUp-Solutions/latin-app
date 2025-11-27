'use client';

import React, { useState, useMemo } from 'react';
import { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { useGetMultiPosWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { Card, CardContent } from '../card';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import {
  FormIdentificationItemSchema,
  type FormIdentificationItem,
  SingleFieldFormIdentificationItemSchema,
  type SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import {
  validateGeneratedFormIdentificationExercise,
  validateSingleFieldFormIdentificationExercise,
} from '@/src/utils/exercises/generatedFormIdentificationExercise';
import {
  extractStepValue,
  getHintForStep,
  extractStepValuesFromPaths,
  getAcceptedAnswersForMultipleValues,
  formatPrimaryAnswersDisplay,
  filterPathsByPreviousAnswers,
} from '@/src/utils/exercises/formIdentificationHelpers';

interface Props {
  exercise: GeneratedFormIdentificationExercise;
  onComplete?: (score: number) => void;
}

const GeneratedFormIdentificationExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wordAnswers, setWordAnswers] = useState<Record<string, Record<string, string>>>({});

  const config = exercise.data.generatorConfig;
  const isSingleField = exercise.data.mode === 'single-field';

  const { data, isLoading, isError } = useGetMultiPosWordsQuery({
    exerciseType: 'generated-form-identification',
    collection: config.collection,
    wordSource: config.wordSource,
    poolId: config.poolId,
    count: config.count,
    posConfigs: exercise.data.posConfigs,
  });

  const items: (FormIdentificationItem | SingleFieldFormIdentificationItem)[] = useMemo(() => {
    if (!data?.words) return [];

    const words = data.words as unknown as ExerciseWordResponse[];

    if (isSingleField) {
      return words.map(word => {
        const posConfig = exercise.data.posConfigs[word.part_of_speech as PartOfSpeech];
        const steps = posConfig?.steps || [];

        const basePrimaryPaths = (word.primary_form_paths || (word.form_path ? [word.form_path] : [])) as Array<
          Record<string, string | undefined>
        >;
        const baseOptionalPaths = (word.optional_form_paths || []) as Array<Record<string, string | undefined>>;

        const enrichedPrimaryPaths = basePrimaryPaths.map(path => {
          const enrichedPath: Record<string, string | undefined> = { ...path };
          steps.forEach(step => {
            if (!enrichedPath[step]) {
              enrichedPath[step] = extractStepValue(word, step);
            }
          });
          return enrichedPath;
        });

        const enrichedOptionalPaths = baseOptionalPaths.map(path => {
          const enrichedPath: Record<string, string | undefined> = { ...path };
          steps.forEach(step => {
            if (!enrichedPath[step]) {
              enrichedPath[step] = extractStepValue(word, step);
            }
          });
          return enrichedPath;
        });

        const pathDisplays = enrichedPrimaryPaths
          .map(path => {
            const pathValues = steps.map(step => path[step]).filter(Boolean);
            return pathValues.join(';');
          })
          .filter(display => display.length > 0);

        const correctAnswerDisplay = pathDisplays.join(' OR ');

        return {
          id: word.id,
          wordId: word.id,
          word: word.root_word,
          root_word: word.root_word,
          selected_form: word.selected_form,
          steps,
          correctAnswerDisplay,
          hint: word.definitions?.join('; '),
          primaryFormPaths: enrichedPrimaryPaths,
          optionalFormPaths: enrichedOptionalPaths,
        } as SingleFieldFormIdentificationItem;
      });
    }

    return words.flatMap(word => {
      const posConfig = exercise.data.posConfigs[word.part_of_speech as PartOfSpeech];
      const steps = posConfig?.steps || [];

      const basePrimaryPaths = (word.primary_form_paths || (word.form_path ? [word.form_path] : [])) as Array<
        Record<string, string | undefined>
      >;
      const baseOptionalPaths = (word.optional_form_paths || []) as Array<Record<string, string | undefined>>;

      const previousAnswers = wordAnswers[word.id] || {};

      return steps.map(step => {
        const filteredPrimaryPaths = filterPathsByPreviousAnswers(basePrimaryPaths, previousAnswers);
        const filteredOptionalPaths = filterPathsByPreviousAnswers(baseOptionalPaths, previousAnswers);

        const primaryValues = extractStepValuesFromPaths(filteredPrimaryPaths, step);
        const optionalValues = extractStepValuesFromPaths(filteredOptionalPaths, step);

        const allCorrectValues = Array.from(new Set([...primaryValues, ...optionalValues]));
        const acceptedAnswers = getAcceptedAnswersForMultipleValues(allCorrectValues);
        const correctAnswer = formatPrimaryAnswersDisplay(filteredPrimaryPaths, step) || extractStepValue(word, step);

        return {
          id: `${word.id}-${step}`,
          wordId: word.id,
          word: word.root_word,
          root_word: word.root_word,
          selected_form: word.selected_form,
          step,
          correctAnswer,
          acceptedAnswers: acceptedAnswers.length > 0 ? acceptedAnswers : [correctAnswer],
          hint: getHintForStep(word, step),
          primaryFormPaths: filteredPrimaryPaths,
          optionalFormPaths: filteredOptionalPaths,
        } as FormIdentificationItem;
      });
    });
  }, [data?.words, exercise.data, wordAnswers, isSingleField]);

  const validatedItems = useMemo(() => {
    try {
      if (isSingleField) {
        return items.map(item => SingleFieldFormIdentificationItemSchema.parse(item));
      }
      return items.map(item => FormIdentificationItemSchema.parse(item));
    } catch (error) {
      console.error('[Form Identification] Validation error:', error);
      return [];
    }
  }, [items, isSingleField]);

  const { currentIndex, isLastItem, autoAdvanceIfEnabled } = useExerciseProgression({
    totalItems: validatedItems.length,
    itemProgressionDelay: exercise.itemProgressionDelay,
    progressionRules: exercise.feedbackConfig.progressionRules,
  });

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleSubmit = () => {
    if (isProcessing || validatedItems.length === 0) return;

    const currentItem = validatedItems[currentIndex];
    const validation = isSingleField
      ? validateSingleFieldFormIdentificationExercise(userAnswer, currentItem as SingleFieldFormIdentificationItem)
      : validateGeneratedFormIdentificationExercise(userAnswer, currentItem as FormIdentificationItem);

    setIsProcessing(true);

    if (validation.isCorrect) {
      if (!isSingleField) {
        const stepItem = currentItem as FormIdentificationItem;
        setWordAnswers(prev => ({
          ...prev,
          [stepItem.wordId]: {
            ...(prev[stepItem.wordId] || {}),
            [stepItem.step]: userAnswer.trim(),
          },
        }));
      }

      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      if (isLastItem) {
        const finalScore = Math.round((newCorrectAnswers / validatedItems.length) * 100);
        onComplete?.(finalScore);

        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
        });
      } else {
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
        });
      }
    } else {
      handleIncorrect();
      setIsProcessing(false);
    }
  };

  const handleAnswerChange = (value: string) => {
    setUserAnswer(value);
  };

  if (isLoading) {
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

  if (isError) {
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

  if (validatedItems.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-amber-600">
            <div className="font-medium">No items found</div>
            <div className="text-sm mt-2">No vocabulary words match the configured filters for this exercise.</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentItem = validatedItems[currentIndex];

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

      {exercise.instructions && (
        <p className="text-roman-stone">
          <SimpleRichDisplay content={exercise.instructions} />
        </p>
      )}

      <ExerciseProgress current={currentIndex} total={validatedItems.length} />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            {!isSingleField && (
              <div className="text-sm text-gray-500">
                Step: <span className="font-medium capitalize">{(currentItem as FormIdentificationItem).step}</span>
              </div>
            )}
            <div className="text-lg font-medium">
              <SimpleRichDisplay content={currentItem.selected_form} />
            </div>
          </div>

          <div className="text-sm text-gray-600">
            {isSingleField ? (
              <>
                <strong>Question:</strong> Identify the:{' '}
                <span className="font-medium">
                  {(currentItem as SingleFieldFormIdentificationItem).steps.join('; ')}
                </span>
              </>
            ) : (
              <>
                <strong>Question:</strong> What is the{' '}
                <span className="font-medium">{(currentItem as FormIdentificationItem).step}</span> of this word?
              </>
            )}
          </div>

          <ExerciseInput
            value={userAnswer}
            onChange={handleAnswerChange}
            onSubmit={handleSubmit}
            placeholder={isSingleField ? 'Enter answers separated by semicolons...' : 'Type your answer...'}
          />

          <FeedbackDisplay
            isCorrect={isCorrect}
            message={message}
            level={level}
            hint={currentItem.hint}
            correctAnswer={
              isSingleField
                ? (currentItem as SingleFieldFormIdentificationItem).correctAnswerDisplay
                : (currentItem as FormIdentificationItem).correctAnswer
            }
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default GeneratedFormIdentificationExerciseComponent;
