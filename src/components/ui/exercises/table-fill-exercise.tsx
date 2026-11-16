'use client';

import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { TableFillExercise } from '@/src/types/exercise';
import type { TableFillColumn, TableFillRow } from '@/src/types/exercises/table-fill';
import { richTextToPlainText } from '@/src/utils/exercises/helpers';
import { useSingleAnswerExercise } from '@/src/hooks/useSingleAnswerExercise';
import { FeedbackDisplay } from '../feedback';
import { validateTableFillExercise } from '@/src/utils/exercises/tableFillExercise';
import { Button } from '@/src/components/ui/button';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { ExerciseIntro } from './exercise-intro';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableRow,
  RomanTableHead,
  RomanTableCell,
} from '../core/roman-table';
import { cn } from '@/src/lib/utils';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';

interface Props {
  exercise: TableFillExercise;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
}

const TableFillExerciseComponent: React.FC<Props> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
}) => {
  const restoredAnswers = initialAnswer?.type === 'table-fill' ? initialAnswer.answers : {};
  const requiredCellKeys = exercise.data.rows.flatMap(row =>
    exercise.data.columns.flatMap(column => (row.cells[column.id]?.isBlank ? [`${row.id}-${column.id}`] : []))
  );
  const hasAllRequiredAnswers = (answers: Record<string, string>) =>
    requiredCellKeys.length > 0 && requiredCellKeys.every(cellKey => Boolean(answers[cellKey]?.trim()));
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>(restoredAnswers);
  const [cellResults, setCellResults] = useState<Record<string, boolean>>({});
  // Answers revealed by a Show Answer feedback level stay visible while the student corrects the missed cells.
  const [answersStayRevealed, setAnswersStayRevealed] = useState(false);
  const {
    testAnswerMode,
    hasSubmitted,
    isProcessing,
    resetRequired,
    isCorrect,
    message,
    level,
    showExplanation,
    clearFeedback,
    isAwaitingConfirmation,
    confirmAdvance,
    submit,
    tryAgain,
    startOver,
  } = useSingleAnswerExercise({
    exercise,
    runtimeMode,
    initiallySubmitted: hasAllRequiredAnswers(restoredAnswers),
    onAnswer,
    onComplete,
    onCompletionAccepted,
  });

  const handleExerciseReset = () => {
    startOver();
    setUserAnswers({});
    setCellResults({});
    setAnswersStayRevealed(false);
  };

  const handleInputChange = (cellKey: string, value: string) => {
    if (isLocked(cellKey)) return;
    setUserAnswers(prev => ({ ...prev, [cellKey]: value }));
    if (testAnswerMode) onAnswer?.({ type: 'table-fill', answers: { ...userAnswers, [cellKey]: value } });
    if (isCorrect !== null) {
      clearFeedback();
    }
  };

  const handleSubmit = () => {
    if (isProcessing || !hasAllRequiredAnswers(userAnswers) || resetRequired) return;
    setAnswersStayRevealed(false);
    submit({ type: 'table-fill', answers: userAnswers }, () => {
      const validation = validateTableFillExercise(userAnswers, exercise);
      setCellResults(validation.cellResults);
      return validation.isCorrect;
    });
  };

  /** Keeps the cells the student got right, so a retry only asks for the missed ones again. */
  const handleReset = () => {
    setUserAnswers(prev => Object.fromEntries(Object.entries(prev).filter(([cellKey]) => cellResults[cellKey])));
    setAnswersStayRevealed(Boolean(level?.showAnswer));
    tryAgain();
  };

  // A cell graded correct stays marked and locked through later attempts; a miss is marked until Try Again.
  const isMarkedCorrect = (cellKey: string) => !testAnswerMode && cellResults[cellKey] === true;
  const isMarkedIncorrect = (cellKey: string) => !testAnswerMode && hasSubmitted && cellResults[cellKey] === false;
  const isLocked = (cellKey: string) => hasSubmitted || isProcessing || resetRequired || isMarkedCorrect(cellKey);
  const answersAreRevealed =
    !testAnswerMode && (answersStayRevealed || (hasSubmitted && isCorrect === false && Boolean(level?.showAnswer)));
  const revealsAnswer = (cellKey: string) => answersAreRevealed && cellResults[cellKey] === false;
  const gradedCount = Object.keys(cellResults).length;
  const correctCount = Object.values(cellResults).filter(Boolean).length;
  const cellLabel = (row: TableFillRow, column: TableFillColumn) => {
    const rowHeader = row.cells[exercise.data.columns[0]?.id];
    const rowName = rowHeader && !rowHeader.isBlank ? richTextToPlainText(rowHeader.content) : '';
    return [rowName, richTextToPlainText(column.header)].filter(Boolean).join(', ') || 'Answer';
  };

  const getCellClassName = (cellKey: string, isBlank: boolean) => {
    if (!isBlank) return '';

    if (isMarkedCorrect(cellKey)) return 'bg-green-50 border-green-300';
    if (isMarkedIncorrect(cellKey)) return 'bg-red-50 border-red-300';

    return 'bg-blue-50';
  };

  return (
    <div className="space-y-4">
      <ExerciseIntro title={exercise.title} audioPath={exercise.audioPath} instructions={exercise.instructions} />

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
                      className={cn('relative', column.className, getCellClassName(cellKey, cell?.isBlank || false))}>
                      {cell?.isBlank ? (
                        <>
                          <textarea
                            value={userAnswers[cellKey] || ''}
                            onChange={e => handleInputChange(cellKey, e.target.value)}
                            // Read-only rather than disabled: a graded answer stays at full contrast to compare.
                            readOnly={isLocked(cellKey)}
                            disabled={isProcessing || resetRequired}
                            placeholder={isLocked(cellKey) ? undefined : 'Enter answer...'}
                            aria-label={cellLabel(row, column)}
                            aria-invalid={isMarkedIncorrect(cellKey) ? true : undefined}
                            className={cn(
                              'w-full min-w-[5rem] min-h-[2rem] p-2 border rounded resize-none bg-transparent',
                              'focus:outline-none focus:ring-2 focus:ring-roman-red focus:border-transparent',
                              isLocked(cellKey) && 'cursor-default',
                              (isProcessing || resetRequired) && 'cursor-not-allowed opacity-60'
                            )}
                            rows={1}
                          />
                          {/* Shape and text mark the result, so it does not depend on telling red from green. */}
                          {isMarkedCorrect(cellKey) && (
                            <span className="absolute top-0.5 right-0.5 text-green-700" title="Correct">
                              <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                              <span className="sr-only">Correct</span>
                            </span>
                          )}
                          {isMarkedIncorrect(cellKey) && (
                            <span className="absolute top-0.5 right-0.5 text-red-700" title="Incorrect">
                              <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                              <span className="sr-only">Incorrect</span>
                            </span>
                          )}
                          {revealsAnswer(cellKey) && cell.answer && (
                            <p className="mt-1 rounded border border-gray-400 bg-white px-2 py-1 text-sm font-semibold text-gray-900">
                              <span className="sr-only">Correct answer: </span>
                              {cell.answer}
                            </p>
                          )}
                        </>
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

        {!testAnswerMode && hasSubmitted && isCorrect === false && gradedCount > 0 && (
          <p role="status" className="mt-4 text-center text-sm text-roman-stone">
            <span className="font-semibold">
              {correctCount} of {gradedCount} correct.
            </span>{' '}
            {answersAreRevealed
              ? 'Each cell marked ✗ shows the correct answer beneath it.'
              : 'Cells marked ✗ need another look.'}
          </p>
        )}
        {!testAnswerMode && !hasSubmitted && answersStayRevealed && (
          <p className="mt-4 text-center text-sm text-roman-stone">
            The correct answers are shown beneath the cells you missed. Fill those in and submit again.
          </p>
        )}

        <div className="mt-6 flex justify-center gap-4">
          {!hasSubmitted && !resetRequired && (
            <Button
              onClick={handleSubmit}
              disabled={isProcessing || !hasAllRequiredAnswers(userAnswers)}
              className="px-8">
              {isProcessing ? 'Checking...' : 'Submit Answers'}
            </Button>
          )}

          {hasSubmitted && isCorrect === false && !testAnswerMode && !resetRequired && (
            <Button onClick={handleReset} variant="outline" disabled={isProcessing} className="px-8">
              Try Again
            </Button>
          )}
        </div>

        {!testAnswerMode && (
          <FeedbackDisplay
            isCorrect={isCorrect}
            message={message}
            level={level}
            hint={exercise.data.hint}
            explanation={exercise.data.explanation}
            showExplanation={showExplanation}
            onContinue={isCorrect && isAwaitingConfirmation ? confirmAdvance : undefined}
            onStartOver={resetRequired ? handleExerciseReset : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default TableFillExerciseComponent;
