'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, Eye, FileCheck2, Save } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Progress } from '@/src/components/ui/progress';
import { RomanPlayerShell } from '@/src/components/ui/core/roman-player-shell';
import { PageTemplate } from '@/src/components/ui/lesson/page-template';
import { cn } from '@/src/lib/utils';
import type { Page } from '@/src/types/page';
import type { ExerciseAnswer, ExerciseAnswerEvent } from '@/src/types/runtime-mode';
import type { ResolvedGeneratedExerciseState } from '@/src/components/ui/lesson/content-renderer';
import type { VocabularyPoolStudyData } from '@/src/types/vocabulary';

export interface TestTakingViewProps {
  title: string;
  description?: string;
  pages: Page[];
  currentPageIndex: number;
  answeredCount: number;
  totalExercises: number;
  status: React.ReactNode;
  preview?: boolean;
  answers?: Record<string, ExerciseAnswer>;
  resolvedExerciseState?: Record<string, ResolvedGeneratedExerciseState>;
  allowGeneratedExerciseQueries?: boolean;
  vocabularyPoolId?: string | null;
  resolvedVocabularyPool?: VocabularyPoolStudyData;
  onAnswer?: (event: ExerciseAnswerEvent) => void;
  onExerciseComplete?: (exerciseId: string, score: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onReview: () => void;
  navigationPending?: boolean;
  embedded?: boolean;
}

export function TestTakingView({
  title,
  description,
  pages,
  currentPageIndex,
  answeredCount,
  totalExercises,
  status,
  preview = false,
  answers,
  resolvedExerciseState,
  allowGeneratedExerciseQueries = false,
  vocabularyPoolId,
  resolvedVocabularyPool,
  onAnswer,
  onExerciseComplete,
  onPrevious,
  onNext,
  onReview,
  navigationPending = false,
  embedded = false,
}: TestTakingViewProps) {
  const currentPage = pages[currentPageIndex];
  const answeredPercentage = totalExercises > 0 ? (answeredCount / totalExercises) * 100 : 0;
  const isLastPage = currentPageIndex >= pages.length - 1;
  const StatusIcon = preview ? Eye : Save;

  return (
    <div
      data-testid="test-taking-view"
      className={cn(
        'bg-roman-marble',
        embedded ? 'min-w-0' : 'min-h-screen bg-gradient-to-b from-roman-marble via-white to-roman-parchment/50'
      )}>
      <main className={cn('mx-auto w-full max-w-4xl', embedded ? 'p-0' : 'p-4 md:py-8')}>
        <RomanPlayerShell
          icon={FileCheck2}
          label={preview ? 'Test preview' : 'Test in progress'}
          currentPage={currentPageIndex + 1}
          totalPages={pages.length}
          title={title}
          description={description}
          headingAs={embedded ? 'div' : 'h1'}
          className="overflow-visible rounded-2xl border-roman-red/15 shadow-md"
          contentClassName="p-5 sm:p-7 md:p-8"
          headerAside={
            <div className="shrink-0 text-right text-sm">
              <div className="font-semibold text-roman-red">
                {answeredCount} of {totalExercises} answered
              </div>
              <div className="text-xs text-roman-stone">{Math.round(answeredPercentage)}% complete</div>
            </div>
          }
          headerFooter={
            <>
              <Progress value={answeredPercentage} className="mt-4 h-2 bg-white/70 [&>div]:bg-roman-red" />
              <div
                className="mt-3 flex min-h-5 items-center gap-1.5 text-xs text-roman-stone"
                role="status"
                aria-live="polite"
                aria-atomic="true">
                <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {status}
              </div>
            </>
          }>
          {currentPage ? (
            <PageTemplate
              key={currentPage.id}
              page={currentPage}
              pageIndex={currentPageIndex}
              runtimeMode="test"
              onAnswer={onAnswer}
              answers={answers}
              resolvedExerciseState={resolvedExerciseState}
              allowGeneratedExerciseQueries={allowGeneratedExerciseQueries}
              vocabularyPoolId={vocabularyPoolId}
              resolvedVocabularyPool={resolvedVocabularyPool}
              onExerciseComplete={onExerciseComplete}
            />
          ) : (
            <p className="py-12 text-center text-roman-stone">This test page is unavailable.</p>
          )}
        </RomanPlayerShell>

        <div
          className="mt-4 flex flex-col gap-3 rounded-2xl border border-roman-red/15 bg-white/95 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          aria-label="Test page navigation">
          <Button
            variant="outline"
            className="rounded-xl border-roman-red/20 hover:bg-roman-parchment"
            disabled={navigationPending || currentPageIndex === 0}
            onClick={onPrevious}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Previous page
          </Button>
          {!isLastPage ? (
            <Button
              className="rounded-xl bg-roman-red hover:bg-roman-red/90"
              disabled={navigationPending}
              onClick={onNext}>
              Next page
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              className="rounded-xl bg-roman-red hover:bg-roman-red/90"
              disabled={navigationPending}
              onClick={onReview}>
              Review answers
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
