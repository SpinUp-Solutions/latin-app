'use client';

import React, { useState, useEffect } from 'react';
import { TableFillExercise } from '@/src/types/exercise';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { FeedbackDisplay } from '../feedback';
import { validateTableFillExercise } from '@/src/utils/exercises/tableFillExercise';
import { Button } from '@/src/components/ui/button';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableRow,
  RomanTableHead,
  RomanTableCell,
} from '../core/roman-table';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

interface Props {
  exercise: TableFillExercise;
  onComplete?: (score: number) => void;
}

const TableFillExerciseComponent: React.FC<Props> = ({ exercise, onComplete }) => {
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cellResults, setCellResults] = useState<Record<string, boolean>>({});

  const {
    isCorrect,
    message,
    level,
    showExplanation,
    handleCorrect,
    handleIncorrect,
    reset,
    shouldResetExercise,
    resetExercise,
  } = useExerciseFeedback(exercise.feedbackConfig);

  useEffect(() => {
    if (shouldResetExercise) {
      toast.info('Too many mistakes. Starting over...');
      setUserAnswers({});
      setHasSubmitted(false);
      setCellResults({});
      setIsProcessing(false);
      resetExercise();
    }
  }, [shouldResetExercise, resetExercise]);

  const handleInputChange = (cellKey: string, value: string) => {
    if (hasSubmitted || isProcessing) return;
    setUserAnswers(prev => ({ ...prev, [cellKey]: value }));
    if (isCorrect !== null) {
      reset();
    }
  };

  const handleSubmit = () => {
    if (isProcessing) return;

    setIsProcessing(true);
    setHasSubmitted(true);

    const validation = validateTableFillExercise(userAnswers, exercise);
    setCellResults(validation.cellResults);

    if (validation.isCorrect) {
      handleCorrect();
      const score = Math.round((validation.correctAnswers / validation.totalBlanks) * 100);
      onComplete?.(score);
    } else {
      handleIncorrect();
    }

    setIsProcessing(false);
  };

  const handleReset = () => {
    setUserAnswers({});
    setHasSubmitted(false);
    setCellResults({});
  };

  const getCellClassName = (cellKey: string, isBlank: boolean) => {
    if (!isBlank) return '';

    if (hasSubmitted && cellKey in cellResults) {
      return cellResults[cellKey] ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300';
    }

    return 'bg-blue-50';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        {exercise.title && (
          <h3 className="text-lg font-serif text-roman-red mb-2">
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
        <div className="p-4 bg-roman-parchment rounded-lg mb-4">
          <SimpleRichDisplay content={exercise.instructions} />
        </div>
      )}

      <div className="p-6 bg-white rounded-lg border border-gray-200">
        {exercise.data.title && (
          <h4 className="text-lg font-serif text-roman-red mb-4">
            <SimpleRichDisplay content={exercise.data.title} />
          </h4>
        )}

        <RomanTable>
          <RomanTableHeader>
            <RomanTableRow>
              {exercise.data.columns.map(column => (
                <RomanTableHead key={column.id} className={column.className}>
                  <SimpleRichDisplay content={column.header} />
                </RomanTableHead>
              ))}
            </RomanTableRow>
          </RomanTableHeader>
          <RomanTableBody>
            {exercise.data.rows.map(row => (
              <RomanTableRow key={row.id}>
                {exercise.data.columns.map(column => {
                  const cell = row.cells[column.id];
                  const cellKey = `${row.id}-${column.id}`;

                  return (
                    <RomanTableCell
                      key={cellKey}
                      className={cn(column.className, getCellClassName(cellKey, cell?.isBlank || false))}>
                      {cell?.isBlank ? (
                        <textarea
                          value={userAnswers[cellKey] || ''}
                          onChange={e => handleInputChange(cellKey, e.target.value)}
                          disabled={hasSubmitted || isProcessing}
                          placeholder="Enter answer..."
                          className={cn(
                            'w-full min-h-[2rem] p-2 border rounded resize-none bg-transparent',
                            'focus:outline-none focus:ring-2 focus:ring-roman-red focus:border-transparent',
                            (hasSubmitted || isProcessing) && 'cursor-not-allowed opacity-60'
                          )}
                          rows={1}
                        />
                      ) : (
                        <SimpleRichDisplay content={cell?.content || ''} />
                      )}
                    </RomanTableCell>
                  );
                })}
              </RomanTableRow>
            ))}
          </RomanTableBody>
          {exercise.data.footnotes && exercise.data.footnotes.length > 0 && (
            <RomanTableBody>
              <RomanTableRow>
                <RomanTableCell colSpan={exercise.data.columns.length}>
                  <div className="text-sm text-roman-stone space-y-1 pt-2">
                    {exercise.data.footnotes.map((footnote, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <span className="text-roman-terracotta font-serif">{index + 1}.</span>
                        <span className="font-serif">
                          <SimpleRichDisplay content={footnote} />
                        </span>
                      </div>
                    ))}
                  </div>
                </RomanTableCell>
              </RomanTableRow>
            </RomanTableBody>
          )}
        </RomanTable>

        <div className="mt-6 flex justify-center gap-4">
          {!hasSubmitted && (
            <Button onClick={handleSubmit} disabled={isProcessing} className="px-8">
              {isProcessing ? 'Checking...' : 'Submit Answers'}
            </Button>
          )}

          {hasSubmitted && isCorrect === false && (
            <Button onClick={handleReset} variant="outline" disabled={isProcessing} className="px-8">
              Try Again
            </Button>
          )}
        </div>

        <FeedbackDisplay
          isCorrect={isCorrect}
          message={message}
          level={level}
          hint={exercise.data.hint}
          explanation={exercise.data.explanation}
          showExplanation={showExplanation}
        />
      </div>
    </div>
  );
};

export default TableFillExerciseComponent;
