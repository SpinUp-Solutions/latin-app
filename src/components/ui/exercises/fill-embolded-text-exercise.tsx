'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FillEmboldedTextExercise } from '@/src/types/exercise';
import { ExerciseInput, FeedbackDisplay } from '../feedback';
import { validateFillEmboldedTextExercise } from '@/src/utils/exercises/fillEmboldedTextExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { hasVisibleFeedbackContent } from '@/src/utils/feedbackVisibility';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';
import { RecordedAnswerControls } from './recorded-answer-controls';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';
import { splitHtmlIntoWords } from '@/src/utils/htmlWordSplitter';
import { richTextToPlainText } from '@/src/utils/exercises/helpers';

interface Props {
  exercise: FillEmboldedTextExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
}

const FillEmboldedTextExerciseComponent: React.FC<Props> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
}) => {
  const mode = runtimeMode ?? 'practice';
  const assessmentMode = mode !== 'practice';
  const testAnswerMode = mode === 'test';
  const passageWords = useMemo(() => splitHtmlIntoWords(exercise.data.passage), [exercise.data.passage]);
  const restoredAnswers = initialAnswer?.type === 'fill-embolded-text' ? initialAnswer.answers : [];
  const firstIncompleteIndex = exercise.data.words.findIndex((_, index) => !restoredAnswers[index]?.trim());
  const restoredIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(exercise.data.words.length - 1, 0);
  const [userAnswer, setUserAnswer] = useState(restoredAnswers[restoredIndex] ?? '');
  const [submittedAnswers, setSubmittedAnswers] = useState<string[]>(restoredAnswers);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(Boolean(restoredAnswers[restoredIndex]?.trim()));

  const {
    currentIndex,
    isLastItem,
    isAwaitingConfirmation,
    autoAdvanceIfEnabled,
    confirmAdvance,
    resetIndex,
    nextItem,
    cancelPendingAdvance,
  } = useExerciseProgression({
    totalItems: exercise.data.words.length,
    initialIndex: restoredIndex,
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

  const resetRequired = mode === 'practice' && shouldResetExercise;

  const handleExerciseReset = () => {
    cancelPendingAdvance();
    setUserAnswer('');
    setSelectedWordIndex(null);
    setIsProcessing(false);
    setTestSubmitted(false);
    setSubmittedAnswers([]);
    resetIndex();
    resetExercise();
  };

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
    if (isProcessing || !userAnswer.trim() || resetRequired) return;

    const nextAnswers = [...submittedAnswers];
    nextAnswers[currentIndex] = userAnswer;
    setSubmittedAnswers(nextAnswers);
    setIsProcessing(true);

    if (testAnswerMode) {
      onAnswer?.({ type: 'fill-embolded-text', answers: nextAnswers });
      setTestSubmitted(true);
      return;
    }

    const validation = validateFillEmboldedTextExercise(userAnswer, exercise, currentIndex);
    const finalScore = isLastItem
      ? Math.round(gradeExercisePercentage({ exercise }, { type: 'fill-embolded-text', answers: nextAnswers }))
      : null;

    if (validation.isCorrect) {
      handleCorrect(isLastItem);

      const hasVisibleExplanation =
        (exercise.feedbackConfig.successMessage?.showExplanation ?? true) &&
        hasVisibleFeedbackContent(currentWord.explanation);

      if (isLastItem) {
        if (!assessmentMode) onCompletionAccepted?.(finalScore!);
        autoAdvanceIfEnabled(() => {
          setUserAnswer('');
          setSelectedWordIndex(null);
          reset();
          setIsProcessing(false);
          onComplete?.(finalScore!);
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

  const continueTest = () => {
    if (isLastItem) {
      onComplete?.(0);
      return;
    }
    const nextAnswer = submittedAnswers[currentIndex + 1] ?? '';
    setUserAnswer(nextAnswer);
    setSelectedWordIndex(null);
    setTestSubmitted(Boolean(nextAnswer.trim()));
    setIsProcessing(false);
    reset();
    nextItem();
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
            {passageWords.map((wordHtml, index) => (
              <div
                key={`${index}-${wordHtml.slice(0, 10)}`}
                onClick={() => handleWordClick(index)}
                role="button"
                tabIndex={0}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleWordClick(index);
                  }
                }}
                aria-label={`Word ${index + 1}: ${richTextToPlainText(wordHtml)}`}
                className={`cursor-pointer inline-block px-1 py-0.5 mx-0.5 rounded transition-colors ${
                  index === currentWord.wordIndex
                    ? 'bg-roman-red text-white font-bold'
                    : selectedWordIndex === index
                      ? 'bg-roman-parchment text-roman-red'
                      : 'hover:bg-roman-parchment hover:text-roman-red'
                }`}>
                <SimpleRichDisplay content={wordHtml} className="inline not-prose" />
              </div>
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
            disabled={isProcessing || resetRequired}
          />
        </div>

        {testAnswerMode ? (
          testSubmitted && <RecordedAnswerControls isLastItem={isLastItem} onContinue={continueTest} />
        ) : (
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
            onStartOver={resetRequired ? handleExerciseReset : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default FillEmboldedTextExerciseComponent;
