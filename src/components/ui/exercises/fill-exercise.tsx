'use client';

import React, { useState } from 'react';
import { FillExercise } from '@/src/types/exercise';
import ExerciseInput from '../feedback/exercise-input';
import ExerciseFeedback from '../feedback/exercise-feedback';

interface Props {
  exercise: FillExercise;
  onComplete?: () => void;
}

const FillExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showCompletionFeedback, setShowCompletionFeedback] = useState(false);

  const handleSubmit = () => {
    setIsCorrect(null);

    const currentItem = exercise.data.items[currentItemIndex];
    const correct = userAnswer.trim().toLowerCase() === currentItem.answer.trim().toLowerCase();

    setTimeout(() => {
      setIsCorrect(correct);

      if (correct) {
        if (currentItemIndex < exercise.data.items.length - 1) {
          setTimeout(() => {
            setCurrentItemIndex(prev => prev + 1);
            setUserAnswer('');
            setIsCorrect(null);
          }, 1500);
        } else {
          setShowCompletionFeedback(true);
          if (onComplete) {
            setTimeout(onComplete, 2000);
          }
        }
      }
    }, 50);
  };

  const currentItem = exercise.data.items[currentItemIndex];

  return (
    <div className="space-y-4">
      {exercise.title && <h3 className="text-lg font-serif text-roman-red mb-2">{exercise.title}</h3>}
      {exercise.instructions && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <p>{exercise.instructions}</p>
        </div>
      )}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <p className="mb-4">{currentItem.text}</p>
        <ExerciseInput
          value={userAnswer}
          onChange={setUserAnswer}
          onSubmit={handleSubmit}
          isCorrect={isCorrect}
          correctAnswer={currentItem.answer}
          placeholder={currentItem.hint || 'Type your answer in Latin...'}
        />
      </div>

      {showCompletionFeedback && <ExerciseFeedback message="Well done! You've completed all the fill-in exercises!" />}
    </div>
  );
};

export default FillExerciseComponent;
