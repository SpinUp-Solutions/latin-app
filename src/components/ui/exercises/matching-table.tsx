import React, { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { X, Shuffle } from 'lucide-react';
import { MatchingExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useDelayedExerciseReset } from '@/src/hooks/useDelayedExerciseReset';
import { FeedbackDisplay } from '../feedback';
import FieldSelect from '../core/field-select';
import { validateMatchingExercise } from '@/src/utils/exercises/matchingExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import type { ExerciseAnswerHandler, RuntimeMode } from '@/src/types/runtime-mode';
import { resolveRuntimeMode } from '@/src/types/runtime-mode';

interface MatchingItem {
  id: string;
  value: string;
}

interface MatchingTableProps {
  exercise: MatchingExercise;
  onComplete?: (score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  testMode?: boolean;
}

export const MatchingTable: React.FC<MatchingTableProps> = ({ exercise, onComplete, runtimeMode, onAnswer, testMode }) => {
  const mode = resolveRuntimeMode(runtimeMode, testMode);
  const assessmentMode = mode !== 'practice';
  const { leftColumn, rightColumn, answers: finalAnswer } = exercise.data;
  const totalRounds = exercise.data.requiredRepetitions || 1;

  const [selectedLeft, setSelectedLeft] = useState<MatchingItem | null>(null);
  const [selectedRight, setSelectedRight] = useState<MatchingItem | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({}); // leftId -> rightId
  const [matchedLeftIds, setMatchedLeftIds] = useState<Set<string>>(new Set());
  const [showIncorrectFlash, setShowIncorrectFlash] = useState(false);

  const [shuffledLeftColumn, setShuffledLeftColumn] = useState<MatchingItem[]>(leftColumn);
  const [shuffledRightColumn, setShuffledRightColumn] = useState<MatchingItem[]>(rightColumn);

  const [currentRound, setCurrentRound] = useState(1);
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [testAttemptedLeftIds, setTestAttemptedLeftIds] = useState<Set<string>>(new Set());
  const [testFirstAttemptCorrect, setTestFirstAttemptCorrect] = useState(0);

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
      setShuffledLeftColumn(leftColumn);
      setShuffledRightColumn(rightColumn);
      setSelectedLeft(null);
      setSelectedRight(null);
      setMatches({});
      setMatchedLeftIds(new Set());
      setShowIncorrectFlash(false);
      setCurrentRound(1);
      setRoundScores([]);
      setTestAttemptedLeftIds(new Set());
      setTestFirstAttemptCorrect(0);
      resetExercise();
    },
  });

  // this is for the live preview :/
  useEffect(() => {
    setShuffledLeftColumn(leftColumn);
    setShuffledRightColumn(rightColumn);
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatches({});
    setMatchedLeftIds(new Set());
    setShowIncorrectFlash(false);
    setCurrentRound(1);
    setRoundScores([]);
    setTestAttemptedLeftIds(new Set());
    setTestFirstAttemptCorrect(0);
    reset();
  }, [leftColumn, rightColumn, finalAnswer, reset]);

  const handleLeftSelect = (item: string, index?: number) => {
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
    const matchingItem = shuffledRightColumn[index!];
    if (selectedRight?.id === matchingItem?.id) {
      setSelectedRight(null);
      return;
    }
    setSelectedRight(matchingItem);
    clearFeedback();

    // Auto-match if left item is already selected
    if (selectedLeft && matchingItem) {
      if (mode === 'test') onAnswer?.({ type: 'matching', matches: { ...matches, [selectedLeft.id]: matchingItem.id } });
      const validation = validateMatchingExercise(selectedLeft, matchingItem, exercise);
      const isFirstTestAttempt = assessmentMode && !testAttemptedLeftIds.has(selectedLeft.id);

      if (isFirstTestAttempt) {
        setTestAttemptedLeftIds(previous => new Set(previous).add(selectedLeft.id));
      }

      if (validation.isCorrect) {
        const nextTestFirstAttemptCorrect = testFirstAttemptCorrect + (isFirstTestAttempt ? 1 : 0);
        if (isFirstTestAttempt) setTestFirstAttemptCorrect(nextTestFirstAttemptCorrect);
        const newMatches = { ...matches, [selectedLeft.id]: matchingItem.id };
        setMatches(newMatches);

        const newMatchedLeftIds = new Set(matchedLeftIds);
        newMatchedLeftIds.add(selectedLeft.id);
        setMatchedLeftIds(newMatchedLeftIds);

        const isLastMatch = Object.keys(newMatches).length === Object.keys(finalAnswer).length;
        const isLastRound = currentRound >= totalRounds;
        handleCorrect(isLastMatch && isLastRound);
        setSelectedLeft(null);
        setSelectedRight(null);

        if (isLastMatch) {
          const correctMatches = Object.keys(newMatches).length;
          const totalMatches = Object.keys(finalAnswer).length;
          const roundScore = assessmentMode
            ? Math.round((nextTestFirstAttemptCorrect / totalMatches) * 100)
            : Math.round((correctMatches / totalMatches) * 100);

          if (isLastRound) {
            const allScores = [...roundScores, roundScore];
            const averageScore = Math.round(allScores.reduce((sum, s) => sum + s, 0) / allScores.length);
            onComplete?.(averageScore);
          } else {
            // Start next round: reset state and reshuffle
            const nextRoundScores = [...roundScores, roundScore];
            setRoundScores(nextRoundScores);
            setCurrentRound(prev => prev + 1);
            setMatches({});
            setMatchedLeftIds(new Set());
            setShuffledLeftColumn(shuffleArray(leftColumn));
            setShuffledRightColumn(shuffleArray(rightColumn));
            setTestAttemptedLeftIds(new Set());
            setTestFirstAttemptCorrect(0);
            reset();
          }
        }
      } else {
        handleIncorrect();

        setShowIncorrectFlash(!assessmentMode);

        // Clear selections after showing red flash
        setTimeout(() => {
          setSelectedLeft(null);
          setSelectedRight(null);
          setShowIncorrectFlash(false);
          clearFeedback();
        }, 1000);
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
    setShuffledLeftColumn(shuffleArray(leftColumn));
    setShuffledRightColumn(shuffleArray(rightColumn));
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  const clearSelection = () => {
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  return (
    <div className="space-y-6">
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

      {/* Round indicator */}
      {totalRounds > 1 && (
        <div className="text-sm font-medium text-roman-terracotta text-center">
          Round {currentRound} of {totalRounds}
        </div>
      )}

      {/* Progress indicator */}
      <ExerciseProgress current={Object.keys(matches).length} total={Object.keys(finalAnswer).length} label="Match" />

      <div className="p-6 bg-white rounded-lg border border-gray-200">
        {/* Controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShuffle}>
              <Shuffle className="h-4 w-4 mr-2" />
              Shuffle
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              <X className="h-4 w-4 mr-2" />
              Clear Selection
            </Button>
          </div>
          <div className="text-sm text-gray-600">
            {Object.keys(matches).length} of {Object.keys(finalAnswer).length} matches completed
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
            />
          </div>
        </div>

        {/* Feedback Display */}
        {!assessmentMode && <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={exercise.data.hint}
          showExplanation={showExplanation}
        />}
      </div>
    </div>
  );
};

export default MatchingTable;
