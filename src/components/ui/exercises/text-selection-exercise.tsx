'use client';

import React, { useState } from 'react';
import { TextSelectionExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FeedbackDisplay } from '../feedback';
import { validateTextSelectionExercise } from '@/src/utils/exercises/textSelectionExercise';
import { ExerciseProgress } from './exercise-progress';

interface Props {
  exercise: TextSelectionExercise;
  onComplete?: () => void;
}

const TextSelectionExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const { currentIndex, isLastItem, nextItem } = useExerciseProgression({
    totalItems: exercise.data.questions.length,
    feedbackConfig: exercise.feedbackConfig,
    onComplete,
  });

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleWordClick = (word: string, wordIndex: number) => {
    if (isProcessing) return; // Prevent multiple rapid clicks

    setSelectedWordIndex(wordIndex);
    const validation = validateTextSelectionExercise(wordIndex, exercise, currentIndex);
    setIsProcessing(true);

    if (validation.isCorrect) {
      handleCorrect(isLastItem);

      // Auto-advance logic based on configuration
      if (exercise.feedbackConfig.progressionRules?.autoAdvance !== false) {
        const progressionDelay = exercise.feedbackConfig.timingConfig?.progressionDelay || 1500;
        setTimeout(() => {
          nextItem();
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
        }, progressionDelay);
      } else {
        setIsProcessing(false);
      }
    } else {
      handleIncorrect(validation.hint, validation.correctAnswer);
      setIsProcessing(false);
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
      <ExerciseProgress
        current={currentIndex}
        total={exercise.data.questions.length}
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

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
          showExplanation={isCorrect === true && (exercise.feedbackConfig.successMessage?.showExplanation ?? true)}
        />
      </div>
    </div>
  );
};

export default TextSelectionExerciseComponent;
