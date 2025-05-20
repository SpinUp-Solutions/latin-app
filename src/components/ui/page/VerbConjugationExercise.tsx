'use client';

import React, { useState } from 'react';
import { VerbConjugationExercise } from '@/src/types/exercise';
import ExerciseInput from '../feedback/ExerciseInput';
import ExerciseFeedback from '../feedback/ExerciseFeedback';

interface Props {
  exercise: VerbConjugationExercise;
  onComplete?: () => void;
}

const VerbConjugationExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [conjugationCompleted, setConjugationCompleted] = useState(false);
  const [showCompletionFeedback, setShowCompletionFeedback] = useState(false);

  const checkAllExercisesComplete = () => {
    const livingLatinComplete =
      !exercise.data.livingLatinPractice || currentExerciseIndex >= exercise.data.livingLatinPractice.exercises.length;

    if (conjugationCompleted && livingLatinComplete) {
      setShowCompletionFeedback(true);
      // Delay the onComplete callback to show the completion feedback
      if (onComplete) {
        setTimeout(onComplete, 2000);
      }
    }
  };

  const handleAnswerSubmit = () => {
    if (exercise.data.conjugationTask) {
      const correct = userAnswer.trim().toLowerCase() === exercise.data.conjugationTask.answer.trim().toLowerCase();
      setIsCorrect(correct);
      if (correct) {
        setConjugationCompleted(true);
        setUserAnswer('');
        if (exercise.data.livingLatinPractice) {
          setCurrentExerciseIndex(0);
        } else {
          checkAllExercisesComplete();
        }
      }
    }
  };

  const handleLivingLatinSubmit = () => {
    if (exercise.data.livingLatinPractice?.exercises[currentExerciseIndex]) {
      const correct =
        userAnswer.trim().toLowerCase() ===
        exercise.data.livingLatinPractice.exercises[currentExerciseIndex].answer.trim().toLowerCase();
      setIsCorrect(correct);
      if (correct) {
        if (currentExerciseIndex < exercise.data.livingLatinPractice.exercises.length - 1) {
          setCurrentExerciseIndex(prev => prev + 1);
          setUserAnswer('');
          setIsCorrect(null);
        } else {
          checkAllExercisesComplete();
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Main passage section */}
      <div className="bg-roman-parchment p-6 rounded-lg">
        <h3 className="text-xl font-serif mb-4">{exercise.title}</h3>
        <p className="font-serif italic mb-2">{exercise.data.passage.latin}</p>
        <p className="text-gray-700">{exercise.data.passage.translation}</p>

        {/* Special vocabulary section */}
        {exercise.data.passage.specialVocab && Object.keys(exercise.data.passage.specialVocab).length > 0 && (
          <div className="mt-4">
            <h4 className="font-serif text-roman-red mb-2">Special Vocabulary:</h4>
            <ul className="list-disc list-inside">
              {Object.entries(exercise.data.passage.specialVocab).map(([term, definition]) => (
                <li key={term}>
                  <span className="font-serif italic">{term}</span> = {definition}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Conjugation task section */}
      {exercise.data.conjugationTask && !conjugationCompleted && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <p className="mb-4">{exercise.data.conjugationTask.instructions}</p>
          <ExerciseInput
            value={userAnswer}
            onChange={setUserAnswer}
            onSubmit={handleAnswerSubmit}
            isCorrect={isCorrect}
            correctAnswer={exercise.data.conjugationTask.answer}
          />
        </div>
      )}

      {/* Living Latin Practice section */}
      {exercise.data.livingLatinPractice && conjugationCompleted && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-serif text-xl mb-4">Living Latin Practice</h4>

          {/* Examples */}
          <div className="mb-6">
            {exercise.data.livingLatinPractice.examples.map((example, index) => (
              <div key={index} className="mb-4">
                <p className="font-serif italic">{example.latin}</p>
                <p className="text-gray-700">Translation: "{example.translation}"</p>
              </div>
            ))}
          </div>

          {/* Practice exercises */}
          {currentExerciseIndex < exercise.data.livingLatinPractice.exercises.length && (
            <div>
              <p className="mb-4">
                Write in Latin: "{exercise.data.livingLatinPractice.exercises[currentExerciseIndex].english}"
              </p>
              <ExerciseInput
                value={userAnswer}
                onChange={setUserAnswer}
                onSubmit={handleLivingLatinSubmit}
                isCorrect={isCorrect}
                correctAnswer={exercise.data.livingLatinPractice.exercises[currentExerciseIndex].answer}
              />
            </div>
          )}
        </div>
      )}

      {showCompletionFeedback && (
        <ExerciseFeedback message="Excellent work! You've mastered both the conjugation and Living Latin practice!" />
      )}
    </div>
  );
};

export default VerbConjugationExerciseComponent;
