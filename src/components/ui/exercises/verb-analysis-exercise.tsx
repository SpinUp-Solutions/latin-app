import React, { useState } from 'react';
import { VerbAnalysisExercise as VerbAnalysisExerciseType } from '@/src/types/exercise';
import { Check, X } from 'lucide-react';

interface VerbAnalysisExerciseProps {
  exercise: VerbAnalysisExerciseType;
  onComplete?: () => void;
}

const VerbAnalysisExercise: React.FC<VerbAnalysisExerciseProps> = ({ exercise, onComplete }) => {
  const [currentVerbIndex, setCurrentVerbIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);

  const currentVerb = exercise.data.verbs[currentVerbIndex];

  const handleAnswerSubmit = () => {
    if (!userAnswer.trim()) return; // Don't submit empty answers

    const isCorrect = userAnswer.toLowerCase().trim() === currentVerb.correctPronoun.toLowerCase().trim();

    setFeedback({
      isCorrect,
      message: isCorrect ? 'Correct!' : `Incorrect. The correct answer is "${currentVerb.correctPronoun}"`,
    });

    if (isCorrect) {
      // Move to next verb after showing feedback
      setTimeout(() => {
        setUserAnswer('');
        setFeedback(null);
        if (currentVerbIndex < exercise.data.verbs.length - 1) {
          setCurrentVerbIndex(prev => prev + 1);
        } else {
          onComplete?.();
        }
      }, 1500);
    } else {
      // Clear input for retry
      setTimeout(() => {
        setUserAnswer('');
        setFeedback(null);
      }, 2000);
    }
  };

  const words = exercise.data.passage.split(/(\s+)/).filter(word => word.trim());

  return (
    <div className="space-y-6 max-w-full">
      {exercise.title && <h3 className="text-lg font-serif text-roman-red mb-2">{exercise.title}</h3>}

      {exercise.instructions && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <p>{exercise.instructions}</p>
        </div>
      )}

      <div className="p-4 bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <div className="text-lg font-serif italic leading-relaxed whitespace-pre-wrap break-words min-w-[300px] mb-6">
          {words.map((word, index) => {
            const isCurrentVerb = currentVerb && index === currentVerb.wordIndex;

            return (
              <span
                key={index}
                className={`px-1 rounded inline-block min-h-[1.5em] ${
                  isCurrentVerb ? 'font-bold text-roman-red bg-roman-parchment' : ''
                }`}>
                {word}
              </span>
            );
          })}
        </div>

        {/* Current verb instruction */}
        {currentVerb && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-blue-800 font-medium">
              Enter the pronoun for the highlighted verb:{' '}
              <span className="font-bold italic">{words[currentVerb.wordIndex]}</span>
            </p>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div
            className={`mb-4 p-3 rounded-lg shadow-md border ${
              feedback.isCorrect
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
            <div className="flex items-center gap-2">
              {feedback.isCorrect ? (
                <Check className="h-5 w-5 text-green-500" />
              ) : (
                <X className="h-5 w-5 text-red-500" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
          </div>
        )}

        {/* Input field - always visible */}
        <div className="flex gap-2">
          <input
            type="text"
            value={userAnswer}
            onChange={e => setUserAnswer(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-roman-red"
            placeholder="Enter pronoun..."
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleAnswerSubmit();
              }
            }}
          />
          <button
            onClick={handleAnswerSubmit}
            className="px-4 py-2 bg-roman-red text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-roman-red">
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerbAnalysisExercise;
