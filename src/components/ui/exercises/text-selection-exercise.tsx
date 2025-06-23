'use client';

import React, { useState } from 'react';
import { TextSelectionExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FeedbackDisplay } from '../feedback';

interface Props {
  exercise: TextSelectionExercise;
  onComplete?: () => void;
}

const TextSelectionExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);

  const { currentIndex, isLastItem, nextItem } = useExerciseProgression({
    totalItems: exercise.data.questions.length,
    feedbackConfig: exercise.feedbackConfig,
    onComplete,
  });

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleWordClick = (word: string, wordIndex: number) => {
    setSelectedWordIndex(wordIndex);
    const currentQuestion = exercise.data.questions[currentIndex];
    const correct = wordIndex === currentQuestion.correctWordIndex;

    if (correct) {
      handleCorrect(isLastItem);

      // Auto-advance logic based on configuration
      if (exercise.feedbackConfig.progressionRules?.autoAdvance !== false) {
        setTimeout(() => {
          nextItem();
          setSelectedWordIndex(null);
          reset();
        }, 1500);
      }
    } else {
      const correctWord = exercise.data.passage.split(' ')[currentQuestion.correctWordIndex];
      handleIncorrect(currentQuestion.hint, correctWord);
    }
  };

  const currentQuestion = exercise.data.questions[currentIndex];

  return (
    <div className="space-y-6 max-w-full">
      {exercise.title && <h3 className="text-xl font-serif text-roman-red mb-4">{exercise.title}</h3>}
      {exercise.instructions && (
        <div className="p-6 bg-roman-parchment rounded-lg mb-4">
          <p className="whitespace-pre-wrap break-words">{exercise.instructions}</p>
        </div>
      )}

      {/* Progress indicator */}
      {exercise.feedbackConfig.progressionRules?.showProgress !== false && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>
              Question {currentIndex + 1} of {exercise.data.questions.length}
            </span>
            <span>{Math.round(((currentIndex + 1) / exercise.data.questions.length) * 100)}% Complete</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-roman-red h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / exercise.data.questions.length) * 100}%` }}
            />
          </div>
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

        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={currentQuestion.hint}
          explanation={currentQuestion.explanation}
          showExplanation={isCorrect === true}
        />
      </div>
    </div>
  );
};

export default TextSelectionExerciseComponent;
