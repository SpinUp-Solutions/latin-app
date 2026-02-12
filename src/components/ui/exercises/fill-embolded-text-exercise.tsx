'use client';

import React, { useState, useEffect } from 'react';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FillEmboldedTextExercise } from '@/src/types/exercise';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { validateFillEmboldedTextExercise } from '@/src/utils/exercises/fillEmboldedTextExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';

interface Props {
  exercise: FillEmboldedTextExercise;
  onComplete?: (score: number) => void;
}

const FillEmboldedTextExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);

  const { currentIndex, isLastItem, autoAdvanceIfEnabled, confirmAdvance } = useExerciseProgression({
    totalItems: exercise.data.words.length,
    itemProgressionDelay: exercise.itemProgressionDelay,
    progressionRules: exercise.feedbackConfig.progressionRules,
  });

  const { isCorrect, message, level, showExplanation, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  const currentWord = exercise.data.words[currentIndex];

  useEffect(() => {
    if (currentWord) {
      setSelectedWordIndex(currentWord.wordIndex);
    }
  }, [currentWord]);

  const handleWordClick = (wordIndex: number) => {
    if (currentWord && wordIndex === currentWord.wordIndex) {
      setSelectedWordIndex(wordIndex);
    }
  };

  if (!currentWord) {
    return <div>No words configured for this exercise.</div>;
  }

  const handleSubmit = () => {
    if (isProcessing) return;

    const validation = validateFillEmboldedTextExercise(userAnswer, exercise, currentIndex);
    setIsProcessing(true);

    if (validation.isCorrect) {
      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      if (isLastItem) {
        const finalScore = Math.round((newCorrectAnswers / exercise.data.words.length) * 100);

        onComplete?.(finalScore);

        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
        });
      } else {
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
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

  const handleAnswerChange = (value: string) => {
    setUserAnswer(value);
    if (isCorrect !== null) {
      reset();
    }
  };

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
      {exercise.instructions && exercise.instructions.replace(/<[^>]*>/g, '').trim() !== '' && (
        <div className="p-6 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} className="whitespace-pre-wrap break-words" />
        </div>
      )}

      <ExerciseProgress
        current={currentIndex}
        total={exercise.data.words.length}
        label="Word"
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
                  index === currentWord.wordIndex
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

        <div className="mb-4">
          <div className="mb-4 text-gray-700">
            <SimpleRichDisplay content={currentWord.question || 'Enter the correct answer for the highlighted word:'} />
          </div>
          <ExerciseInput
            value={userAnswer}
            onChange={handleAnswerChange}
            onSubmit={handleSubmit}
            placeholder="Enter your answer..."
          />
        </div>

        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={currentWord.hint}
          correctAnswer={currentWord.correctAnswer}
          explanation={currentWord.explanation}
          showExplanation={showExplanation}
          onContinue={isCorrect ? confirmAdvance : undefined}
        />
      </div>
    </div>
  );
};

export default FillEmboldedTextExerciseComponent;
