'use client';

import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Check, X, ArrowRight } from 'lucide-react';
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
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [complete, setComplete] = useState(false);

  const handleLeftSelect = (item: string) => {
    setSelectedLeft(item);
    setFeedback(null);
  };

  const handleRightSelect = (item: string) => {
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
        <FieldSelect
          items={leftColumn}
          selectedItem={selectedLeft}
          onSelect={handleLeftSelect}
          matches={matches}
          matchType="key"
          label="Latin"
        />

        {/* Middle column with arrows */}
        <div className="flex flex-col items-center justify-center">
          {leftColumn.map((_, index) => (
            <div key={`arrow-${index}`} className="h-12 flex items-center">
              {Object.keys(matches).includes(leftColumn[index]) && <ArrowRight className="text-roman-green h-5 w-5" />}
            </div>
          ))}
        </div>

        {/* Right column */}
        <FieldSelect
          items={rightColumn}
          selectedItem={selectedRight}
          onSelect={handleRightSelect}
          matches={matches}
          matchType="value"
          label="English"
        />
      </div>
    </div>
  );
};

export default MatchingTable;
