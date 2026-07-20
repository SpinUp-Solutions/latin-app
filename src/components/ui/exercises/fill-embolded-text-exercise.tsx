'use client';

import React, { useState, useEffect } from 'react';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useDelayedExerciseReset } from '@/src/hooks/useDelayedExerciseReset';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FillEmboldedTextExercise } from '@/src/types/exercise';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { validateFillEmboldedTextExercise } from '@/src/utils/exercises/fillEmboldedTextExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { hasVisibleFeedbackContent } from '@/src/utils/feedbackVisibility';
import type { ExerciseAnswerHandler, RuntimeMode } from '@/src/types/runtime-mode';
import { resolveRuntimeMode } from '@/src/types/runtime-mode';

interface Props {
  exercise: FillEmboldedTextExercise;
  onComplete?: (score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  testMode?: boolean;
}

const FillEmboldedTextExerciseComponent: React.FC<Props> = ({ exercise, onComplete, runtimeMode, onAnswer, testMode }) => {
  const mode = resolveRuntimeMode(runtimeMode, testMode);
  const assessmentMode = mode !== 'practice';
  const [userAnswer, setUserAnswer] = useState('');
  const [submittedAnswers, setSubmittedAnswers] = useState<string[]>([]);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState(0);

  const { currentIndex, isLastItem, isAwaitingConfirmation, autoAdvanceIfEnabled, confirmAdvance, resetIndex } =
    useExerciseProgression({
      totalItems: exercise.data.words.length,
      itemProgressionDelay: exercise.itemProgressionDelay,
      progressionRules: exercise.feedbackConfig.progressionRules,
    });

  const {
    isCorrect,
    message,
    level,
    showExplanation,
    handleCorrect,
    handleIncorrect,
    clearFeedback,
    reset,
    shouldResetExercise,
    resetExercise,
  } = useExerciseFeedback(exercise.feedbackConfig);

  useDelayedExerciseReset({
    shouldReset: !assessmentMode && shouldResetExercise,
    delayMs: exercise.itemProgressionDelay,
    onReset: () => {
      setUserAnswer('');
      setSelectedWordIndex(null);
      setCorrectAnswers(0);
      setIsProcessing(false);
      resetIndex();
      resetExercise();
    },
  });

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
    const nextAnswers = [...submittedAnswers];
    nextAnswers[currentIndex] = userAnswer;
    setSubmittedAnswers(nextAnswers);
    if (mode === 'test') onAnswer?.({ type: 'fill-embolded-text', answers: nextAnswers });
    setIsProcessing(true);

    if (validation.isCorrect) {
      const newCorrectAnswers = correctAnswers + 1;
      setCorrectAnswers(newCorrectAnswers);
      handleCorrect(isLastItem);

      const hasVisibleExplanation =
        (exercise.feedbackConfig.successMessage?.showExplanation ?? true) &&
        hasVisibleFeedbackContent(currentWord.explanation);

      if (isLastItem) {
        const finalScore = Math.round((newCorrectAnswers / exercise.data.words.length) * 100);

        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
          onComplete?.(finalScore);
        }, hasVisibleExplanation);
      } else {
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
        }, hasVisibleExplanation);
      }
    } else {
      handleIncorrect();
      if (assessmentMode) {
        const finalScore = isLastItem ? Math.round((correctAnswers / exercise.data.words.length) * 100) : null;
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
          if (finalScore !== null) onComplete?.(finalScore);
        }, false);
      } else {
        setIsProcessing(false);
      }
    }
  };

  const handleAnswerChange = (value: string) => {
    setUserAnswer(value);
    if (isCorrect === false) {
      clearFeedback();
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
            disabled={isProcessing}
          />
        </div>

        <FeedbackDisplay
          isCorrect={isCorrect}
          message={assessmentMode ? '' : message}
          level={assessmentMode ? null : level}
          hint={assessmentMode ? undefined : currentWord.hint}
          correctAnswer={assessmentMode ? undefined : currentWord.correctAnswer}
          explanation={assessmentMode ? undefined : currentWord.explanation}
          showExplanation={!assessmentMode && showExplanation}
          onContinue={(isCorrect || assessmentMode) && isAwaitingConfirmation ? confirmAdvance : undefined}
          allowContinueOnIncorrect={assessmentMode}
        />
      </div>
    </div>
  );
};

export default FillEmboldedTextExerciseComponent;
