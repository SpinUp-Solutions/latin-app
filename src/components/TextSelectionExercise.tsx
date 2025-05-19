import React, { useState } from 'react';
import { TextSelectionExercise as TextSelectionExerciseType } from '@/src/types/exercise';

interface TextSelectionExerciseProps {
  exercise: TextSelectionExerciseType;
  onComplete?: () => void;
}

const TextSelectionExercise: React.FC<TextSelectionExerciseProps> = ({ exercise, onComplete }) => {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);

  const currentQuestion = exercise.data.questions[currentQuestionIndex];

  const handleWordClick = (word: string) => {
    setSelectedWord(word);
    const isCorrect = word === currentQuestion.correctWord;
    setFeedback({
      isCorrect,
      message: isCorrect ? 'Correct!' : `Incorrect. The correct answer is "${currentQuestion.correctWord}"`,
    });

    if (isCorrect) {
      // Move to next question after a short delay
      setTimeout(() => {
        if (currentQuestionIndex < exercise.data.questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
          setSelectedWord(null);
          setFeedback(null);
        } else if (onComplete) {
          onComplete();
        }
      }, 1500);
    }
  };

  // Split passage into words while preserving punctuation
  const words = exercise.data.passage.split(/(\s+)/).filter(word => word.trim());

  return (
    <div className="space-y-6">
      {exercise.title && <h3 className="text-lg font-serif text-roman-red mb-2">{exercise.title}</h3>}

      {exercise.instructions && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <p>{exercise.instructions}</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="text-lg font-serif italic leading-relaxed">
          {words.map((word, index) => (
            <span
              key={index}
              onClick={() => word.trim() && handleWordClick(word.trim())}
              className={`cursor-pointer hover:bg-roman-parchment px-1 rounded ${
                selectedWord === word.trim() ? (feedback?.isCorrect ? 'bg-green-100' : 'bg-red-100') : ''
              }`}>
              {word}
            </span>
          ))}
        </div>

        <div className="p-4 bg-white rounded-lg border border-border">
          <h4 className="font-medium mb-2">Question {currentQuestionIndex + 1}:</h4>
          <p>{currentQuestion.text}</p>
        </div>

        {feedback && (
          <div
            className={`p-4 rounded-lg ${
              feedback.isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
            {feedback.message}
            {currentQuestion.explanation && <p className="mt-2 text-sm">{currentQuestion.explanation}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default TextSelectionExercise;
