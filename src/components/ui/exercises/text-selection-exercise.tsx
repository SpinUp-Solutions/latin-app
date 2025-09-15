'use client';

import React, { useState } from 'react';
import { TextSelectionExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FeedbackDisplay } from '../feedback';
import { validateTextSelectionExercise } from '@/src/utils/exercises/textSelectionExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';

interface Props {
  exercise: TextSelectionExercise;
  onComplete?: (score: number) => void;
}

const TextSelectionExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);

  const { currentIndex, isLastItem, autoAdvanceIfEnabled } = useExerciseProgression({
    totalItems: exercise.data.questions.length,
    feedbackConfig: exercise.feedbackConfig,
  });

  const { isCorrect, message, level, showExplanation, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const handleWordClick = (wordIndex: number) => {
    if (isProcessing) return; // Prevent multiple rapid clicks

    setSelectedWordIndex(wordIndex);
    const validation = validateTextSelectionExercise(wordIndex, exercise, currentIndex);
    setIsProcessing(true);

    if (validation.isCorrect) {
      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      if (isLastItem) {
        const finalScore = Math.round((newCorrectAnswers / exercise.data.questions.length) * 100);

        onComplete?.(finalScore);

        autoAdvanceIfEnabled(() => {
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
        });
      } else {
        autoAdvanceIfEnabled(() => {
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
        });
      }
    } else {
      handleIncorrect();
      setIsProcessing(false);
    }
  };

  const currentQuestion = exercise.data.questions[currentIndex];

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex justify-between items-start">
        {exercise.title && (
          <h3 className="text-xl font-serif text-roman-red mb-4">
            <SimpleRichDisplay content={exercise.title} />
          </h3>
        )}
        {exercise.audioPath && (
          <AudioPlayButton
            audioPath={exercise.audioPath}
            variant="default"
            size="sm"
            className="ml-2 rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
          />
        )}
      </div>
      {exercise.instructions && (
        <div className="p-6 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} className="whitespace-pre-wrap break-words" />
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
          <SimpleRichDisplay
            content={currentQuestion.text}
            className="mb-6 whitespace-pre-wrap break-words min-w-[300px]"
          />
          <div className="font-serif text-lg leading-relaxed min-w-[300px]">
            {exercise.data.passage.split(' ').map((word, index) => (
              <span
                key={index}
                onClick={() => handleWordClick(index)}
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
          correctAnswer={exercise.data.passage.split(' ')[currentQuestion.correctWordIndex]}
          explanation={currentQuestion.explanation}
          showExplanation={showExplanation}
        />
      </div>
    </div>
  );
};

export default TextSelectionExerciseComponent;
