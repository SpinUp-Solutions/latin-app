'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { SentenceDiagramSurface } from '@/src/features/sentence-diagramming';
import { SentenceDiagramFeedbackView } from '@/src/features/sentence-diagramming';
import { formatScorePoints } from '@/src/lib/tests/formatting';
import { cn } from '@/src/lib/utils';
import type { ReviewPartPoints, TestResultReviewExerciseItem } from '@/src/types/test-results';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';

type ExerciseOfType<T extends TestResultReviewExerciseItem['type']> = Extract<
  TestResultReviewExerciseItem,
  { type: T }
>;

const PartPoints = ({ points }: { points: ReviewPartPoints }) => (
  <span className="text-xs tabular-nums text-slate-500">
    {formatScorePoints(points.awardedPoints)} / {formatScorePoints(points.maxPoints)} points
  </span>
);

export const CorrectBadge = ({ correct, points }: { correct: boolean; points?: ReviewPartPoints }) => {
  const partlyCorrect = !correct && Boolean(points && points.awardedPoints > 0);
  const label = correct ? 'Correct' : partlyCorrect ? 'Partly correct' : 'Incorrect';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        correct
          ? 'bg-emerald-100 text-emerald-800'
          : partlyCorrect
            ? 'bg-amber-100 text-amber-800'
            : 'bg-rose-100 text-rose-800'
      )}>
      {correct ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
};

const ReviewBlock = ({
  label,
  tone = 'neutral',
  children,
  className,
}: {
  label?: string;
  tone?: 'neutral' | 'student' | 'answer' | 'explanation' | 'feedback';
  children: React.ReactNode;
  className?: string;
}) => {
  const surface =
    tone === 'student'
      ? 'border-sky-200 bg-sky-50/60'
      : tone === 'answer'
        ? 'border-emerald-200 bg-emerald-50/60'
        : tone === 'explanation'
          ? 'border-amber-200 bg-amber-50/60'
          : tone === 'feedback'
            ? 'border-violet-200 bg-violet-50/60'
            : 'border-slate-200 bg-white';
  return (
    <div className={cn('rounded-xl border px-4 py-3', surface, className)}>
      {label ? (
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      ) : null}
      {children}
    </div>
  );
};

const RichValue = ({ value, className }: { value: string; className?: string }) => (
  <div className={cn('text-sm text-slate-800', className)}>
    <SimpleRichDisplay content={value} />
  </div>
);

const PlainValue = ({ value, className }: { value: string; className?: string }) => (
  <p className={cn('whitespace-pre-wrap break-words text-sm text-slate-800', className)}>{value}</p>
);

const EmptyAnswer = () => <span className="text-sm italic text-slate-400">No answer was recorded.</span>;

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export const MatchingExerciseReview = ({ item }: { item: ExerciseOfType<'matching'> }) => {
  const { answerKey, itemResults, studentAnswer } = item;
  const hasAnswer = studentAnswer !== null;
  return (
    <div className="space-y-4">
      {itemResults.rounds.length === 0 && hasAnswer ? <EmptyAnswer /> : null}
      {itemResults.rounds.map((round, roundIndex) => (
        <ReviewBlock
          key={roundIndex}
          label={itemResults.rounds.length > 1 ? `Your matches — round ${roundIndex + 1}` : 'Your matches'}
          tone="student">
          <ul className="space-y-1.5">
            {answerKey.pairs.map(pair => {
              const selection = round[pair.leftId];
              const rightValue = item.question.rightColumn.find(right => right.id === selection?.rightId)?.value ?? '—';
              const correct = selection?.correct ?? false;
              return (
                <li key={pair.leftId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-900">
                    <SimpleRichDisplay content={pair.leftValue} />
                  </span>
                  <span aria-hidden="true">↔</span>
                  <span className={cn(!selection && 'italic text-slate-400')}>
                    <SimpleRichDisplay content={rightValue} />
                  </span>
                  {selection?.rightId ? (
                    <CorrectBadge correct={correct} points={selection.points} />
                  ) : (
                    <Badge variant="outline">No match</Badge>
                  )}
                  {selection ? <PartPoints points={selection.points} /> : null}
                </li>
              );
            })}
          </ul>
        </ReviewBlock>
      ))}
      {!hasAnswer ? (
        <ReviewBlock label="No answer" tone="student">
          <EmptyAnswer />
        </ReviewBlock>
      ) : null}
      <ReviewBlock label="Correct matches" tone="answer">
        <ul className="space-y-1.5">
          {answerKey.pairs.map(pair => (
            <li key={pair.leftId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-slate-900">
                <SimpleRichDisplay content={pair.leftValue} />
              </span>
              <span aria-hidden="true">↔</span>
              <span>
                <SimpleRichDisplay content={pair.rightValue} />
              </span>
            </li>
          ))}
        </ul>
      </ReviewBlock>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Fill in the blank
// ---------------------------------------------------------------------------

export const FillExerciseReview = ({ item }: { item: ExerciseOfType<'fill'> }) => {
  return (
    <div className="space-y-4">
      {item.answerKey.items.map((keyItem, index) => {
        const result = item.itemResults.answers[index];
        return (
          <ReviewBlock key={index} label={`Blank ${index + 1}`}>
            <div className="space-y-2">
              <RichValue value={keyItem.text} className="font-medium" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Your answer:</span>
                <span className={cn('font-medium', !result.value.trim() && 'italic text-slate-400')}>
                  {result.value.trim() || 'No answer'}
                </span>
                <CorrectBadge correct={result.correct} points={result.points} />
                <PartPoints points={result.points} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">
                  Accepted {keyItem.acceptedAnswers.length > 1 ? 'answers' : 'answer'}:
                </span>
                <span className="font-semibold text-emerald-800">{keyItem.acceptedAnswers.join(' or ')}</span>
              </div>
              {keyItem.explanation ? (
                <ReviewBlock label="Explanation" tone="explanation">
                  <RichValue value={keyItem.explanation} />
                </ReviewBlock>
              ) : null}
            </div>
          </ReviewBlock>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Multiple choice
// ---------------------------------------------------------------------------

export const MultipleChoiceExerciseReview = ({ item }: { item: ExerciseOfType<'multiple-choice'> }) => {
  const selectedIds = new Set(item.itemResults.selectedOptionIds);
  return (
    <div className="space-y-4">
      <RichValue value={item.question.question} className="font-medium" />
      <ReviewBlock label="Options" tone="student">
        <ul className="space-y-1.5">
          {item.answerKey.options.map(option => {
            const selected = selectedIds.has(option.id);
            return (
              <li
                key={option.id}
                className={cn(
                  'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                  option.isCorrect
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : selected
                      ? 'border-rose-200 bg-rose-50/70'
                      : 'border-slate-100'
                )}>
                <span className="min-w-0 flex-1">
                  <SimpleRichDisplay content={option.text} />
                </span>
                {option.isCorrect ? <CorrectBadge correct={true} /> : null}
                {selected ? <Badge variant="outline">Your choice</Badge> : null}
              </li>
            );
          })}
        </ul>
      </ReviewBlock>
      <ReviewBlock label="Result" tone="student">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-700">
            {selectedIds.size > 0 ? 'Your answer is marked above.' : 'No answer was recorded.'}
          </span>
          <CorrectBadge correct={item.itemResults.correct} points={item.itemResults.points} />
          <PartPoints points={item.itemResults.points} />
        </div>
      </ReviewBlock>
      {item.explanation ? (
        <ReviewBlock label="Explanation" tone="explanation">
          <RichValue value={item.explanation} />
        </ReviewBlock>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Odd one out
// ---------------------------------------------------------------------------

export const OddOneOutExerciseReview = ({ item }: { item: ExerciseOfType<'odd-one-out'> }) => {
  return (
    <div className="space-y-4">
      <RichValue value={item.question.question} className="font-medium" />
      <ReviewBlock label="Items" tone="student">
        <ul className="space-y-1.5">
          {item.answerKey.items.map(entry => {
            const selected = item.itemResults.selectedItemId === entry.id;
            return (
              <li
                key={entry.id}
                className={cn(
                  'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                  entry.isOddOneOut
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : selected
                      ? 'border-rose-200 bg-rose-50/70'
                      : 'border-slate-100'
                )}>
                <span className="min-w-0 flex-1">
                  <SimpleRichDisplay content={entry.text} />
                </span>
                {entry.isOddOneOut ? <CorrectBadge correct={true} /> : null}
                {selected ? <Badge variant="outline">Your choice</Badge> : null}
              </li>
            );
          })}
        </ul>
      </ReviewBlock>
      {item.question.requireExplanation ? (
        <ReviewBlock label="Your explanation" tone="student">
          {item.itemResults.explanation.trim() ? <PlainValue value={item.itemResults.explanation} /> : <EmptyAnswer />}
        </ReviewBlock>
      ) : null}
      <ReviewBlock label="Result" tone="student">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-700">
            {item.itemResults.selectedItemId ? 'Your choice is marked above.' : 'No answer was recorded.'}
          </span>
          <CorrectBadge correct={item.itemResults.correct} points={item.itemResults.points} />
          <PartPoints points={item.itemResults.points} />
        </div>
      </ReviewBlock>
      {item.explanation ? (
        <ReviewBlock label="Explanation" tone="explanation">
          <RichValue value={item.explanation} />
        </ReviewBlock>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Text selection
// ---------------------------------------------------------------------------

export const TextSelectionExerciseReview = ({ item }: { item: ExerciseOfType<'text-selection'> }) => {
  const passageWords = stripHtmlTags(item.question.passage)
    .split(/\s+/)
    .filter(word => word.trim());
  return (
    <div className="space-y-4">
      <ReviewBlock label="Passage">
        <RichValue value={item.question.passage} />
      </ReviewBlock>
      {item.answerKey.questions.map((question, index) => {
        const result = item.itemResults.selections[index];
        const selectedWord = result && result.wordIndex >= 0 ? (passageWords[result.wordIndex] ?? '—') : '—';
        const correctWord = passageWords[question.correctWordIndex] ?? '';
        return (
          <ReviewBlock key={question.id} label={`Question ${index + 1}`}>
            <div className="space-y-2">
              <RichValue value={question.text} className="font-medium" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Your word:</span>
                <span className={cn('font-medium', selectedWord === '—' && 'italic text-slate-400')}>
                  {selectedWord}
                </span>
                <CorrectBadge correct={result?.correct ?? false} points={result?.points} />
                {result ? <PartPoints points={result.points} /> : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Correct word:</span>
                <span className="font-semibold text-emerald-800">{correctWord}</span>
              </div>
              {question.explanation ? (
                <ReviewBlock label="Explanation" tone="explanation">
                  <RichValue value={question.explanation} />
                </ReviewBlock>
              ) : null}
            </div>
          </ReviewBlock>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Fill in embolded text
// ---------------------------------------------------------------------------

export const FillEmboldedTextExerciseReview = ({ item }: { item: ExerciseOfType<'fill-embolded-text'> }) => {
  return (
    <div className="space-y-4">
      <ReviewBlock label="Passage">
        <RichValue value={item.question.passage} />
      </ReviewBlock>
      {item.answerKey.words.map((word, index) => {
        const result = item.itemResults.answers[index];
        return (
          <ReviewBlock key={word.wordIndex} label={word.question ? `Question ${index + 1}` : `Word ${index + 1}`}>
            <div className="space-y-2">
              {word.question ? <RichValue value={word.question} className="font-medium" /> : null}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Your answer:</span>
                <span className={cn('font-medium', !result.value.trim() && 'italic text-slate-400')}>
                  {result.value.trim() || 'No answer'}
                </span>
                <CorrectBadge correct={result.correct} points={result.points} />
                <PartPoints points={result.points} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Correct answer:</span>
                <span className="font-semibold text-emerald-800">{word.correctAnswer}</span>
              </div>
              {word.explanation ? (
                <ReviewBlock label="Explanation" tone="explanation">
                  <RichValue value={word.explanation} />
                </ReviewBlock>
              ) : null}
            </div>
          </ReviewBlock>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sentence diagramming
// ---------------------------------------------------------------------------

export const SentenceDiagrammingExerciseReview = ({ item }: { item: ExerciseOfType<'sentence-diagramming'> }) => {
  const { answerKey, itemResults } = item;
  return (
    <div className="space-y-4" data-testid="sentence-diagramming-review">
      <RichValue value={answerKey.latin} className="font-serif text-base" />
      {answerKey.translation ? (
        <p className="text-sm italic text-slate-500">&ldquo;{answerKey.translation}&rdquo;</p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="diagram-review-comparison">
        <ReviewBlock label="Your diagram" tone="student" className="min-w-0">
          {itemResults.annotations.length > 0 ? (
            <SentenceDiagramSurface
              tokens={answerKey.tokens}
              annotations={itemResults.annotations}
              selection={null}
              onSelectionChange={() => undefined}
              disabled={true}
            />
          ) : (
            <EmptyAnswer />
          )}
        </ReviewBlock>
        <ReviewBlock label="Correct diagram" tone="answer" className="min-w-0">
          <SentenceDiagramSurface
            tokens={answerKey.tokens}
            annotations={answerKey.solutionAnnotations}
            selection={null}
            onSelectionChange={() => undefined}
            disabled={true}
          />
        </ReviewBlock>
      </div>
      <ReviewBlock label="Result" tone="student">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-700">{itemResults.accuracy}% of annotations matched.</span>
          <CorrectBadge correct={itemResults.correct} points={itemResults.points} />
          <PartPoints points={itemResults.points} />
        </div>
      </ReviewBlock>
      {answerKey.explanation ? (
        <ReviewBlock label="Explanation" tone="explanation">
          <SentenceDiagramFeedbackView content={answerKey.explanation} />
        </ReviewBlock>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Table fill
// ---------------------------------------------------------------------------

export const TableFillExerciseReview = ({ item }: { item: ExerciseOfType<'table-fill'> }) => {
  const { question, answerKey, itemResults } = item;
  const resultsByCell = new Map(itemResults.cells.map(cell => [`${cell.rowId}-${cell.columnId}`, cell]));
  return (
    <div className="space-y-4 overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-sm" data-testid="table-fill-review">
        <thead>
          <tr>
            {question.columns.map(column => (
              <th
                key={column.id}
                className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {answerKey.rows.map(row => (
            <tr key={row.id}>
              {question.columns.map(column => {
                const cell = row.cells[column.id];
                const cellResult = cell?.isBlank ? resultsByCell.get(`${row.id}-${column.id}`) : undefined;
                return (
                  <td key={column.id} className="border border-slate-200 px-3 py-2 align-top">
                    {cell?.isBlank ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn('font-medium', !cellResult?.value.trim() && 'italic text-slate-400')}>
                            {cellResult?.value.trim() || 'No answer'}
                          </span>
                          {cellResult ? (
                            <>
                              <CorrectBadge correct={cellResult.correct} points={cellResult.points} />
                              <PartPoints points={cellResult.points} />
                            </>
                          ) : null}
                        </div>
                        <div className="text-xs text-emerald-800">
                          <span className="text-slate-400">Answer: </span>
                          {cell.answer}
                        </div>
                      </div>
                    ) : (
                      <SimpleRichDisplay content={cell.content} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {question.footnotes && question.footnotes.length > 0 ? (
        <ul className="space-y-1 text-xs text-slate-500">
          {question.footnotes.map((footnote, index) => (
            <li key={index}>{footnote}</li>
          ))}
        </ul>
      ) : null}
      {item.explanation ? (
        <ReviewBlock label="Explanation" tone="explanation">
          <RichValue value={item.explanation} />
        </ReviewBlock>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Click on multiple words
// ---------------------------------------------------------------------------

export const ClickOnMultipleWordsExerciseReview = ({ item }: { item: ExerciseOfType<'click-on-multiple-words'> }) => {
  const words = stripHtmlTags(item.question.passage)
    .split(/\s+/)
    .filter(word => word.trim());
  const selected = new Set(item.itemResults.selectedWordIndices);
  const correct = new Set(item.answerKey.correctWordIndices);
  return (
    <div className="space-y-4">
      <ReviewBlock label="Passage" tone="student">
        <p className="text-sm leading-7">
          {words.map((word, index) => {
            const isCorrectWord = correct.has(index);
            const isSelected = selected.has(index);
            return (
              <span key={index} className="mr-1.5 inline-block">
                <span
                  className={cn(
                    'rounded px-1 py-0.5',
                    isCorrectWord && isSelected
                      ? 'bg-emerald-100 font-semibold text-emerald-900 ring-1 ring-emerald-300'
                      : isCorrectWord
                        ? 'bg-amber-100 font-semibold text-amber-900 ring-1 ring-amber-300'
                        : isSelected
                          ? 'bg-rose-100 font-semibold text-rose-900 ring-1 ring-rose-300'
                          : undefined
                  )}>
                  {word}
                </span>
              </span>
            );
          })}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded bg-emerald-200 ring-1 ring-emerald-300" /> correct &amp;
            selected
          </span>
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded bg-amber-100 ring-1 ring-amber-300" /> correct &amp;
            missed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded bg-rose-100 ring-1 ring-rose-300" /> selected &amp; not
            required
          </span>
        </p>
      </ReviewBlock>
      <ReviewBlock label="Result" tone="student">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-700">
            {selected.size > 0
              ? `${selected.size} word${selected.size === 1 ? '' : 's'} selected.`
              : 'No words were selected.'}
          </span>
          <CorrectBadge correct={item.itemResults.correct} points={item.itemResults.points} />
          <PartPoints points={item.itemResults.points} />
        </div>
      </ReviewBlock>
      {item.explanation ? (
        <ReviewBlock label="Explanation" tone="explanation">
          <RichValue value={item.explanation} />
        </ReviewBlock>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Generated translation
// ---------------------------------------------------------------------------

export const GeneratedTranslationExerciseReview = ({ item }: { item: ExerciseOfType<'generated-translation'> }) => {
  return (
    <div className="space-y-4">
      {item.answerKey.items.map((keyItem, index) => {
        const result = item.itemResults.answers[index];
        return (
          <ReviewBlock key={index} label={`Item ${index + 1}`}>
            <div className="space-y-2">
              <RichValue value={keyItem.text} className="font-medium" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Your answer:</span>
                <span className={cn('font-medium', !result.value.trim() && 'italic text-slate-400')}>
                  {result.value.trim() || 'No answer'}
                </span>
                <CorrectBadge correct={result.correct} points={result.points} />
                <PartPoints points={result.points} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">
                  Accepted {keyItem.acceptedAnswers.length > 1 ? 'answers' : 'answer'}:
                </span>
                <span className="font-semibold text-emerald-800">{keyItem.acceptedAnswers.join(' or ')}</span>
              </div>
            </div>
          </ReviewBlock>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Generated form identification
// ---------------------------------------------------------------------------

export const GeneratedFormIdentificationExerciseReview = ({
  item,
}: {
  item: ExerciseOfType<'generated-form-identification'>;
}) => {
  return (
    <div className="space-y-4">
      {item.answerKey.items.map((keyItem, index) => {
        const result = item.itemResults.answers[index];
        const stepLabel = 'step' in keyItem ? keyItem.step : keyItem.steps.join(' · ');
        const accepted = 'acceptedAnswers' in keyItem ? keyItem.acceptedAnswers : null;
        return (
          <ReviewBlock key={keyItem.id} label={`${keyItem.word} — ${stepLabel}`}>
            <div className="space-y-2">
              {keyItem.selected_form ? (
                <p className="text-xs text-slate-500">Selected form: {keyItem.selected_form}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Your answer:</span>
                <span className={cn('font-medium', !result.value.trim() && 'italic text-slate-400')}>
                  {result.value.trim() || 'No answer'}
                </span>
                <CorrectBadge correct={result.correct} points={result.points} />
                <PartPoints points={result.points} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">{accepted ? 'Accepted answers:' : 'Correct answer:'}</span>
                <span className="font-semibold text-emerald-800">
                  {accepted
                    ? accepted.join(' or ')
                    : 'correctAnswerDisplay' in keyItem
                      ? keyItem.correctAnswerDisplay
                      : ''}
                </span>
              </div>
            </div>
          </ReviewBlock>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Translation grading (AI)
// ---------------------------------------------------------------------------

export const TranslationGradingExerciseReview = ({ item }: { item: ExerciseOfType<'translation-grading'> }) => {
  return (
    <div className="space-y-4">
      {item.itemResults.items.map((result, index) => {
        const latin = item.answerKey.items[index]?.latinText ?? '';
        const instructions = item.answerKey.items[index]?.instructions;
        return (
          <ReviewBlock key={index} label={`Translation ${index + 1}`}>
            <div className="space-y-3">
              {latin ? <RichValue value={latin} className="font-serif font-medium" /> : null}
              {instructions ? (
                <p className="text-xs text-slate-500">
                  <SimpleRichDisplay content={instructions} />
                </p>
              ) : null}
              <ReviewBlock label="Your translation" tone="student">
                {result.translation.trim() ? <PlainValue value={result.translation} /> : <EmptyAnswer />}
              </ReviewBlock>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-500">Score:</span>
                {result.score === null ? (
                  <span className="italic text-slate-400">Not graded</span>
                ) : (
                  <span className="font-semibold text-slate-900">{result.score} / 10</span>
                )}
                <PartPoints points={result.points} />
              </div>
              {result.feedback ? (
                <ReviewBlock label="AI feedback" tone="feedback">
                  <PlainValue value={result.feedback} />
                </ReviewBlock>
              ) : null}
            </div>
          </ReviewBlock>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const ExerciseReviewView = ({ item }: { item: TestResultReviewExerciseItem }) => {
  switch (item.type) {
    case 'matching':
      return <MatchingExerciseReview item={item} />;
    case 'fill':
      return <FillExerciseReview item={item} />;
    case 'multiple-choice':
      return <MultipleChoiceExerciseReview item={item} />;
    case 'odd-one-out':
      return <OddOneOutExerciseReview item={item} />;
    case 'text-selection':
      return <TextSelectionExerciseReview item={item} />;
    case 'fill-embolded-text':
      return <FillEmboldedTextExerciseReview item={item} />;
    case 'sentence-diagramming':
      return <SentenceDiagrammingExerciseReview item={item} />;
    case 'table-fill':
      return <TableFillExerciseReview item={item} />;
    case 'click-on-multiple-words':
      return <ClickOnMultipleWordsExerciseReview item={item} />;
    case 'generated-translation':
      return <GeneratedTranslationExerciseReview item={item} />;
    case 'generated-form-identification':
      return <GeneratedFormIdentificationExerciseReview item={item} />;
    case 'translation-grading':
      return <TranslationGradingExerciseReview item={item} />;
    default:
      return <p className="text-sm text-slate-500">This exercise type cannot be reviewed.</p>;
  }
};
