'use client';

import React, { useState } from 'react';
import { TextSelectionExercise } from '@/src/types/exercise';
import ExerciseFeedback from '../feedback/ExerciseFeedback';

interface Props {
  exercise: TextSelectionExercise;
  onComplete?: () => void;
}

const TextSelectionExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showCompletionFeedback, setShowCompletionFeedback] = useState(false);

  const handleWordClick = (word: string) => {
    setSelectedWord(word);
    const currentQuestion = exercise.data.questions[currentQuestionIndex];
    const correct = word.toLowerCase() === currentQuestion.correctWord.toLowerCase();
    setIsCorrect(correct);

    if (correct) {
      if (currentQuestionIndex < exercise.data.questions.length - 1) {
        setTimeout(() => {
          setCurrentQuestionIndex(prev => prev + 1);
          setSelectedWord(null);
          setIsCorrect(null);
        }, 1500);
      } else {
        setShowCompletionFeedback(true);
        if (onComplete) {
          setTimeout(onComplete, 2000);
        }
      }
    }
  };

  const currentQuestion = exercise.data.questions[currentQuestionIndex];

  return (
    <div className="space-y-4">
      {exercise.title && <h3 className="text-lg font-serif text-roman-red mb-2">{exercise.title}</h3>}
      {exercise.instructions && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <p>{exercise.instructions}</p>
        </div>
      )}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <p className="mb-4">{currentQuestion.text}</p>
        <p className="font-serif text-lg leading-relaxed">
          {exercise.data.passage.split(' ').map((word, index) => (
            <span
              key={index}
              onClick={() => handleWordClick(word)}
              className={`cursor-pointer mx-1 hover:text-roman-red ${
                selectedWord === word ? (isCorrect ? 'text-green-600' : 'text-red-600') : ''
              }`}>
              {word}
            </span>
          ))}
        </p>
        {isCorrect !== null && (
          <ExerciseFeedback
            isCorrect={isCorrect}
            correctAnswer={currentQuestion.correctWord}
            customSuccessMessage={
              currentQuestionIndex < exercise.data.questions.length - 1
                ? 'Correct! Moving to next question...'
                : 'Congratulations! You have completed all questions.'
            }
            customErrorMessage="Not quite. Try another word."
          />
        )}
        {isCorrect && currentQuestion.explanation && (
          <div className="mt-4 p-3 bg-blue-50 rounded">
            <p className="text-blue-800">{currentQuestion.explanation}</p>
          </div>
        )}
      </div>

      {showCompletionFeedback && (
        <ExerciseFeedback message="Outstanding! You've successfully identified all the words in the passage!" />
      )}
    </div>
  );
};

export default TextSelectionExerciseComponent;
