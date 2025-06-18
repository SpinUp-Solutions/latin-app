import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/src/components/ui/button';
import { X, ArrowRight, Shuffle } from 'lucide-react';
import FieldSelect from '../core/field-select';

interface MatchingItem {
  id: string;
  value: string;
}

interface MatchingTableProps {
  leftColumn: MatchingItem[];
  rightColumn: MatchingItem[];
  finalAnswer: Record<string, string>; // leftId -> rightId
  onComplete?: () => void;
}

export const MatchingTable: React.FC<MatchingTableProps> = ({ leftColumn, rightColumn, finalAnswer, onComplete }) => {
  const [selectedLeft, setSelectedLeft] = useState<MatchingItem | null>(null);
  const [selectedRight, setSelectedRight] = useState<MatchingItem | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({}); // leftId -> rightId
  const [matchedLeftIds, setMatchedLeftIds] = useState<Set<string>>(new Set());
  const [matchedRightIds, setMatchedRightIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [showIncorrectFlash, setShowIncorrectFlash] = useState(false);
  const [complete, setComplete] = useState(false);

  const [shuffledLeftColumn, setShuffledLeftColumn] = useState<MatchingItem[]>(leftColumn);
  const [shuffledRightColumn, setShuffledRightColumn] = useState<MatchingItem[]>(rightColumn);

  // this is for the live preview :/
  useEffect(() => {
    setShuffledLeftColumn(leftColumn);
    setShuffledRightColumn(rightColumn);
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatches({});
    setMatchedLeftIds(new Set());
    setMatchedRightIds(new Set());
    setFeedback(null);
    setShowIncorrectFlash(false);
    setComplete(false);
  }, [leftColumn, rightColumn, finalAnswer]);

  const handleLeftSelect = (item: string, index?: number) => {
    const matchingItem = getUnmatchedLeftItems()[index!];
    if (selectedLeft?.id === matchingItem?.id) {
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(matchingItem);
    setSelectedRight(null);
    setFeedback(null);
  };

  const handleRightSelect = (item: string, index?: number) => {
    const matchingItem = getUnmatchedRightItems()[index!];
    if (selectedRight?.id === matchingItem?.id) {
      setSelectedRight(null);
      return;
    }
    setSelectedRight(matchingItem);
    setFeedback(null);

    // Auto-match if left item is already selected
    if (selectedLeft && matchingItem) {
      // Get the expected right item value for this left item
      const expectedRightId = finalAnswer[selectedLeft.id];
      const expectedRightItem = rightColumn.find(item => item.id === expectedRightId);
      const expectedValue = expectedRightItem?.value;

      // Check if the selected right item's value matches the expected value
      const isCorrect = expectedValue && matchingItem.value === expectedValue;

      if (isCorrect) {
        const newMatches = { ...matches, [selectedLeft.id]: matchingItem.id };
        setMatches(newMatches);

        const newMatchedLeftIds = new Set(matchedLeftIds);
        newMatchedLeftIds.add(selectedLeft.id);
        setMatchedLeftIds(newMatchedLeftIds);

        const newMatchedRightIds = new Set(matchedRightIds);
        newMatchedRightIds.add(matchingItem.id);
        setMatchedRightIds(newMatchedRightIds);

        setFeedback('correct');
        setSelectedLeft(null);
        setSelectedRight(null);

        if (Object.keys(newMatches).length === Object.keys(finalAnswer).length) {
          setComplete(true);
          onComplete?.();
        }
      } else {
        setFeedback('incorrect');
        setShowIncorrectFlash(true);

        // Clear selections after showing red flash
        setTimeout(() => {
          setSelectedLeft(null);
          setSelectedRight(null);
          setFeedback(null);
          setShowIncorrectFlash(false);
        }, 1000);
      }
    }
  };

  const handleClearAll = () => {
    setSelectedLeft(null);
    setSelectedRight(null);
    setFeedback(null);
    setMatches({});
    setMatchedLeftIds(new Set());
    setMatchedRightIds(new Set());
    setComplete(false);
    setShuffledLeftColumn(leftColumn);
    setShuffledRightColumn(rightColumn);
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
    setFeedback(null);

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

  const renderFeedback = () => {
    // No text feedback anymore - using visual feedback instead
    return null;
  };

  const getMatchedPairs = () => {
    return Object.entries(matches).map(([leftId, rightId]) => {
      const leftItem = shuffledLeftColumn.find(item => item.id === leftId);
      const rightItem = shuffledRightColumn.find(item => item.id === rightId);
      return { leftItem, rightItem, key: `${leftId}-${rightId}` };
    });
  };

  return (
    <div className="matching-exercise bg-white p-4 rounded-lg border border-border">
      {renderFeedback()}
      {complete ? (
        <div className="p-4 bg-roman-green/10 rounded-lg border border-roman-green text-center mb-4">
          <p className="text-roman-green font-medium">Great job! All matches are correct.</p>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-roman-stone">
            Matched: {Object.keys(matches).length}/{Object.keys(finalAnswer).length}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleShuffle}>
              <Shuffle className="h-4 w-4 mr-2" />
              Shuffle
            </Button>
            <Button size="sm" variant="outline" onClick={handleClearAll}>
              <X className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4">
          <FieldSelect
            items={getUnmatchedLeftItems().map(item => item.value)}
            selectedItem={selectedLeft?.value || null}
            selectedIndex={selectedLeft ? getUnmatchedLeftItems().findIndex(item => item.id === selectedLeft.id) : null}
            onSelect={handleLeftSelect}
            matches={{}}
            matchType="key"
            label="Latin"
          />
        </div>

        <div className="col-span-4 flex flex-col items-center justify-start min-h-[200px] p-4">
          <AnimatePresence initial={false}>
            {getMatchedPairs().map(({ leftItem, rightItem, key }) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, scale: 0.8, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                transition={{ duration: 0.3 }}
                className="w-full mb-3 last:mb-0"
                layout>
                <motion.div
                  layout
                  className="flex items-center justify-between p-4 rounded-lg bg-roman-green/10 border border-roman-green text-roman-green shadow-sm">
                  <div
                    className="flex-1 text-left font-medium pr-2 overflow-hidden whitespace-nowrap"
                    style={{ maskImage: 'linear-gradient(to right, black 70%, transparent 100%)' }}>
                    {leftItem?.value}
                  </div>
                  <ArrowRight className="mx-2 h-5 w-5 flex-shrink-0" />
                  <div
                    className="flex-1 text-right font-medium pl-2 overflow-hidden whitespace-nowrap"
                    style={{ maskImage: 'linear-gradient(to right, black 70%, transparent 100%)' }}>
                    {rightItem?.value}
                  </div>
                </motion.div>
              </motion.div>
            ))}

            {/* Show incorrect match temporarily */}
            {showIncorrectFlash && selectedLeft && selectedRight && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                transition={{ duration: 0.2 }}
                className="w-full mb-3">
                <motion.div
                  animate={{
                    backgroundColor: ['rgb(239 68 68 / 0.1)', 'rgb(239 68 68 / 0.2)', 'rgb(239 68 68 / 0.1)'],
                    borderColor: ['rgb(239 68 68)', 'rgb(220 38 38)', 'rgb(239 68 68)'],
                  }}
                  transition={{ duration: 0.5, repeat: 1 }}
                  className="flex items-center justify-between p-4 rounded-lg border text-red-600 shadow-sm">
                  <div
                    className="flex-1 text-left font-medium pr-2 overflow-hidden whitespace-nowrap"
                    style={{ maskImage: 'linear-gradient(to right, black 70%, transparent 100%)' }}>
                    {selectedLeft.value}
                  </div>
                  <ArrowRight className="mx-2 h-5 w-5 flex-shrink-0" />
                  <div
                    className="flex-1 text-right font-medium pl-2 overflow-hidden whitespace-nowrap"
                    style={{ maskImage: 'linear-gradient(to left, black 70%, transparent 100%)' }}>
                    {selectedRight.value}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="col-span-4">
          <FieldSelect
            items={getUnmatchedRightItems().map(item => item.value)}
            selectedItem={selectedRight?.value || null}
            selectedIndex={
              selectedRight ? getUnmatchedRightItems().findIndex(item => item.id === selectedRight.id) : null
            }
            onSelect={handleRightSelect}
            matches={{}}
            matchType="value"
            label="English"
          />
        </div>
      </div>
    </div>
  );
};

export default MatchingTable;
