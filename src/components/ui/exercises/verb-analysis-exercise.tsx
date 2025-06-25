'use client';

import React, { useState, useEffect } from 'react';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { VerbAnalysisExercise } from '@/src/types/exercise';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { validateVerbAnalysisExercise } from '@/src/utils/exercises/verbAnalysisExercise';
import { ExerciseProgress } from './exercise-progress';

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

  const currentVerb = exercise.data.verbs[currentIndex];

  useEffect(() => {
    setSelectedWordIndex(currentVerb.wordIndex);
  }, [currentVerb.wordIndex]);

  const handleWordClick = (wordIndex: number) => {
    if (wordIndex === currentVerb.wordIndex) {
      setSelectedWordIndex(wordIndex);
    }
  };

  const handleSubmit = () => {
    if (isProcessing) return; // Prevent multiple submissions

    const validation = validateVerbAnalysisExercise(userAnswer, exercise, currentIndex);
    setIsProcessing(true);

    if (validation.isCorrect) {
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
      handleIncorrect(validation.hint, validation.correctAnswer);
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
        total={exercise.data.verbs.length}
        label="Verb"
        showProgress={exercise.feedbackConfig.progressionRules?.showProgress !== false}
      />

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

        {/* Always show input field for the current verb */}
        <div className="mb-4">
          <p className="mb-4 text-gray-700">Enter the English pronoun that applies to this verb&apos;s ending:</p>
          <ExerciseInput
            value={userAnswer}
            onChange={handleAnswerChange}
            onSubmit={handleSubmit}
            placeholder="Enter pronoun (e.g., I, you, he, she, it, we, they)..."
          />
        </div>

        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={currentVerb.hint}
          explanation={currentVerb.explanation}
          showExplanation={isCorrect === true && (exercise.feedbackConfig.successMessage?.showExplanation ?? true)}
        />
      </div>
    </div>
  );
};

export default VerbAnalysisExerciseComponent;
