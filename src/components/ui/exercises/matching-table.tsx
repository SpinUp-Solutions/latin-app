import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { X, Shuffle } from 'lucide-react';
import { MatchingExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { FeedbackDisplay } from '../feedback';
import FieldSelect from '../core/field-select';
import { getSelectableMatchingAnswers, validateMatchingExercise } from '@/src/utils/exercises/matchingExercise';
import { ExerciseProgress } from './exercise-progress';
import { ExerciseIntro } from './exercise-intro';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';
import { hasVisibleFeedbackContent, revealsHintOrAnswer } from '@/src/utils/feedbackVisibility';

interface MatchingItem {
  id: string;
  value: string;
}

interface MatchingTableProps {
  exercise: MatchingExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
}

const MatchingTable: React.FC<MatchingTableProps> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
}) => {
  const mode = runtimeMode ?? 'practice';
  const testAnswerMode = mode === 'test';
  const { leftColumn, rightColumn } = exercise.data;
  const finalAnswer = useMemo(() => getSelectableMatchingAnswers(exercise), [exercise]);
  const totalMatches = testAnswerMode
    ? (exercise.data.expectedMatchCount ?? leftColumn.length)
    : Object.keys(finalAnswer).length;
  const totalRounds = exercise.data.requiredRepetitions || 1;
  const restoredRounds = useMemo(
    () => (initialAnswer?.type === 'matching' ? initialAnswer.rounds : []),
    [initialAnswer]
  );
  const lastRestoredRoundComplete =
    restoredRounds.length > 0 && Object.keys(restoredRounds[restoredRounds.length - 1] ?? {}).length >= totalMatches;
  const restoredRound =
    lastRestoredRoundComplete && restoredRounds.length < totalRounds
      ? restoredRounds.length + 1
      : Math.min(Math.max(restoredRounds.length, 1), totalRounds);
  const restoredMatches = useMemo(
    () => (restoredRound > restoredRounds.length ? {} : (restoredRounds[restoredRound - 1] ?? {})),
    [restoredRound, restoredRounds]
  );

  const [selectedLeft, setSelectedLeft] = useState<MatchingItem | null>(null);
  const [selectedRight, setSelectedRight] = useState<MatchingItem | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>(restoredMatches); // leftId -> rightId
  const [matchedLeftIds, setMatchedLeftIds] = useState<Set<string>>(new Set(Object.keys(restoredMatches)));
  const [showIncorrectFlash, setShowIncorrectFlash] = useState(false);

  const [shuffledLeftColumn, setShuffledLeftColumn] = useState<MatchingItem[]>(leftColumn);
  const [shuffledRightColumn, setShuffledRightColumn] = useState<MatchingItem[]>(rightColumn);

  const [currentRound, setCurrentRound] = useState(restoredRound);
  const [testRounds, setTestRounds] = useState<Record<string, string>[]>(restoredRounds);

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
    willResetOnNextIncorrect,
    nextIncorrectLevel,
    resetExercise,
  } = useExerciseFeedback(exercise.feedbackConfig);

  const resetRequired = mode === 'practice' && shouldResetExercise;
  const incorrectFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    isAwaitingConfirmation,
    autoAdvanceIfEnabled,
    awaitConfirmation,
    confirmAdvance,
    cancelPendingAdvance,
    resetIndex,
  } = useExerciseProgression({
    totalItems: 1,
    itemProgressionDelay: exercise.itemProgressionDelay,
    progressionRules: exercise.feedbackConfig.progressionRules,
  });
  // A miss held for Got it, or the Continue after the last match, is the only way on until it is pressed.
  const locked = resetRequired || isAwaitingConfirmation;
  const correctAnswerFor = (left: MatchingItem | null) =>
    left ? rightColumn.find(item => item.id === finalAnswer[left.id])?.value : undefined;

  const clearIncorrectFlashTimeout = () => {
    if (incorrectFlashTimeoutRef.current) {
      clearTimeout(incorrectFlashTimeoutRef.current);
      incorrectFlashTimeoutRef.current = null;
    }
  };

  const handleExerciseReset = () => {
    clearIncorrectFlashTimeout();
    cancelPendingAdvance();
    resetIndex();
    setShuffledLeftColumn(leftColumn);
    setShuffledRightColumn(rightColumn);
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatches({});
    setMatchedLeftIds(new Set());
    setShowIncorrectFlash(false);
    setCurrentRound(1);
    setTestRounds([]);
    resetExercise();
  };

  useEffect(() => {
    return () => {
      clearIncorrectFlashTimeout();
    };
  }, []);

  const previousSource = useRef({
    leftColumn,
    rightColumn,
    finalAnswer,
    restoredMatches,
    restoredRound,
    restoredRounds,
  });

  // Reset when the preview data changes, not when an Activity restores effects.
  useEffect(() => {
    const previous = previousSource.current;
    if (
      previous.leftColumn === leftColumn &&
      previous.rightColumn === rightColumn &&
      previous.finalAnswer === finalAnswer &&
      previous.restoredMatches === restoredMatches &&
      previous.restoredRound === restoredRound &&
      previous.restoredRounds === restoredRounds
    )
      return;
    previousSource.current = { leftColumn, rightColumn, finalAnswer, restoredMatches, restoredRound, restoredRounds };
    clearIncorrectFlashTimeout();
    cancelPendingAdvance();
    setShuffledLeftColumn(leftColumn);
    setShuffledRightColumn(rightColumn);
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatches(restoredMatches);
    setMatchedLeftIds(new Set(Object.keys(restoredMatches)));
    setShowIncorrectFlash(false);
    setCurrentRound(restoredRound);
    setTestRounds(restoredRounds);
    reset();
  }, [
    leftColumn,
    rightColumn,
    finalAnswer,
    reset,
    cancelPendingAdvance,
    restoredMatches,
    restoredRound,
    restoredRounds,
  ]);

  const clearMiss = () => {
    setSelectedLeft(null);
    setSelectedRight(null);
    setShowIncorrectFlash(false);
    clearFeedback();
  };

  const handleLeftSelect = (item: string, index?: number) => {
    if (locked) return;

    const matchingItem = shuffledLeftColumn[index!];
    if (matchedLeftIds.has(matchingItem?.id)) {
      return;
    }
    if (selectedLeft?.id === matchingItem?.id) {
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(matchingItem);
    setSelectedRight(null);
    clearFeedback();
  };

  const handleRightSelect = (item: string, index?: number) => {
    if (locked) return;

    const matchingItem = shuffledRightColumn[index!];
    if (selectedRight?.id === matchingItem?.id) {
      setSelectedRight(null);
      return;
    }
    setSelectedRight(matchingItem);
    clearFeedback();

    // Auto-match if left item is already selected
    if (selectedLeft && matchingItem) {
      if (testAnswerMode) {
        const nextMatches = { ...matches, [selectedLeft.id]: matchingItem.id };
        const nextRounds = [...testRounds];
        nextRounds[currentRound - 1] = nextMatches;
        setMatches(nextMatches);
        setTestRounds(nextRounds);
        setMatchedLeftIds(previous => new Set(previous).add(selectedLeft.id));
        setSelectedLeft(null);
        setSelectedRight(null);
        onAnswer?.({ type: 'matching', rounds: nextRounds });

        if (Object.keys(nextMatches).length === totalMatches) {
          if (currentRound >= totalRounds) {
            onComplete?.(0);
          } else {
            setCurrentRound(previous => previous + 1);
            setMatches({});
            setMatchedLeftIds(new Set());
            setShuffledLeftColumn(shuffleArray(leftColumn));
            setShuffledRightColumn(shuffleArray(rightColumn));
          }
        }
        return;
      }

      const validation = validateMatchingExercise(selectedLeft, matchingItem, exercise);

      if (validation.isCorrect) {
        clearIncorrectFlashTimeout();
        setShowIncorrectFlash(false);
        const newMatches = { ...matches, [selectedLeft.id]: matchingItem.id };
        const nextRounds = [...testRounds];
        nextRounds[currentRound - 1] = newMatches;
        setMatches(newMatches);
        setTestRounds(nextRounds);

        const newMatchedLeftIds = new Set(matchedLeftIds);
        newMatchedLeftIds.add(selectedLeft.id);
        setMatchedLeftIds(newMatchedLeftIds);

        const isLastMatch = Object.keys(newMatches).length === Object.keys(finalAnswer).length;
        const isLastRound = currentRound >= totalRounds;
        handleCorrect(isLastMatch && isLastRound);
        setSelectedLeft(null);
        setSelectedRight(null);

        if (isLastMatch) {
          if (isLastRound) {
            const score = Math.round(gradeExercisePercentage({ exercise }, { type: 'matching', rounds: nextRounds }));
            onCompletionAccepted?.(score);
            autoAdvanceIfEnabled(() => {
              onComplete?.(score);
            }, false);
          } else {
            // Start next round: reset state and reshuffle
            setCurrentRound(prev => prev + 1);
            setMatches({});
            setMatchedLeftIds(new Set());
            setShuffledLeftColumn(shuffleArray(leftColumn));
            setShuffledRightColumn(shuffleArray(rightColumn));
            reset();
          }
        }
      } else {
        const reachesResetThreshold = willResetOnNextIncorrect;
        const revealsOnMiss = revealsHintOrAnswer(
          nextIncorrectLevel,
          exercise.data.hint,
          correctAnswerFor(selectedLeft)
        );
        handleIncorrect();

        setShowIncorrectFlash(true);

        clearIncorrectFlashTimeout();
        if (reachesResetThreshold) {
          cancelPendingAdvance();
        } else if (revealsOnMiss) {
          // A shown hint or answer stays, with the wrong pair, until the student acknowledges it.
          awaitConfirmation(clearMiss);
        } else {
          incorrectFlashTimeoutRef.current = setTimeout(() => {
            incorrectFlashTimeoutRef.current = null;
            clearMiss();
          }, 1000);
        }
      }
    }
  };

  const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  const handleShuffle = () => {
    if (locked) return;
    setShuffledLeftColumn(shuffleArray(leftColumn));
    setShuffledRightColumn(shuffleArray(rightColumn));
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  const clearSelection = () => {
    if (locked) return;
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  const matchingTotal = totalMatches * totalRounds;
  const matchingCompleted = (currentRound - 1) * totalMatches + Object.keys(matches).length;
  const selectedCorrectAnswer = correctAnswerFor(selectedLeft);

  return (
    <div className="space-y-6">
      <ExerciseIntro
        variant="passage"
        title={exercise.title}
        audioPath={exercise.audioPath}
        instructions={exercise.instructions}
      />

      {/* Round indicator */}
      {totalRounds > 1 && (
        <div className="text-sm font-medium text-roman-terracotta text-center">
          Round {currentRound} of {totalRounds}
        </div>
      )}

      {/* Progress indicator */}
      <ExerciseProgress
        currentIndex={Math.min(matchingCompleted, Math.max(matchingTotal - 1, 0))}
        completed={matchingCompleted}
        total={matchingTotal}
        label="Match"
      />

      <div className="p-6 bg-white rounded-lg border border-gray-200">
        {/* Controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShuffle} disabled={locked}>
              <Shuffle className="h-4 w-4 mr-2" />
              Shuffle
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection} disabled={locked}>
              <X className="h-4 w-4 mr-2" />
              Clear Selection
            </Button>
          </div>
          <div className="text-sm text-gray-600">
            {Object.keys(matches).length} of {totalMatches} matches completed
          </div>
        </div>

        {/* Matching interface */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-700 mb-3">Select from left column:</h4>
            <FieldSelect
              items={shuffledLeftColumn.map(item => item.value)}
              selectedItem={selectedLeft?.value || null}
              selectedIndex={selectedLeft ? shuffledLeftColumn.findIndex(item => item.id === selectedLeft.id) : null}
              onSelect={handleLeftSelect}
              matches={{}}
              matchType="key"
              label=""
              matchedIndices={
                new Set(
                  shuffledLeftColumn
                    .map((item, index) => (matchedLeftIds.has(item.id) ? index : -1))
                    .filter(index => index !== -1)
                )
              }
              showIncorrect={showIncorrectFlash}
              pulseIncorrect={!isAwaitingConfirmation}
              disabled={locked}
            />
          </div>

          {/* Right column */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-700 mb-3">Match with right column:</h4>
            <FieldSelect
              items={shuffledRightColumn.map(item => item.value)}
              selectedItem={selectedRight?.value || null}
              selectedIndex={selectedRight ? shuffledRightColumn.findIndex(item => item.id === selectedRight.id) : null}
              onSelect={handleRightSelect}
              matches={{}}
              matchType="value"
              label=""
              matchedIndices={new Set()}
              showIncorrect={showIncorrectFlash}
              pulseIncorrect={!isAwaitingConfirmation}
              disabled={locked}
            />
          </div>
        </div>

        {/* Feedback Display */}
        {!testAnswerMode && (
          <FeedbackDisplay
            isCorrect={isCorrect}
            message={message}
            level={level}
            hint={exercise.data.hint}
            showExplanation={showExplanation}
            correctAnswer={
              selectedCorrectAnswer && hasVisibleFeedbackContent(selectedCorrectAnswer) ? (
                <SimpleRichDisplay content={selectedCorrectAnswer} />
              ) : undefined
            }
            onContinue={isAwaitingConfirmation ? confirmAdvance : undefined}
            allowContinueOnIncorrect
            onStartOver={resetRequired ? handleExerciseReset : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default MatchingTable;
