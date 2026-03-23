'use client';

import React, { useState, useEffect } from 'react';
import { FillExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { validateFillExercise } from '@/src/utils/exercises/fillExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { toast } from 'sonner';

interface Props {
  exercise: FillExercise;
  onComplete?: (score: number) => void;
}

const FillExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [correctAnswers, setCorrectAnswers] = useState(0);

  const { currentIndex, isLastItem, isAwaitingConfirmation, autoAdvanceIfEnabled, confirmAdvance, resetIndex } =
    useExerciseProgression({
      totalItems: exercise.data.items.length,
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

  useEffect(() => {
    if (shouldResetExercise) {
      toast.info('Too many mistakes. Starting over...');
      setUserAnswer('');
      setCorrectAnswers(0);
      setIsProcessing(false);
      resetIndex();
      resetExercise();
    }
  }, [shouldResetExercise, resetIndex, resetExercise]);

  const handleSubmit = () => {
    if (isProcessing) return;

    const validation = validateFillExercise(userAnswer, exercise, currentIndex);
    setIsProcessing(true);

    if (validation.isCorrect) {
      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      const hasVisibleExplanation =
        (exercise.feedbackConfig.successMessage?.showExplanation ?? true) && !!currentItem.explanation;

      if (isLastItem) {
        const finalScore = Math.round((newCorrectAnswers / exercise.data.items.length) * 100);

        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
          onComplete?.(finalScore);
        }, hasVisibleExplanation);
      } else {
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          reset();
          setIsProcessing(false);
        }, hasVisibleExplanation);
      }
    } else {
      handleIncorrect();
      setIsProcessing(false);
    }
  };

  const handleAnswerChange = (value: string) => {
    setUserAnswer(value);
  };

  const currentItem = exercise.data.items[currentIndex];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        {exercise.title && (
          <h3 className="text-lg font-serif text-roman-red mb-2">
            <SimpleRichDisplay content={exercise.title} />
          </h3>
        )}
        {exercise.audioPath && (
          <AudioPlayButton
            audioPath={exercise.audioPath}
            variant="default"
            size="sm"
            className="ml-2 rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
          />
        )}
      </div>
      {exercise.instructions && exercise.instructions.replace(/<[^>]*>/g, '').trim() !== '' && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} />
        </div>
      )}

      {/* Progress indicator */}
      <ExerciseProgress
        current={currentIndex}
        total={exercise.data.items.length}
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <SimpleRichDisplay content={currentItem.text} className="mb-4" />
        <ExerciseInput
          value={userAnswer}
          onChange={handleAnswerChange}
          onSubmit={handleSubmit}
          placeholder="Type your answer"
          disabled={isProcessing}
        />

        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={currentItem.hint}
          correctAnswer={currentItem.answer}
          explanation={currentItem.explanation}
          showExplanation={showExplanation}
          onContinue={isCorrect && isAwaitingConfirmation ? confirmAdvance : undefined}
        />
      </div>
    </div>
  );
};

export default FillExerciseComponent;
