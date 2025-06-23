'use client';

import React, { useState } from 'react';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { VerbAnalysisExercise } from '@/src/types/exercise';
import { ExerciseInput, FeedbackDisplay } from '../feedback';

interface Props {
  exercise: VerbAnalysisExercise;
  onComplete?: () => void;
}

const VerbAnalysisExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const { currentIndex, isLastItem, nextItem } = useExerciseProgression({
    totalItems: exercise.data.verbs.length,
    feedbackConfig: exercise.feedbackConfig,
    onComplete,
  });

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleWordClick = (wordIndex: number) => {
    const currentVerb = exercise.data.verbs[currentIndex];
    if (wordIndex === currentVerb.wordIndex) {
      setSelectedWordIndex(wordIndex);
    }
  };

  const handleSubmit = () => {
    if (isProcessing) return; // Prevent multiple submissions

    const currentVerb = exercise.data.verbs[currentIndex];
    const correct = userAnswer.trim().toLowerCase() === currentVerb.correctPronoun.toLowerCase();

    setIsProcessing(true);

    if (correct) {
      handleCorrect(isLastItem);

      // Auto-advance logic based on configuration
      if (exercise.feedbackConfig.progressionRules?.autoAdvance !== false) {
        const progressionDelay = exercise.feedbackConfig.timingConfig?.progressionDelay || 1500;
        setTimeout(() => {
          nextItem();
          setUserAnswer('');
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
        }, progressionDelay);
      } else {
        setIsProcessing(false);
      }
    } else {
      handleIncorrect(currentVerb.hint, currentVerb.correctPronoun);
      setIsProcessing(false);
    }
  };

  const handleAnswerChange = (value: string) => {
    setUserAnswer(value);
    // Reset feedback when user types
    if (isCorrect !== null) {
      reset();
    }
  };

  const currentVerb = exercise.data.verbs[currentIndex];

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
              Verb {currentIndex + 1} of {exercise.data.verbs.length}
            </span>
            <span>{Math.round(((currentIndex + 1) / exercise.data.verbs.length) * 100)}% Complete</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-roman-red h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / exercise.data.verbs.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="p-6 bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <div className="font-serif text-lg leading-relaxed min-w-[300px] mb-6">
            {exercise.data.passage.split(' ').map((word, index) => (
              <span
                key={index}
                onClick={() => handleWordClick(index)}
                className={`cursor-pointer inline-block px-1 py-0.5 mx-0.5 rounded transition-colors ${
                  index === currentVerb.wordIndex
                    ? 'bg-roman-red text-white font-bold'
                    : selectedWordIndex === index
                      ? 'bg-roman-parchment text-roman-red'
                      : 'hover:bg-roman-parchment hover:text-roman-red'
                }`}>
                {word}
              </span>
            ))}
          </div>
        </div>

        {selectedWordIndex === currentVerb.wordIndex && (
          <div className="mb-4">
            <p className="mb-4 text-gray-700">Enter the English pronoun that applies to this verb's ending:</p>
            <ExerciseInput
              value={userAnswer}
              onChange={handleAnswerChange}
              onSubmit={handleSubmit}
              placeholder="Enter pronoun (e.g., I, you, he, she, it, we, they)..."
            />
          </div>
        )}

        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={currentVerb.hint}
          explanation={currentVerb.explanation}
          showExplanation={isCorrect === true}
        />
      </div>
    </div>
  );
};

export default VerbAnalysisExerciseComponent;
