'use client';

import React, { useState } from 'react';
import { VerbConjugationExercise } from '@/src/types/exercise';

interface Props {
  exercise: VerbConjugationExercise;
  onComplete?: () => void;
}

const VerbConjugationExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [showAnswer, setShowAnswer] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [conjugationCompleted, setConjugationCompleted] = useState(false);

  const checkAllExercisesComplete = () => {
    const livingLatinComplete =
      !exercise.data.livingLatinPractice || currentExerciseIndex >= exercise.data.livingLatinPractice.exercises.length;

    if (conjugationCompleted && livingLatinComplete && onComplete) {
      onComplete();
    }
  };

  const handleAnswerSubmit = () => {
    if (exercise.data.conjugationTask) {
      const correct = userAnswer.trim().toLowerCase() === exercise.data.conjugationTask.answer.trim().toLowerCase();
      setIsCorrect(correct);
      if (correct) {
        setConjugationCompleted(true);
        setUserAnswer('');
        // Only proceed to Living Latin if it exists
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
          <div className="flex gap-4">
            <input
              type="text"
              value={userAnswer}
              onChange={e => setUserAnswer(e.target.value)}
              className="flex-1 p-2 border rounded"
              placeholder="Type your answer in Latin..."
            />
            <button onClick={handleAnswerSubmit} className="bg-roman-red text-white px-4 py-2 rounded hover:bg-red-700">
              Check
            </button>
          </div>
          {isCorrect !== null && (
            <div className={`mt-4 p-3 rounded ${isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
              {isCorrect ? (
                'Correct! Continue to the next part.'
              ) : (
                <div>
                  <p>Not quite. The correct answer is:</p>
                  <p className="font-serif italic mt-2">{exercise.data.conjugationTask.answer}</p>
                </div>
              )}
            </div>
          )}
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
              <div className="flex gap-4">
                <input
                  type="text"
                  value={userAnswer}
                  onChange={e => setUserAnswer(e.target.value)}
                  className="flex-1 p-2 border rounded"
                  placeholder="Type your answer in Latin..."
                />
                <button
                  onClick={handleLivingLatinSubmit}
                  className="bg-roman-red text-white px-4 py-2 rounded hover:bg-red-700">
                  Check
                </button>
              </div>
              {isCorrect !== null && (
                <div className={`mt-4 p-3 rounded ${isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
                  {isCorrect ? (
                    currentExerciseIndex < exercise.data.livingLatinPractice.exercises.length - 1 ? (
                      'Correct! Continue to the next exercise.'
                    ) : (
                      'Congratulations! You have completed all exercises.'
                    )
                  ) : (
                    <div>
                      <p>Not quite. The correct answer is:</p>
                      <p className="font-serif italic mt-2">
                        {exercise.data.livingLatinPractice.exercises[currentExerciseIndex].answer}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VerbConjugationExerciseComponent;
