'use client';

import React, { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/src/components/ui/accordion';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { AudioPlayer } from '@/src/components/ui/core/AudioPlayer';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import ConjugationTable from '@/src/components/ui/lesson/conjugation-table';
import { VocabularyViewer } from '@/src/components/ui/lesson/VocabularyViewer';
import { VocabularyPoolViewer } from '@/src/components/ui/lesson/VocabularyPoolViewer';
import { cn } from '@/src/lib/utils';
import type { StudentTestResult, TestResultReviewExerciseItem, TestResultReviewSupportingItem } from '@/src/types/test-results';
import type { VocabularyContent, VocabularyPoolContent } from '@/src/types/lesson';
import { ExerciseReviewView } from './exercise-review-views';

const formatPoints = (value: number) =>
  value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');

// ---------------------------------------------------------------------------
// Supporting content (passages, tables, vocabulary, audio)
// ---------------------------------------------------------------------------

const SupportingContentView = ({ item, poolId, resolvedPool }: { item: TestResultReviewSupportingItem; poolId?: string; resolvedPool?: unknown }) => {
  switch (item.type) {
    case 'text':
    case 'emphasis':
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {item.title ? (
            <h4 className="mb-1 font-serif text-lg text-slate-900">
              <SimpleRichDisplay content={item.title} />
            </h4>
          ) : null}
          <div className="prose prose-sm max-w-none prose-p:my-2 prose-p:leading-snug">
            <SimpleRichDisplay content={item.content} />
          </div>
          {item.audioPath ? <AudioPlayButton audioPath={item.audioPath} className="mt-2" /> : null}
        </div>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
          <ConjugationTable data={item.tableData} audioPath={item.audioPath} />
        </div>
      );
    case 'vocabulary':
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <VocabularyViewer content={item as unknown as VocabularyContent} />
        </div>
      );
    case 'vocabulary-pool':
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <VocabularyPoolViewer
            content={item as unknown as VocabularyPoolContent}
            poolId={poolId}
            resolvedPool={resolvedPool as never}
          />
        </div>
      );
    case 'listening-passage':
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {item.title ? (
            <h4 className="mb-1 font-serif text-lg text-slate-900">
              <SimpleRichDisplay content={item.title} />
            </h4>
          ) : null}
          {item.instructions ? (
            <div className="mb-2 text-sm text-slate-600">
              <SimpleRichDisplay content={item.instructions} />
            </div>
          ) : null}
          <div className="space-y-2 rounded-xl border border-roman-terracotta/20 bg-gradient-to-br from-roman-parchment/50 to-white p-5">
            <div className="font-serif leading-relaxed text-slate-900">
              <SimpleRichDisplay content={item.data.latinText} />
            </div>
            <div className="text-sm italic text-slate-500">
              <SimpleRichDisplay content={item.data.translation} />
            </div>
          </div>
          {item.data.passageAudioPath ? (
            <div className="mt-3">
              <AudioPlayer audioPath={item.data.passageAudioPath} />
            </div>
          ) : null}
        </div>
      );
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Accordion model: one entry per exercise; supporting items attach to the
// following exercise on the same page (or the last one when trailing).
// ---------------------------------------------------------------------------

interface ReviewAccordionEntry {
  id: string;
  number: number;
  title: string;
  awardedPoints: number;
  maxPoints: number;
  correct: boolean;
  pageContexts: Array<{ id: string; title?: string; audioPath?: string | null }>;
  supporting: TestResultReviewSupportingItem[];
  exercise: TestResultReviewExerciseItem;
}

const buildAccordionEntries = (result: StudentTestResult): ReviewAccordionEntry[] => {
  const entries: ReviewAccordionEntry[] = [];
  let number = 0;
  let pendingSupporting: TestResultReviewSupportingItem[] = [];
  let pendingPageContexts: ReviewAccordionEntry['pageContexts'] = [];
  for (const page of result.review?.content.pages ?? []) {
    if (page.title || page.audioPath) {
      pendingPageContexts.push({ id: page.id, title: page.title, audioPath: page.audioPath });
    }
    let lastExerciseIndex: number | null = null;
    for (const item of page.items) {
      if (!('answerKey' in item)) {
        pendingSupporting.push(item as TestResultReviewSupportingItem);
        continue;
      }
      const exercise = item as TestResultReviewExerciseItem;
      number += 1;
      lastExerciseIndex = entries.length;
      entries.push({
        id: exercise.id,
        number,
        title: exercise.title || `Exercise ${number}`,
        awardedPoints: exercise.result.awardedPoints,
        maxPoints: exercise.result.maxPoints,
        correct: exercise.result.awardedPoints >= exercise.result.maxPoints,
        pageContexts: pendingPageContexts,
        supporting: pendingSupporting,
        exercise,
      });
      pendingPageContexts = [];
      pendingSupporting = [];
    }
    if (pendingSupporting.length > 0 && lastExerciseIndex !== null) {
      entries[lastExerciseIndex].supporting.push(...pendingSupporting);
      pendingSupporting = [];
    }
  }
  if (entries.length > 0) {
    if (pendingPageContexts.length > 0) entries[entries.length - 1].pageContexts.push(...pendingPageContexts);
    if (pendingSupporting.length > 0) entries[entries.length - 1].supporting.push(...pendingSupporting);
  }
  return entries;
};

// ---------------------------------------------------------------------------
// Review view
// ---------------------------------------------------------------------------

export function TestResultReviewView({ result }: { result: StudentTestResult }) {
  const { attempt, review } = result;
  const entries = useMemo(() => buildAccordionEntries(result), [result]);

  const defaultOpenEntry =
    entries.find(entry => !entry.correct) ?? entries[0];

  return (
    <div className="min-h-screen bg-roman-marble p-4 md:p-8" data-testid="test-result-review">
      <div className="mx-auto max-w-4xl space-y-6">
        <div
          className={cn(
            'overflow-hidden rounded-2xl border bg-white shadow-md',
            attempt.outcome === 'not-passed' ? 'border-amber-300' : 'border-emerald-300'
          )}>
          <div className="h-1.5 bg-roman-red" />
          <div className="space-y-4 p-6 text-center sm:p-8">
            <h1 className="font-serif text-2xl text-slate-900 sm:text-3xl">Test result review</h1>
            <div className="text-4xl font-semibold text-roman-red">{formatPoints(attempt.percentage)}%</div>
            <p className="text-slate-700">
              {formatPoints(attempt.score)} / {formatPoints(attempt.maxScore)} points
            </p>
            <p className="text-sm text-slate-500">
              Submitted {new Date(attempt.submittedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {review === null ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="font-serif text-xl text-slate-900">Detailed review unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This attempt was submitted before detailed reviews were introduced. Its frozen score summary above is
              still available, but the question-by-question review cannot be reconstructed.
            </p>
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="font-serif text-xl text-slate-900">Nothing to review</h2>
            <p className="mt-2 text-sm text-slate-600">This attempt does not contain any reviewable exercises.</p>
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible={false}
            defaultValue={defaultOpenEntry?.id}
            className="space-y-3"
            data-testid="test-result-accordion">
            {entries.map(entry => (
              <AccordionItem
                key={entry.id}
                value={entry.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                data-testid={`review-exercise-${entry.id}`}>
                <AccordionTrigger
                  className="gap-4 px-5 py-4 text-left hover:no-underline data-[state=open]:border-b data-[state=open]:border-slate-100"
                  aria-label={`Exercise ${entry.number}: ${entry.title}`}>
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                        entry.correct ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      )}>
                      {entry.number}
                    </span>
                    <span className="min-w-0 truncate font-medium text-slate-900">{entry.title}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-slate-500">
                    {formatPoints(entry.awardedPoints)} / {formatPoints(entry.maxPoints)} points
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 px-5 py-5">
                  {entry.pageContexts.map(page => (
                    <div
                      key={page.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-roman-terracotta/20 bg-roman-parchment/35 px-4 py-3">
                      {page.title ? (
                        <div className="font-serif text-base text-slate-900">
                          <SimpleRichDisplay content={page.title} />
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-slate-600">Page audio</span>
                      )}
                      {page.audioPath ? (
                        <div data-testid={`review-page-audio-${page.id}`}>
                          <AudioPlayButton audioPath={page.audioPath} showLabel />
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {entry.supporting.length > 0 ? (
                    <div className="space-y-3">
                      {entry.supporting.map(item => (
                        <SupportingContentView
                          key={item.id}
                          item={item}
                          poolId={review.content.vocabularyPool?.id}
                          resolvedPool={review.content.vocabularyPool}
                        />
                      ))}
                    </div>
                  ) : null}
                  {entry.exercise.instructions ? (
                    <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <SimpleRichDisplay content={entry.exercise.instructions} />
                    </div>
                  ) : null}
                  {entry.exercise.audioPath ? (
                    <div>
                      <AudioPlayButton audioPath={entry.exercise.audioPath} showLabel />
                    </div>
                  ) : null}
                  <ExerciseReviewView item={entry.exercise} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
