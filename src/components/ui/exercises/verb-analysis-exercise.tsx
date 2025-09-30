'use client';

import React, { useState, useEffect } from 'react';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { VerbAnalysisExercise } from '@/src/types/exercise';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { validateVerbAnalysisExercise } from '@/src/utils/exercises/verbAnalysisExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';

interface Props {
  exercise: VerbAnalysisExercise;
  onComplete?: (score: number) => void;
}

const VerbAnalysisExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);

  const { currentIndex, isLastItem, autoAdvanceIfEnabled } = useExerciseProgression({
    totalItems: exercise.data.verbs.length,
    itemProgressionDelay: exercise.itemProgressionDelay,
    progressionRules: exercise.feedbackConfig.progressionRules,
  });

  const { isCorrect, message, level, showExplanation, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
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
      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      if (isLastItem) {
        const finalScore = Math.round((newCorrectAnswers / exercise.data.verbs.length) * 100);

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
    // Reset feedback when user types
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
      {exercise.instructions && (
        <div className="p-6 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} className="whitespace-pre-wrap break-words" />
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
          correctAnswer={currentVerb.correctPronoun}
          explanation={currentVerb.explanation}
          showExplanation={showExplanation}
        />
      </div>
    </div>
  );
};

export default VerbAnalysisExerciseComponent;
