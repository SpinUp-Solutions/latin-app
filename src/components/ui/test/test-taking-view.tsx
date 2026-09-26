'use client';

import React, { type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Eye, FileCheck2, LogOut, Save } from 'lucide-react';
import { Progress } from '@/src/components/ui/progress';
import { PlayerActionBar, PlayerBarButton } from '@/src/components/ui/core/player-action-bar';
import { RomanPlayerShell } from '@/src/components/ui/core/roman-player-shell';
import { PageTemplate } from '@/src/components/ui/lesson/page-template';
import { cn } from '@/src/lib/utils';
import type { Page } from '@/src/types/page';
import type { ExerciseAnswer, ExerciseAnswerEvent } from '@/src/types/runtime-mode';
import type { ResolvedGeneratedExerciseState } from '@/src/components/ui/lesson/content-renderer';
import type { VocabularyPoolStudyData } from '@/src/types/vocabulary';

export interface TestTakingViewProps {
  title: ReactNode;
  description?: ReactNode;
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
  onExit?: () => void;
  navigationPending?: boolean;
  embedded?: boolean;
  sectionNavigation?: { pageIndex: number; totalPages: number };
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
  onExit,
  navigationPending = false,
  embedded = false,
  sectionNavigation,
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
          currentPage={(sectionNavigation?.pageIndex ?? currentPageIndex) + 1}
          totalPages={sectionNavigation?.totalPages ?? pages.length}
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
            <div inert={Boolean(sectionNavigation && navigationPending) || undefined}>
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
            </div>
          ) : (
            <p className="py-12 text-center text-roman-stone">This test page is unavailable.</p>
          )}
        </RomanPlayerShell>

        <PlayerActionBar label="Test page navigation" className="mt-4">
          {onExit ? (
            <PlayerBarButton type="button" tone="outline" disabled={navigationPending} onClick={onExit}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Exit test
            </PlayerBarButton>
          ) : null}
          <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row sm:items-center">
            {!sectionNavigation && (
              <PlayerBarButton
                type="button"
                tone="outline"
                disabled={navigationPending || currentPageIndex === 0}
                onClick={onPrevious}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Previous page
              </PlayerBarButton>
            )}
            {!sectionNavigation && !isLastPage ? (
              <PlayerBarButton type="button" disabled={navigationPending} onClick={onNext}>
                Next page
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </PlayerBarButton>
            ) : (
              <PlayerBarButton type="button" disabled={navigationPending} onClick={onReview}>
                {sectionNavigation ? 'Review section' : 'Review answers'}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </PlayerBarButton>
            )}
          </div>
        </PlayerActionBar>
      </main>
    </div>
  );
}
