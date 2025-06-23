'use client';

import React, { useState } from 'react';
import { FillExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { ExerciseInput, FeedbackDisplay } from '../feedback';

interface Props {
  exercise: FillExercise;
  onComplete?: () => void;
}

const FillExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');

  const { currentIndex, isLastItem, nextItem } = useExerciseProgression({
    totalItems: exercise.data.items.length,
    feedbackConfig: exercise.feedbackConfig,
    onComplete,
  });

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleSubmit = () => {
    const currentItem = exercise.data.items[currentIndex];
    const correct = userAnswer.trim().toLowerCase() === currentItem.answer.trim().toLowerCase();

    setTimeout(() => {
      if (correct) {
        handleCorrect(isLastItem);
        // Auto-advance logic based on configuration
        if (exercise.feedbackConfig.progressionRules?.autoAdvance !== false) {
          setTimeout(() => {
            nextItem();
            setUserAnswer('');
            reset();
          }, 1500);
        }
      } else {
        handleIncorrect(currentItem.hint, currentItem.answer);
      }
    }, 50);
  };

  const currentItem = exercise.data.items[currentIndex];

  return (
    <div className="space-y-4">
      {exercise.title && <h3 className="text-lg font-serif text-roman-red mb-2">{exercise.title}</h3>}
      {exercise.instructions && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <p>{exercise.instructions}</p>
        </div>
      )}

      {/* Progress indicator */}
      {exercise.feedbackConfig.progressionRules?.showProgress !== false && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>
              Question {currentIndex + 1} of {exercise.data.items.length}
            </span>
            <span>{Math.round(((currentIndex + 1) / exercise.data.items.length) * 100)}% Complete</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-roman-red h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / exercise.data.items.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <p className="mb-4">{currentItem.text}</p>
        <ExerciseInput
          value={userAnswer}
          onChange={setUserAnswer}
          onSubmit={handleSubmit}
          placeholder={currentItem.hint || 'Type your answer in Latin...'}
        />

        <FeedbackDisplay isCorrect={isCorrect} message={message} level={level} hint={currentItem.hint} />
      </div>
    </div>
  );
};

export default FillExerciseComponent;
