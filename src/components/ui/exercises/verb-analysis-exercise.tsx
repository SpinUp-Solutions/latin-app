import React, { useState } from 'react';
import { VerbAnalysisExercise as VerbAnalysisExerciseType } from '@/src/types/exercise';
import { Check, X } from 'lucide-react';

interface VerbAnalysisExerciseProps {
  exercise: VerbAnalysisExerciseType;
  onComplete?: () => void;
}

const VerbAnalysisExercise: React.FC<VerbAnalysisExerciseProps> = ({ exercise, onComplete }) => {
  const [currentVerbIndex, setCurrentVerbIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, { isCorrect: boolean; message: string }>>({});
  const [showInput, setShowInput] = useState<number | null>(null);

  const currentVerb = exercise.data.verbs[currentVerbIndex];

  const handleVerbClick = (index: number) => {
    if (currentVerb && index === currentVerb.wordIndex) {
      setShowInput(index);
    }
  };

  const handleAnswerSubmit = (answer: string) => {
    const isCorrect = answer.toLowerCase().trim() === currentVerb.correctPronoun.toLowerCase().trim();

    setAnswers(prev => ({
      ...prev,
      [currentVerbIndex]: answer,
    }));

    setFeedback(prev => ({
      ...prev,
      [currentVerbIndex]: {
        isCorrect,
        message: isCorrect ? 'Correct!' : `Incorrect. The correct answer is "${currentVerb.correctPronoun}"`,
      },
    }));
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
        <div className="text-lg font-serif italic leading-relaxed whitespace-pre-wrap break-words min-w-[300px]">
          {words.map((word, index) => {
            const isCurrentVerb = currentVerb && index === currentVerb.wordIndex;
            const isAnsweredVerb = answers[currentVerbIndex] && currentVerb && index === currentVerb.wordIndex;

            return (
              <span key={index} className="relative inline-block">
                <span
                  onClick={() => handleVerbClick(index)}
                  className={`cursor-pointer px-1 rounded inline-block min-h-[1.5em] ${
                    isCurrentVerb
                      ? 'font-bold text-roman-red hover:bg-roman-parchment'
                      : isAnsweredVerb
                        ? feedback[currentVerbIndex]?.isCorrect
                          ? 'text-green-600'
                          : 'text-red-600'
                        : ''
                  }`}>
                  {word}
                </span>

                {showInput === index && (
                  <div className="fixed transform -translate-y-full mt-[-8px] z-50">
                    <div className="w-64">
                      {feedback[currentVerbIndex] && (
                        <div
                          className={`mb-2 p-3 rounded-lg shadow-md border ${
                            feedback[currentVerbIndex].isCorrect
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : 'bg-red-50 border-red-200 text-red-700'
                          }`}>
                          <div className="flex items-center gap-2 mb-1">
                            {feedback[currentVerbIndex].isCorrect ? (
                              <Check className="h-5 w-5 text-green-500" />
                            ) : (
                              <X className="h-5 w-5 text-red-500" />
                            )}
                            <span className="font-medium">
                              {feedback[currentVerbIndex].isCorrect ? 'Correct!' : 'Incorrect'}
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="bg-white p-2 rounded-lg shadow-lg border border-gray-200">
                        <input
                          type="text"
                          autoFocus
                          className="w-full px-2 py-1 border rounded"
                          placeholder="Enter pronoun..."
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              handleAnswerSubmit(e.currentTarget.value);
                            }
                          }}
                          onBlur={e => {
                            handleAnswerSubmit(e.target.value);
                            setShowInput(null);
                            const isCorrect =
                              e.target.value.toLowerCase().trim() === currentVerb.correctPronoun.toLowerCase().trim();
                            if (isCorrect) {
                              if (currentVerbIndex < exercise.data.verbs.length - 1) {
                                setCurrentVerbIndex(prev => prev + 1);
                              } else if (currentVerbIndex === exercise.data.verbs.length - 1) {
                                onComplete?.();
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VerbAnalysisExercise;
