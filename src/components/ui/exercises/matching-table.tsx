import React, { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { X, Shuffle } from 'lucide-react';
import { MatchingExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { FeedbackDisplay } from '../feedback';
import FieldSelect from '../core/field-select';
import { validateMatchingExercise } from '@/src/utils/exercises/matchingExercise';
import { ExerciseProgress } from './exercise-progress';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';

interface MatchingItem {
  id: string;
  value: string;
}

interface MatchingTableProps {
  exercise: MatchingExercise;
  onComplete?: (score: number) => void;
}

export const MatchingTable: React.FC<MatchingTableProps> = ({ exercise, onComplete }) => {
  const { leftColumn, rightColumn, answers: finalAnswer } = exercise.data;

  const [selectedLeft, setSelectedLeft] = useState<MatchingItem | null>(null);
  const [selectedRight, setSelectedRight] = useState<MatchingItem | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({}); // leftId -> rightId
  const [matchedLeftIds, setMatchedLeftIds] = useState<Set<string>>(new Set());
  const [showIncorrectFlash, setShowIncorrectFlash] = useState(false);

  const [shuffledLeftColumn, setShuffledLeftColumn] = useState<MatchingItem[]>(leftColumn);
  const [shuffledRightColumn, setShuffledRightColumn] = useState<MatchingItem[]>(rightColumn);

  const { isCorrect, message, level, showExplanation, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
    exercise.feedbackConfig
  );

  // this is for the live preview :/
  useEffect(() => {
    setShuffledLeftColumn(leftColumn);
    setShuffledRightColumn(rightColumn);
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatches({});
    setMatchedLeftIds(new Set());
    setShowIncorrectFlash(false);
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
    reset();
  };

  const handleRightSelect = (item: string, index?: number) => {
    const matchingItem = shuffledRightColumn[index!];
    if (selectedRight?.id === matchingItem?.id) {
      setSelectedRight(null);
      return;
    }
    setSelectedRight(matchingItem);
    reset();

    // Auto-match if left item is already selected
    if (selectedLeft && matchingItem) {
      const validation = validateMatchingExercise(selectedLeft, matchingItem, exercise);

      if (validation.isCorrect) {
        const newMatches = { ...matches, [selectedLeft.id]: matchingItem.id };
        setMatches(newMatches);

        const newMatchedLeftIds = new Set(matchedLeftIds);
        newMatchedLeftIds.add(selectedLeft.id);
        setMatchedLeftIds(newMatchedLeftIds);

        const isLastMatch = Object.keys(newMatches).length === Object.keys(finalAnswer).length;
        handleCorrect(isLastMatch);
        setSelectedLeft(null);
        setSelectedRight(null);

        if (isLastMatch) {
          const correctMatches = Object.keys(newMatches).length;
          const totalMatches = Object.keys(finalAnswer).length;
          const score = Math.round((correctMatches / totalMatches) * 100);

          onComplete?.(score);
        }
      } else {
        handleIncorrect();

        setShowIncorrectFlash(true);

        // Clear selections after showing red flash
        setTimeout(() => {
          setSelectedLeft(null);
          setSelectedRight(null);
          setShowIncorrectFlash(false);
          reset();
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
        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={exercise.data.hint}
          showExplanation={showExplanation}
        />
      </div>
    </div>
  );
};

export default MatchingTable;
