import React, { useState } from 'react';
import { FillExercise as FillExerciseType } from '@/src/types/exercise';

interface FillExerciseProps {
  exercise: FillExerciseType;
  onComplete?: () => void;
}

const FillExercise: React.FC<FillExerciseProps> = ({ exercise, onComplete }) => {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, boolean>>({});

  const handleAnswerChange = (index: number, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [index]: value,
    }));
  };

  const checkAnswers = () => {
    const newFeedback: Record<number, boolean> = {};
    let allCorrect = true;

    exercise.data.items.forEach((item, index) => {
      const isCorrect = answers[index]?.toLowerCase().trim() === item.answer.toLowerCase().trim();
      newFeedback[index] = isCorrect;
      if (!isCorrect) allCorrect = false;
    });

    setFeedback(newFeedback);
    if (allCorrect && onComplete) {
      onComplete();
    }
  };

  return (
    <div className="space-y-6">
      {exercise.title && <h3 className="text-lg font-serif text-roman-red mb-2">{exercise.title}</h3>}
      {exercise.instructions && (
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <p>{exercise.instructions}</p>
        </div>
      )}

      <div className="space-y-4">
        {exercise.data.items.map((item, index) => (
          <div key={index} className="flex items-center gap-4">
            <span className="font-serif italic">{item.text}</span>
            <input
              type="text"
              value={answers[index] || ''}
              onChange={e => handleAnswerChange(index, e.target.value)}
              className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-roman-red ${
                feedback[index] === true
                  ? 'border-green-500'
                  : feedback[index] === false
                    ? 'border-red-500'
                    : 'border-gray-300'
              }`}
              placeholder={item.hint || 'Type your answer'}
            />
            {feedback[index] !== undefined && (
              <span className={`text-sm ${feedback[index] ? 'text-green-600' : 'text-red-600'}`}>
                {feedback[index] ? '✓' : '✗'}
              </span>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={checkAnswers}
        className="px-4 py-2 bg-roman-red text-white rounded-lg hover:bg-roman-red/90 transition-colors">
        Check Answers
      </button>
    </div>
  );
};

export default FillExercise;
