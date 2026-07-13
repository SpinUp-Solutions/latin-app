'use client';

import React, { useState, useMemo } from 'react';
import { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useDelayedExerciseReset } from '@/src/hooks/useDelayedExerciseReset';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { useGetMultiParadigmWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import { deriveParadigm } from '@/src/utils/paradigm';
import { Card, CardContent } from '../card';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
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
  normalize,
} from '@/src/utils/exercises/generatedFormIdentificationExercise';
import {
  extractStepValue,
  getHintForStep,
  extractStepValuesFromPaths,
  getAcceptedAnswersForMultipleValues,
  getAcceptedAnswersForStep,
  formatPrimaryAnswersDisplay,
  filterPathsByPreviousAnswers,
  getDisplayForm,
  enrichPathsWithSteps,
  deduplicatePathsBySteps,
  getAnswerableStepsForWord,
} from '@/src/utils/exercises/formIdentificationHelpers';
import { hasSelectedForm } from '@/src/utils/exercises/formSelection';
import { formatLabel } from '@/src/utils/label-formatter';
import { normalizeCollection, buildLegacyParadigmConfigs } from '@/src/utils/exercises/legacyExerciseCompat';

interface Props {
  exercise: GeneratedFormIdentificationExercise;
  onComplete?: (score: number) => void;
}

const GeneratedFormIdentificationExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [wordAnswers, setWordAnswers] = useState<Record<string, Record<string, string>>>({});
  const [multiAnswerSlots, setMultiAnswerSlots] = useState<Record<string, string[][]>>({});

  const config = exercise.data.generatorConfig;
  const isSingleField = exercise.data.mode === 'single-field';
  const requireAllPrimaryAnswers = exercise.data.requireAllPrimaryAnswers ?? false;
  const isMultiAnswerMode = !isSingleField && requireAllPrimaryAnswers;

  // Backward compat: old exercises stored filters/formSelection in generatorConfig
  // with no paradigmConfigs, wordSource, or poolId
  const hasNewFormatParadigmConfigs =
    exercise.data.paradigmConfigs &&
    typeof exercise.data.paradigmConfigs === 'object' &&
    Object.keys(exercise.data.paradigmConfigs).length > 0;

  const paradigmConfigs = hasNewFormatParadigmConfigs
    ? exercise.data.paradigmConfigs
    : buildLegacyParadigmConfigs(config as Parameters<typeof buildLegacyParadigmConfigs>[0]);

  const { data, isLoading, isError } = useGetMultiParadigmWordsQuery({
    exerciseType: 'generated-form-identification',
    collection: normalizeCollection(config.collection),
    wordSource: config.wordSource || 'filters',
    poolId: config.poolId ?? null,
    poolWordLimit: config.poolWordLimit ?? null,
    count: config.count,
    paradigmConfigs,
  });

  type ItemType = FormIdentificationItem | SingleFieldFormIdentificationItem | MultiAnswerFormIdentificationItem;
  const items: ItemType[] = useMemo(() => {
    if (!data?.words) return [];

    const words = data.words as unknown as ExerciseWordResponse[];

    if (isSingleField) {
      return words.map(word => {
        const hasSelected = hasSelectedForm(word);
        const wordAny = word as Record<string, unknown>;
        const paradigm = deriveParadigm(
          word.part_of_speech as PartOfSpeech,
          wordAny.pronoun_type as PronounType | undefined,
          wordAny.person as PronounPerson | undefined
        );
        const paradigmConfig = paradigm ? exercise.data.paradigmConfigs?.[paradigm] : undefined;

        const basePrimaryPaths = (word.primary_form_paths || (word.form_path ? [word.form_path] : [])) as Array<
          Record<string, string | undefined>
        >;
        const baseOptionalPaths = (word.optional_form_paths || []) as Array<Record<string, string | undefined>>;
        const steps = getAnswerableStepsForWord(word, paradigmConfig?.steps || [], basePrimaryPaths);

        const enrichedPrimaryPaths = enrichPathsWithSteps(basePrimaryPaths, word, steps);
        const enrichedOptionalPaths = enrichPathsWithSteps(baseOptionalPaths, word, steps);

        // Deduplicate paths based on only the requested steps
        // This handles syncretism where paths differ only in fields not being asked
        const dedupedPrimaryPaths = deduplicatePathsBySteps(enrichedPrimaryPaths, steps);
        const dedupedOptionalPaths = deduplicatePathsBySteps(enrichedOptionalPaths, steps);

        const pathDisplays = dedupedPrimaryPaths
          .map(path => {
            const pathValues = steps
              .map(step => {
                const val = path[step];
                return val ? getDisplayForm(val) : null;
              })
              .filter(Boolean);
            return pathValues.join(',');
          })
          .filter(display => display.length > 0);

        const correctAnswerDisplay = pathDisplays.join(';');

        return {
          id: word.id,
          wordId: word.id,
          word: word.root_word,
          root_word: word.root_word,
          dictionary_entry: word.dictionary_entry ?? null,
          selected_form: word.selected_form,
          hasSelectedForm: hasSelected,
          steps,
          correctAnswerDisplay,
          hint: word.definitions?.join('; '),
          primaryFormPaths: dedupedPrimaryPaths,
          optionalFormPaths: dedupedOptionalPaths,
        } as SingleFieldFormIdentificationItem;
      });
    }

    if (isMultiAnswerMode) {
      return words.flatMap(word => {
        const hasSelected = hasSelectedForm(word);
        const wordAny = word as Record<string, unknown>;
        const paradigm = deriveParadigm(
          word.part_of_speech as PartOfSpeech,
          wordAny.pronoun_type as PronounType | undefined,
          wordAny.person as PronounPerson | undefined
        );
        const paradigmConfig = paradigm ? exercise.data.paradigmConfigs?.[paradigm] : undefined;

        const basePrimaryPaths = (word.primary_form_paths || (word.form_path ? [word.form_path] : [])) as Array<
          Record<string, string | undefined>
        >;
        const baseOptionalPaths = (word.optional_form_paths || []) as Array<Record<string, string | undefined>>;
        const steps = getAnswerableStepsForWord(word, paradigmConfig?.steps || [], basePrimaryPaths);

        const enrichedPrimaryPaths = enrichPathsWithSteps(basePrimaryPaths, word, steps);
        const enrichedOptionalPaths = enrichPathsWithSteps(baseOptionalPaths, word, steps);

        // Deduplicate paths based on only the requested steps
        // This handles syncretism where paths differ only in fields not being asked
        const dedupedPrimaryPaths = deduplicatePathsBySteps(enrichedPrimaryPaths, steps);
        const dedupedOptionalPaths = deduplicatePathsBySteps(enrichedOptionalPaths, steps);

        const expectedAnswerCount = dedupedPrimaryPaths.length;

        return steps.map((step, stepIndex) => {
          const stepValues = extractStepValuesFromPaths(dedupedPrimaryPaths, step);
          const correctAnswerDisplay = stepValues.join(';');

          return {
            id: `${word.id}-${step}`,
            wordId: word.id,
            word: word.root_word,
            root_word: word.root_word,
            dictionary_entry: word.dictionary_entry ?? null,
            selected_form: word.selected_form,
            hasSelectedForm: hasSelected,
            step,
            steps,
            stepIndex,
            totalSteps: steps.length,
            primaryFormPaths: dedupedPrimaryPaths,
            optionalFormPaths: dedupedOptionalPaths,
            hint: word.definitions?.join('; '),
            expectedAnswerCount,
            correctAnswerDisplay,
          } as MultiAnswerFormIdentificationItem;
        });
      });
    }

    return words.flatMap(word => {
      const hasSelected = hasSelectedForm(word);
      const wordAny = word as Record<string, unknown>;
      const paradigm = deriveParadigm(
        word.part_of_speech as PartOfSpeech,
        wordAny.pronoun_type as PronounType | undefined,
        wordAny.person as PronounPerson | undefined
      );
      const paradigmConfig = paradigm ? exercise.data.paradigmConfigs?.[paradigm] : undefined;

      const basePrimaryPaths = (word.primary_form_paths || (word.form_path ? [word.form_path] : [])) as Array<
        Record<string, string | undefined>
      >;
      const baseOptionalPaths = (word.optional_form_paths || []) as Array<Record<string, string | undefined>>;
      const steps = getAnswerableStepsForWord(word, paradigmConfig?.steps || [], basePrimaryPaths);
      const enrichedPrimaryPaths = enrichPathsWithSteps(basePrimaryPaths, word, steps);
      const enrichedOptionalPaths = enrichPathsWithSteps(baseOptionalPaths, word, steps);
      const dedupedPrimaryPaths = deduplicatePathsBySteps(enrichedPrimaryPaths, steps);
      const dedupedOptionalPaths = deduplicatePathsBySteps(enrichedOptionalPaths, steps);

      const previousAnswers = wordAnswers[word.id] || {};

      return steps.map(step => {
        const filteredPrimaryPaths = filterPathsByPreviousAnswers(dedupedPrimaryPaths, previousAnswers);
        const filteredOptionalPaths = filterPathsByPreviousAnswers(dedupedOptionalPaths, previousAnswers);

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
          dictionary_entry: word.dictionary_entry ?? null,
          selected_form: word.selected_form,
          hasSelectedForm: hasSelected,
          step,
          correctAnswer,
          acceptedAnswers: acceptedAnswers.length > 0 ? acceptedAnswers : getAcceptedAnswersForStep(correctAnswer),
          hint: getHintForStep(word, step),
          primaryFormPaths: filteredPrimaryPaths,
          optionalFormPaths: filteredOptionalPaths,
        } as FormIdentificationItem;
      });
    });
  }, [data?.words, exercise.data, wordAnswers, isSingleField, isMultiAnswerMode]);

  const validatedItems = useMemo(() => {
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
  }, [items, isSingleField, isMultiAnswerMode]);

  const { currentIndex, isLastItem, isAwaitingConfirmation, autoAdvanceIfEnabled, confirmAdvance, resetIndex } =
    useExerciseProgression({
      totalItems: validatedItems.length,
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
    shouldReset: shouldResetExercise,
    delayMs: exercise.itemProgressionDelay,
    onReset: () => {
      setUserAnswer('');
      setCorrectAnswers(0);
      setWordAnswers({});
      setMultiAnswerSlots({});
      setIsProcessing(false);
      resetIndex();
      resetExercise();
    },
  });

  const handleSubmit = () => {
    if (isProcessing || validatedItems.length === 0) return;
    if (currentIndex >= validatedItems.length) return;

    const currentItem = validatedItems[currentIndex];
    setIsProcessing(true);

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

      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      const finalScore = isLastItem ? Math.round((newCorrectAnswers / validatedItems.length) * 100) : null;

      autoAdvanceIfEnabled(() => {
        setUserAnswer('');
        reset();
        setIsProcessing(false);
        if (finalScore !== null) onComplete?.(finalScore);
      }, false);
      return;
    }

    const validation = isSingleField
      ? validateSingleFieldFormIdentificationExercise(userAnswer, currentItem as SingleFieldFormIdentificationItem)
      : validateGeneratedFormIdentificationExercise(userAnswer, currentItem as FormIdentificationItem);

    if (validation.isCorrect) {
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

      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      const finalScore = isLastItem ? Math.round((newCorrectAnswers / validatedItems.length) * 100) : null;

      autoAdvanceIfEnabled(() => {
        setUserAnswer('');
        reset();
        setIsProcessing(false);
        if (finalScore !== null) onComplete?.(finalScore);
      }, false);
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

  const safeIndex = Math.min(currentIndex, Math.max(0, validatedItems.length - 1));
  const currentItem = validatedItems[safeIndex];

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
        current={safeIndex}
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
                  {(currentItem as SingleFieldFormIdentificationItem).primaryFormPaths.length > 1 &&
                    ', multiple answers by semicolons'}{' '}
                  (e.g.,{' '}
                  {(currentItem as SingleFieldFormIdentificationItem).primaryFormPaths.length > 1
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
                ? `e.g., ${(currentItem as SingleFieldFormIdentificationItem).steps.map(() => 'value').join(',')}${(currentItem as SingleFieldFormIdentificationItem).primaryFormPaths.length > 1 ? ';...' : ''}`
                : isMultiAnswerMode && (currentItem as MultiAnswerFormIdentificationItem).expectedAnswerCount > 1
                  ? `e.g., answer1;answer2`
                  : 'Type your answer...'
            }
            disabled={isProcessing}
          />

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
            onContinue={isCorrect && isAwaitingConfirmation ? confirmAdvance : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default GeneratedFormIdentificationExerciseComponent;
