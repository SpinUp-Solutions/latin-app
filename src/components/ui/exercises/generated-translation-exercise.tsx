'use client';

import React, { useState, useMemo } from 'react';
import { GeneratedTranslationExercise } from '@/src/types/exercises';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
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

interface Props {
  exercise: GeneratedTranslationExercise;
  onComplete?: (score: number) => void;
}

const GeneratedTranslationExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);

  const config = exercise.data.generatorConfig;
  const translationDirection = exercise.translationDirection || 'latin-to-english';

  const { data, isLoading, isError } = useGetMultiPosWordsQuery({
    exerciseType: 'generated-translation',
    collection: config.collection,
    wordSource: config.wordSource,
    poolId: config.poolId,
    count: config.count,
    posConfigs: exercise.data.posConfigs,
  });

  const items: GeneratedTranslationItem[] = useMemo(() => {
    if (!data?.words) return [];

    const words = data.words as unknown as ExerciseWordResponse[];

    const mapped = words.map<GeneratedTranslationItem | null>(word => {
      const translations = splitTranslationAnswers(word.translation);
      const definitionsText = word.definitions && word.definitions.length > 0 ? word.definitions.join(', ') : '';

      if (translationDirection === 'english-to-latin') {
        if (translations.length === 0 || !word.root_word) {
          return null;
        }

        const answerToAccept =
          word.selected_form === word.root_word ? word.dictionary_entry || word.root_word : word.selected_form;

        return {
          text: translations.join(', '),
          acceptedAnswers: [answerToAccept],
          hint: definitionsText || undefined,
          stripInfinitive: false,
        };
      }

      if (translations.length === 0) {
        return null;
      }

      // If no form selected, show dictionary_entry (if exists) or root_word
      // If form selected, show the selected_form
      const displayText =
        word.selected_form === word.root_word ? word.dictionary_entry || word.selected_form : word.selected_form;

      return {
        text: displayText,
        acceptedAnswers: translations,
        hint: definitionsText || undefined,
        stripInfinitive: true,
      };
    });

    return mapped.filter((item): item is GeneratedTranslationItem => item !== null);
  }, [data, translationDirection]);

  const { currentIndex, isLastItem, autoAdvanceIfEnabled } = useExerciseProgression({
    totalItems: items.length,
    itemProgressionDelay: exercise.itemProgressionDelay,
    progressionRules: exercise.feedbackConfig.progressionRules,
  });

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleSubmit = () => {
    if (isProcessing || items.length === 0) return;

    const currentItem = items[currentIndex];
    const validation = validateGeneratedTranslationExercise(userAnswer, currentItem);

    setIsProcessing(true);

    if (validation.isCorrect) {
      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      if (isLastItem) {
        const finalScore = Math.round((newCorrectAnswers / items.length) * 100);
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
        <p className="text-roman-stone">
          <SimpleRichDisplay content={exercise.instructions} />
        </p>
      )}

      <ExerciseProgress current={currentIndex} total={items.length} />

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
          />

          <FeedbackDisplay
            isCorrect={isCorrect}
            message={message}
            level={level}
            hint={currentItem.hint}
            correctAnswer={currentItem.acceptedAnswers.join(' OR ')}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default GeneratedTranslationExerciseComponent;
