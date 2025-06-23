'use client';

import React, { useState } from 'react';
import { VerbConjugationExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import {
  validateVerbConjugationTask,
  validateVerbConjugationLivingLatin,
} from '@/src/utils/exercises/verbConjugationExercise';
import { ExerciseProgress } from './exercise-progress';

interface Props {
  exercise: VerbConjugationExercise;
  onComplete?: () => void;
}

const VerbConjugationExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [conjugationCompleted, setConjugationCompleted] = useState(false);
  const [currentLivingLatinIndex, setCurrentLivingLatinIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleConjugationSubmit = () => {
    if (!exercise.data.conjugationTask || isProcessing) return;

    setIsProcessing(true);
    const validation = validateVerbConjugationTask(userAnswer, exercise);

    if (validation.isCorrect) {
      handleCorrect(false); // Not the final completion yet

      // Move to living latin if it exists, otherwise complete
      if (!exercise.data.livingLatinPractice) {
        const nextExerciseDelay = exercise.feedbackConfig.timingConfig?.nextExerciseDelay || 2500;
        setTimeout(() => onComplete?.(), nextExerciseDelay);
      } else {
        const progressionDelay = exercise.feedbackConfig.timingConfig?.progressionDelay || 1500;
        setTimeout(() => {
          reset();
          setConjugationCompleted(true);
          setUserAnswer('');
          setIsProcessing(false);
        }, progressionDelay);
      }
    } else {
      handleIncorrect(undefined, validation.correctAnswer);
      setIsProcessing(false);
    }
  };

  const handleLivingLatinSubmit = () => {
    if (!exercise.data.livingLatinPractice || isProcessing) return;

    setIsProcessing(true);
    const validation = validateVerbConjugationLivingLatin(userAnswer, exercise, currentLivingLatinIndex);

    if (validation.isCorrect) {
      const isLastExercise = currentLivingLatinIndex >= exercise.data.livingLatinPractice!.exercises.length - 1;
      handleCorrect(isLastExercise);

      if (isLastExercise) {
        // Auto-advance logic based on configuration
        if (exercise.feedbackConfig.progressionRules?.autoAdvance !== false) {
          const nextExerciseDelay = exercise.feedbackConfig.timingConfig?.nextExerciseDelay || 2500;
          setTimeout(() => {
            onComplete?.();
          }, nextExerciseDelay);
        }
      } else {
        // Move to next living latin exercise
        const progressionDelay = exercise.feedbackConfig.timingConfig?.progressionDelay || 1500;
        setTimeout(() => {
          reset(); // Reset feedback first
          setCurrentLivingLatinIndex(prev => prev + 1);
          setUserAnswer('');
          setIsProcessing(false);
        }, progressionDelay);
      }
    } else {
      handleIncorrect(undefined, validation.correctAnswer);
      setIsProcessing(false);
    }
  };

  const handleAnswerChange = (value: string) => {
    setUserAnswer(value);
    if (isCorrect !== null) {
      reset();
    }
    // Only reset processing state when user starts typing after an incorrect answer
    // Don't reset it after a correct answer to prevent rapid submissions
    if (isProcessing && isCorrect === false) {
      setIsProcessing(false);
    }
  };

  const currentLivingLatinExercise = exercise.data.livingLatinPractice?.exercises[currentLivingLatinIndex];

  return (
    <div className="space-y-6 max-w-full">
      {exercise.title && <h3 className="text-xl font-serif text-roman-red mb-4">{exercise.title}</h3>}
      {exercise.instructions && (
        <div className="p-6 bg-roman-parchment rounded-lg mb-4">
          <p className="whitespace-pre-wrap break-words">{exercise.instructions}</p>
        </div>
      )}

      <div className="p-6 bg-white rounded-lg border border-gray-200">
        {/* Original passage */}
        <div className="mb-6">
          <h4 className="text-lg font-serif text-roman-red mb-2">Original Passage</h4>
          <div className="p-4 bg-gray-50 rounded-lg border">
            <p className="font-serif italic text-lg mb-2">{exercise.data.passage.latin}</p>
            <p className="text-gray-700">{exercise.data.passage.translation}</p>
          </div>

          {exercise.data.passage.specialVocab && (
            <div className="mt-4 p-3 bg-roman-parchment rounded-lg">
              <h5 className="font-medium text-gray-700 mb-2">Special Vocabulary:</h5>
              <ul className="text-gray-700 text-sm space-y-1">
                {Object.entries(exercise.data.passage.specialVocab).map(([latin, definition]) => (
                  <li key={latin}>
                    <span className="italic">{latin}</span> = {definition}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Conjugation task - only show if not completed */}
        {exercise.data.conjugationTask && !conjugationCompleted && (
          <>
            <div className="mb-6">
              <h4 className="text-lg font-serif text-roman-red mb-2">Your Task</h4>
              <div className="p-4 bg-roman-parchment rounded-lg border border-gray-200">
                <p className="text-gray-800">{exercise.data.conjugationTask.instructions}</p>
              </div>
            </div>

            <div className="mb-4">
              <ExerciseInput
                value={userAnswer}
                onChange={handleAnswerChange}
                onSubmit={handleConjugationSubmit}
                placeholder="Type your conjugated Latin passage..."
                buttonText="Submit Translation"
              />
            </div>

            <FeedbackDisplay isCorrect={isCorrect} message={message} level={level} />
          </>
        )}

        {/* Living Latin practice - interactive progression */}
        {exercise.data.livingLatinPractice && conjugationCompleted && (
          <div className="mt-8 p-6 bg-roman-parchment rounded-lg border border-gray-200">
            <h4 className="text-lg font-serif text-roman-red mb-4">Living Latin Practice</h4>

            {/* Examples (always visible) */}
            <div className="mb-6">
              <h5 className="font-medium text-gray-700 mb-2">Examples:</h5>
              <div className="space-y-2">
                {exercise.data.livingLatinPractice.examples.map((example, index) => (
                  <div key={index} className="bg-white p-3 rounded border">
                    <p className="font-serif italic text-lg">{example.latin}</p>
                    <p className="text-gray-600 text-sm">{example.translation}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Current exercise */}
            {currentLivingLatinExercise && (
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <ExerciseProgress
                  current={currentLivingLatinIndex}
                  total={exercise.data.livingLatinPractice.exercises.length}
                  label="Exercise"
                />

                <p className="mb-4 text-gray-800">Write in Latin: &quot;{currentLivingLatinExercise.english}&quot;</p>

                <ExerciseInput
                  value={userAnswer}
                  onChange={handleAnswerChange}
                  onSubmit={handleLivingLatinSubmit}
                  placeholder="Type your Latin translation..."
                  buttonText="Submit"
                />

                <FeedbackDisplay isCorrect={isCorrect} message={message} level={level} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VerbConjugationExerciseComponent;
