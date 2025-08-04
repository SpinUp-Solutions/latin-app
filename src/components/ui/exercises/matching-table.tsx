import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/src/components/ui/button';
import { X, ArrowRight, Shuffle } from 'lucide-react';
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
  onComplete?: () => void;
}

export const MatchingTable: React.FC<MatchingTableProps> = ({ exercise, onComplete }) => {
  const { leftColumn, rightColumn, answers: finalAnswer } = exercise.data;

  const [selectedLeft, setSelectedLeft] = useState<MatchingItem | null>(null);
  const [selectedRight, setSelectedRight] = useState<MatchingItem | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({}); // leftId -> rightId
  const [matchedLeftIds, setMatchedLeftIds] = useState<Set<string>>(new Set());
  const [matchedRightIds, setMatchedRightIds] = useState<Set<string>>(new Set());
  const [showIncorrectFlash, setShowIncorrectFlash] = useState(false);

  const [shuffledLeftColumn, setShuffledLeftColumn] = useState<MatchingItem[]>(leftColumn);
  const [shuffledRightColumn, setShuffledRightColumn] = useState<MatchingItem[]>(rightColumn);

  const { isCorrect, message, level, handleCorrect, handleIncorrect, reset } = useExerciseFeedback(
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
    setMatchedRightIds(new Set());
    setShowIncorrectFlash(false);
    reset();
  }, [leftColumn, rightColumn, finalAnswer, reset]);

  const handleLeftSelect = (item: string, index?: number) => {
    const matchingItem = getUnmatchedLeftItems()[index!];
    if (selectedLeft?.id === matchingItem?.id) {
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(matchingItem);
    setSelectedRight(null);
    reset();
  };

  const handleRightSelect = (item: string, index?: number) => {
    const matchingItem = getUnmatchedRightItems()[index!];
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

        const newMatchedRightIds = new Set(matchedRightIds);
        newMatchedRightIds.add(matchingItem.id);
        setMatchedRightIds(newMatchedRightIds);

        const isLastMatch = Object.keys(newMatches).length === Object.keys(finalAnswer).length;
        handleCorrect(isLastMatch);
        setSelectedLeft(null);
        setSelectedRight(null);

        if (isLastMatch) {
          // Auto-advance logic based on configuration
          if (exercise.feedbackConfig.progressionRules?.autoAdvance !== false) {
            setTimeout(() => {
              onComplete?.();
            }, 1500);
          }
        }
      } else {
        handleIncorrect(undefined, validation.expectedMatch);

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

  const getUnmatchedLeftItems = () => {
    return shuffledLeftColumn.filter(item => !matchedLeftIds.has(item.id));
  };

  const getUnmatchedRightItems = () => {
    return shuffledRightColumn.filter(item => !matchedRightIds.has(item.id));
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

  const getMatchedPairs = () => {
    return Object.entries(matches).map(([leftId, rightId]) => {
      const leftItem = shuffledLeftColumn.find(item => item.id === leftId);
      const rightItem = shuffledRightColumn.find(item => item.id === rightId);
      return { leftItem, rightItem, key: `${leftId}-${rightId}` };
    });
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
      {exercise.instructions && (
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
              items={getUnmatchedLeftItems().map(item => item.value)}
              selectedItem={selectedLeft?.value || null}
              selectedIndex={
                selectedLeft ? getUnmatchedLeftItems().findIndex(item => item.id === selectedLeft.id) : null
              }
              onSelect={handleLeftSelect}
              matches={{}}
              matchType="key"
              label=""
              className={showIncorrectFlash ? 'animate-pulse bg-red-50 border-red-300' : ''}
            />
          </div>

          {/* Right column */}
          <div className="space-y-2">
            <h4 className="font-medium text-gray-700 mb-3">Match with right column:</h4>
            <FieldSelect
              items={getUnmatchedRightItems().map(item => item.value)}
              selectedItem={selectedRight?.value || null}
              selectedIndex={
                selectedRight ? getUnmatchedRightItems().findIndex(item => item.id === selectedRight.id) : null
              }
              onSelect={handleRightSelect}
              matches={{}}
              matchType="value"
              label=""
              className={showIncorrectFlash ? 'animate-pulse bg-red-50 border-red-300' : ''}
            />
          </div>
        </div>

        {/* Selection status */}
        {(selectedLeft || selectedRight) && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm">
              {selectedLeft && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Selected from left:</span> 
                  <SimpleRichDisplay content={selectedLeft.value} />
                </div>
              )}
              {selectedRight && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Selected from right:</span> 
                  <SimpleRichDisplay content={selectedRight.value} />
                </div>
              )}
              {selectedLeft && !selectedRight && (
                <div className="text-blue-600 mt-1">Now select an item from the right column to match.</div>
              )}
            </div>
          </div>
        )}

        {/* Feedback Display */}
        <FeedbackDisplay isCorrect={isCorrect} message={message} level={level} showExplanation={false} />

        {/* Matched pairs */}
        {Object.keys(matches).length > 0 && (
          <div className="mt-8">
            <h4 className="font-medium text-gray-700 mb-4">Correct Matches:</h4>
            <div className="space-y-2">
              <AnimatePresence>
                {getMatchedPairs().map(({ leftItem, rightItem, key }) => (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="font-medium text-green-800">
                      <SimpleRichDisplay content={leftItem?.value || ''} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-green-600" />
                    <div className="font-medium text-green-800">
                      <SimpleRichDisplay content={rightItem?.value || ''} />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchingTable;
