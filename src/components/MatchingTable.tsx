'use client';

import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Check, X, ArrowRight } from 'lucide-react';

interface MatchingTableProps {
  leftColumn: string[];
  rightColumn: string[];
  finalAnswer: Record<string, string>;
  onComplete?: () => void;
}

export const MatchingTable: React.FC<MatchingTableProps> = ({ leftColumn, rightColumn, finalAnswer, onComplete }) => {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [complete, setComplete] = useState(false);

  const handleLeftSelect = (item: string) => {
    // If already matched, don't allow selection
    if (Object.keys(matches).includes(item)) return;

    setSelectedLeft(item);
    setFeedback(null);
  };

  const handleRightSelect = (item: string) => {
    // If already in a match, don't allow selection
    if (Object.values(matches).includes(item)) return;

    setSelectedRight(item);
    setFeedback(null);
  };

  const handleMatch = () => {
    if (!selectedLeft || !selectedRight) return;

    const isCorrect = finalAnswer[selectedLeft] === selectedRight;

    if (isCorrect) {
      // Add to matches
      const newMatches = { ...matches, [selectedLeft]: selectedRight };
      setMatches(newMatches);
      setFeedback('correct');

      // Clear selections
      setSelectedLeft(null);
      setSelectedRight(null);

      // Check if all items are matched correctly
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
    setFeedback(null);
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
          <span>That's not correct. Try again.</span>
        </div>
      );
    }
  };

  return (
    <div className="matching-exercise bg-white p-4 rounded-lg border border-border">
      {/* Feedback area */}
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
          {selectedLeft && selectedRight && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleClearSelection}>
                Clear
              </Button>
              <Button size="sm" onClick={handleMatch}>
                Match
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Matching area */}
      <div className="grid grid-cols-3 gap-4">
        {/* Left column */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-roman-stone mb-2">Latin</h4>
          {leftColumn.map((item, index) => {
            const isMatched = Object.keys(matches).includes(item);

            return (
              <button
                key={`left-${index}`}
                className={`w-full p-3 text-left rounded-md transition-all ${
                  isMatched
                    ? 'bg-roman-green/10 border border-roman-green text-roman-green'
                    : selectedLeft === item
                      ? 'bg-roman-gold/10 border border-roman-gold'
                      : 'bg-white border border-gray-200 hover:border-roman-red/50'
                }`}
                onClick={() => handleLeftSelect(item)}
                disabled={isMatched}>
                {item}
              </button>
            );
          })}
        </div>

        {/* Middle column with arrows */}
        <div className="flex flex-col items-center justify-center">
          {leftColumn.map((_, index) => (
            <div key={`arrow-${index}`} className="h-12 flex items-center">
              {Object.keys(matches).includes(leftColumn[index]) && <ArrowRight className="text-roman-green h-5 w-5" />}
            </div>
          ))}
        </div>

        {/* Right column */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-roman-stone mb-2">English</h4>
          {rightColumn.map((item, index) => {
            const isMatched = Object.values(matches).includes(item);

            return (
              <button
                key={`right-${index}`}
                className={`w-full p-3 text-left rounded-md transition-all ${
                  isMatched
                    ? 'bg-roman-green/10 border border-roman-green text-roman-green'
                    : selectedRight === item
                      ? 'bg-roman-gold/10 border border-roman-gold'
                      : 'bg-white border border-gray-200 hover:border-roman-red/50'
                }`}
                onClick={() => handleRightSelect(item)}
                disabled={isMatched}>
                {item}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MatchingTable;
