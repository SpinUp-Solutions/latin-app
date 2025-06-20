'use client';

import React, { useState } from 'react';
import { TextSelectionExercise } from '@/src/types/exercise';
import ExerciseFeedback from '../feedback/exercise-feedback';

interface Props {
  exercise: TextSelectionExercise;
  onComplete?: () => void;
}

const TextSelectionExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const handleWordClick = (word: string, wordIndex: number) => {
    setSelectedWordIndex(wordIndex);
    const currentQuestion = exercise.data.questions[currentQuestionIndex];
    const correct = wordIndex === currentQuestion.correctWordIndex;
    setIsCorrect(correct);

    if (correct) {
      if (currentQuestionIndex < exercise.data.questions.length - 1) {
        setTimeout(() => {
          setCurrentQuestionIndex(prev => prev + 1);
          setSelectedWordIndex(null);
          setIsCorrect(null);
        }, 1500);
      } else {
        if (onComplete) {
          setTimeout(onComplete, 2000);
        }
      }
    }
  };

  const currentQuestion = exercise.data.questions[currentQuestionIndex];

  return (
    <div className="space-y-6 max-w-full">
      {exercise.title && <h3 className="text-xl font-serif text-roman-red mb-4">{exercise.title}</h3>}
      {exercise.instructions && (
        <div className="p-6 bg-roman-parchment rounded-lg mb-4">
          <p className="whitespace-pre-wrap break-words">{exercise.instructions}</p>
        </div>
      )}
      <div className="p-6 bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <p className="mb-6 whitespace-pre-wrap break-words min-w-[300px]">{currentQuestion.text}</p>
          <div className="font-serif text-lg leading-relaxed min-w-[300px]">
            {exercise.data.passage.split(' ').map((word, index) => (
              <span
                key={index}
                onClick={() => handleWordClick(word, index)}
                className={`cursor-pointer inline-block px-1 py-0.5 mx-0.5 rounded hover:bg-roman-parchment hover:text-roman-red transition-colors ${
                  selectedWordIndex === index
                    ? isCorrect
                      ? 'text-green-600 bg-green-50'
                      : 'text-red-600 bg-red-50'
                    : ''
                }`}>
                {word}
              </span>
            ))}
          </div>
        </div>

        {isCorrect !== null && (
          <div className="mt-6">
            <ExerciseFeedback
              isCorrect={isCorrect}
              customSuccessMessage={
                currentQuestionIndex < exercise.data.questions.length - 1
                  ? 'Correct! Moving to next question...'
                  : 'Congratulations! You have completed all questions.'
              }
              customErrorMessage="Not quite. Try another word."
            />
          </div>
        )}

        {isCorrect && currentQuestion.explanation && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-blue-800 whitespace-pre-wrap break-words">{currentQuestion.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextSelectionExerciseComponent;
