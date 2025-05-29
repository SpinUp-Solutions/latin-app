'use client';

import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Check, X, ArrowRight, Shuffle } from 'lucide-react';
import FieldSelect from '../core/field-select';

interface MatchingTableProps {
  leftColumn: string[];
  rightColumn: string[];
  finalAnswer: Record<string, string>;
  onComplete?: () => void;
}

export const MatchingTable: React.FC<MatchingTableProps> = ({ leftColumn, rightColumn, finalAnswer, onComplete }) => {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [selectedRightIndex, setSelectedRightIndex] = useState<number | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [matchedRightIndices, setMatchedRightIndices] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [complete, setComplete] = useState(false);

  // Add state for shuffled arrays
  const [shuffledLeftColumn, setShuffledLeftColumn] = useState<string[]>(leftColumn);
  const [shuffledRightColumn, setShuffledRightColumn] = useState<string[]>(rightColumn);

  const handleLeftSelect = (item: string) => {
    setSelectedLeft(item);
    setFeedback(null);
  };

  const handleRightSelect = (item: string, index?: number) => {
    setSelectedRight(item);
    setSelectedRightIndex(index ?? null);
    setFeedback(null);
  };

  const handleMatch = () => {
    if (!selectedLeft || !selectedRight || selectedRightIndex === null) return;

    const isCorrect = finalAnswer[selectedLeft] === selectedRight;

    if (isCorrect) {
      // Add to matches
      const newMatches = { ...matches, [selectedLeft]: selectedRight };
      setMatches(newMatches);

      const newMatchedRightIndices = new Set(matchedRightIndices);
      newMatchedRightIndices.add(selectedRightIndex);
      setMatchedRightIndices(newMatchedRightIndices);

      setFeedback('correct');

      setSelectedLeft(null);
      setSelectedRight(null);
      setSelectedRightIndex(null);

      if (Object.keys(newMatches).length === Object.keys(finalAnswer).length) {
        setComplete(true);
        onComplete?.();
      }
    } else {
      setFeedback('incorrect');
    }
  };

  const handleClearSelection = () => {
    setSelectedLeft(null);
    setSelectedRight(null);
    setSelectedRightIndex(null);
    setFeedback(null);
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
    setSelectedRightIndex(null);
    setFeedback(null);

    // Get unmatched items from left column
    const unmatchedLeftItems = shuffledLeftColumn.filter(item => !Object.keys(matches).includes(item));

    const unmatchedRightItems = shuffledRightColumn.filter((item, index) => !matchedRightIndices.has(index));

    const shuffledUnmatchedLeft = shuffleArray(unmatchedLeftItems);
    const shuffledUnmatchedRight = shuffleArray(unmatchedRightItems);

    const newLeftColumn = [...shuffledLeftColumn];
    const newRightColumn = [...shuffledRightColumn];

    // Replace unmatched items with shuffled versions
    let unmatchedLeftIndex = 0;
    let unmatchedRightIndex = 0;

    for (let i = 0; i < newLeftColumn.length; i++) {
      if (!Object.keys(matches).includes(newLeftColumn[i])) {
        newLeftColumn[i] = shuffledUnmatchedLeft[unmatchedLeftIndex];
        unmatchedLeftIndex++;
      }
    }

    for (let i = 0; i < newRightColumn.length; i++) {
      if (!matchedRightIndices.has(i)) {
        newRightColumn[i] = shuffledUnmatchedRight[unmatchedRightIndex];
        unmatchedRightIndex++;
      }
    }

    setShuffledLeftColumn(newLeftColumn);
    setShuffledRightColumn(newRightColumn);
  };

  const renderFeedback = () => {
    if (!feedback) return null;

    if (feedback === 'correct') {
      return (
        <div className="flex items-center text-roman-green mb-4">
          <Check className="h-5 w-5 mr-1" />
          <span>Correct match!</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-roman-red mb-4">
          <X className="h-5 w-5 mr-1" />
          <span>That&apos;s not correct. Try again.</span>
        </div>
      );
    }
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
            {!complete && (
              <Button size="sm" variant="outline" onClick={handleShuffle}>
                <Shuffle className="h-4 w-4 mr-2" />
                Shuffle
              </Button>
            )}
            {selectedLeft && selectedRight && (
              <>
                <Button size="sm" variant="outline" onClick={handleClearSelection}>
                  Clear
                </Button>
                <Button size="sm" onClick={handleMatch}>
                  Match
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <FieldSelect
          items={shuffledLeftColumn}
          selectedItem={selectedLeft}
          onSelect={handleLeftSelect}
          matches={matches}
          matchType="key"
          label="Latin"
        />

        {/* Middle column with arrows */}
        <div className="flex flex-col items-center justify-center">
          {shuffledLeftColumn.map((_, index) => (
            <div key={`arrow-${index}`} className="h-12 flex items-center">
              {Object.keys(matches).includes(shuffledLeftColumn[index]) && (
                <ArrowRight className="text-roman-green h-5 w-5" />
              )}
            </div>
          ))}
        </div>

        {/* Right column */}
        <FieldSelect
          items={shuffledRightColumn}
          selectedItem={selectedRight}
          selectedIndex={selectedRightIndex}
          onSelect={handleRightSelect}
          matches={matches}
          matchType="value"
          label="English"
          matchedIndices={matchedRightIndices}
        />
      </div>
    </div>
  );
};

export default MatchingTable;
