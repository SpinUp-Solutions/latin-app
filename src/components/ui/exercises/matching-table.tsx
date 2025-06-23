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

  const handleClearAll = () => {
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatches({});
    setMatchedLeftIds(new Set());
    setMatchedRightIds(new Set());
    setShuffledLeftColumn(leftColumn);
    setShuffledRightColumn(rightColumn);
    reset();
  };

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const handleShuffle = () => {
    setSelectedLeft(null);
    setSelectedRight(null);
    reset();

    // Only shuffle unmatched items
    const unmatchedLeft = shuffledLeftColumn.filter(item => !matchedLeftIds.has(item.id));
    const unmatchedRight = shuffledRightColumn.filter(item => !matchedRightIds.has(item.id));

    const shuffledUnmatchedLeft = shuffleArray(unmatchedLeft);
    const shuffledUnmatchedRight = shuffleArray(unmatchedRight);

    // Rebuild arrays with matched items in their positions and unmatched items shuffled
    const newLeftColumn = shuffledLeftColumn.map(item =>
      matchedLeftIds.has(item.id) ? item : shuffledUnmatchedLeft.shift()!
    );
    const newRightColumn = shuffledRightColumn.map(item =>
      matchedRightIds.has(item.id) ? item : shuffledUnmatchedRight.shift()!
    );

    setShuffledLeftColumn(newLeftColumn);
    setShuffledRightColumn(newRightColumn);
  };

  const getUnmatchedLeftItems = (): MatchingItem[] => shuffledLeftColumn.filter(item => !matchedLeftIds.has(item.id));

  const getUnmatchedRightItems = (): MatchingItem[] =>
    shuffledRightColumn.filter(item => !matchedRightIds.has(item.id));

  const getMatchedPairs = () => {
    return Object.entries(matches).map(([leftId, rightId]) => {
      const leftItem = shuffledLeftColumn.find(item => item.id === leftId);
      const rightItem = shuffledRightColumn.find(item => item.id === rightId);
      return { leftItem, rightItem, key: `${leftId}-${rightId}` };
    });
  };

  return (
    <div className="space-y-6">
      {exercise.title && <h3 className="text-xl font-serif text-roman-red mb-4">{exercise.title}</h3>}
      {exercise.instructions && (
        <div className="p-6 bg-roman-parchment rounded-lg mb-4">
          <p className="whitespace-pre-wrap break-words">{exercise.instructions}</p>
        </div>
      )}

      {/* Progress indicator */}
      <ExerciseProgress current={Object.keys(matches).length} total={Object.keys(finalAnswer).length} label="Match" />

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Controls */}
        <div className="flex gap-2 mb-6">
          <Button onClick={handleClearAll} variant="outline" size="sm" className="flex items-center gap-1">
            <X className="h-4 w-4" />
            Clear All
          </Button>
          <Button onClick={handleShuffle} variant="outline" size="sm" className="flex items-center gap-1">
            <Shuffle className="h-4 w-4" />
            Shuffle
          </Button>
        </div>

        {/* Matching interface */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="space-y-2">
            <FieldSelect
              items={getUnmatchedLeftItems().map(item => item.value)}
              selectedItem={selectedLeft?.value || null}
              selectedIndex={
                selectedLeft ? getUnmatchedLeftItems().findIndex(item => item.id === selectedLeft.id) : null
              }
              onSelect={handleLeftSelect}
              matches={{}}
              matchType="key"
              label="Match these:"
              showIncorrect={showIncorrectFlash}
            />
          </div>

          {/* Center arrow */}
          <div className="flex items-center justify-center">
            <ArrowRight className="h-6 w-6 text-gray-400" />
          </div>

          {/* Right column */}
          <div className="space-y-2">
            <FieldSelect
              items={getUnmatchedRightItems().map(item => item.value)}
              selectedItem={selectedRight?.value || null}
              selectedIndex={
                selectedRight ? getUnmatchedRightItems().findIndex(item => item.id === selectedRight.id) : null
              }
              onSelect={handleRightSelect}
              matches={{}}
              matchType="value"
              label="With these:"
              showIncorrect={showIncorrectFlash}
            />
          </div>
        </div>

        {/* Feedback Display */}
        <FeedbackDisplay isCorrect={isCorrect} message={message} level={level} />

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
                    <span className="font-medium text-green-800">{leftItem?.value}</span>
                    <ArrowRight className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-800">{rightItem?.value}</span>
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
