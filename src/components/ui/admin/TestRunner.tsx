'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Progress } from '@/src/components/ui/progress';
import ContentRenderer from '@/src/components/ui/lesson/content-renderer';
import type { TestContentItem, TestDefinition, TestExerciseResult } from '@/src/types/test';
import { getTestItems, getTestPages, isScoredTestExercise } from '@/src/utils/testDefinition';

interface TestRunnerProps {
  test: TestDefinition;
  embedded?: boolean;
}

const formatPoints = (value: number) => value.toFixed(2).replace(/\.00$/, '');

export function TestRunner({ test, embedded = false }: TestRunnerProps) {
  const items = getTestItems(test);
  const pages = getTestPages(test);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<TestExerciseResult[]>([]);
  const [currentResult, setCurrentResult] = useState<TestExerciseResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const finished = currentIndex >= items.length;
  const earnedPoints = results.reduce((sum, result) => sum + result.earnedPoints, 0);
  const percentage = test.totalPoints > 0 ? Math.round((earnedPoints / test.totalPoints) * 100) : 0;

  const progress = useMemo(
    () =>
      items.length > 0 ? (Math.min(currentIndex, items.length) / items.length) * 100 : 0,
    [currentIndex, items.length]
  );

  const restart = () => {
    setCurrentIndex(0);
    setResults([]);
    setCurrentResult(null);
    setRunKey(key => key + 1);
  };

  if (finished) {
    return (
      <div className={embedded ? 'space-y-4' : 'mx-auto max-w-4xl space-y-6 p-4 md:p-8'}>
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <div>
              <h1 className="text-2xl font-serif">Test complete</h1>
              <p className="text-gray-500">{test.title}</p>
            </div>
            <div className="text-4xl font-semibold text-roman-red">{percentage}%</div>
            <div className="text-lg">
              {formatPoints(earnedPoints)} / {formatPoints(test.totalPoints)} points
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.map((result, index) => (
              <div key={result.exerciseId} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span>
                  {index + 1}. {result.title}
                </span>
                <strong>
                  {formatPoints(result.earnedPoints)} / {formatPoints(result.maxPoints)}
                </strong>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={restart}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart
          </Button>
          {!embedded && (
            <>
              <Button asChild variant="outline">
                <Link href={`/admin/tests/edit/${test.id}`}>Edit Test</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/admin/tests/manage">Back to Tests</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  const currentItem = items[currentIndex]!;
  const scoredExercise = isScoredTestExercise(currentItem) ? currentItem : null;
  const content = scoredExercise ? scoredExercise.exercise : (currentItem as TestContentItem).content;
  const currentPageIndex = pages.findIndex(page => page.items.some(item => item.id === content.id));
  const currentPage = pages[currentPageIndex];
  const completeExercise = (scorePercent: number) => {
    if (!scoredExercise || currentResult) return;
    const boundedPercent = Math.max(0, Math.min(100, scorePercent));
    setCurrentResult({
      exerciseId: scoredExercise.exercise.id,
      title: scoredExercise.exercise.title || scoredExercise.exercise.type,
      scorePercent: boundedPercent,
      earnedPoints: scoredExercise.maxPoints * (boundedPercent / 100),
      maxPoints: scoredExercise.maxPoints,
    });
  };

  const continueToNext = () => {
    if (scoredExercise && !currentResult) return;
    if (currentResult) setResults(current => [...current, currentResult]);
    setCurrentResult(null);
    setCurrentIndex(index => index + 1);
  };

  return (
    <div className={embedded ? 'min-w-0 space-y-3' : 'mx-auto max-w-5xl space-y-5 p-4 md:p-8'}>
      <Card className="min-w-0 overflow-hidden border-roman-red bg-roman-red text-white shadow-[0_10px_30px_-20px_rgba(73,35,16,0.55)]">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="break-words font-serif text-xl font-semibold leading-tight text-white">{test.title}</h1>
              {test.description && (
                <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-red-100/80">{test.description}</p>
              )}
            </div>
            <div className="inline-flex shrink-0 items-center rounded-full bg-white/10 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-white ring-1 ring-inset ring-white/20">
              {Math.round(progress)}%
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-red-100/75">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-semibold text-white">Item {currentIndex + 1} / {items.length}</span>
                {currentPage && (
                  <span className="truncate border-l border-white/20 pl-2" title={currentPage.title || undefined}>
                    Page {currentPageIndex + 1} / {pages.length}{currentPage.title ? ` · ${currentPage.title}` : ''}
                  </span>
                )}
              </div>
              <span className="shrink-0 tabular-nums">
                <strong className="font-semibold text-white">{formatPoints(earnedPoints)}</strong> / {formatPoints(test.totalPoints)} pts
              </span>
            </div>
            <Progress value={progress} className="h-1.5 w-full overflow-hidden bg-black/15 [&>div]:bg-amber-200" />
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardContent className="min-w-0 overflow-x-auto p-4 sm:p-5 md:p-8" key={`${runKey}-${content.id}`}>
          <ContentRenderer content={content} onComplete={scoredExercise ? completeExercise : undefined} runtimeMode="test" />
        </CardContent>
      </Card>

      {currentResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-medium">Exercise scored</div>
              <div className="text-sm text-gray-600">
                Awarded {formatPoints(currentResult.earnedPoints)} of {formatPoints(currentResult.maxPoints)} points (
                {Math.round(currentResult.scorePercent)}%).
              </div>
            </div>
            <Button onClick={continueToNext}>
              {currentIndex === items.length - 1 ? 'View results' : 'Continue'}
            </Button>
          </CardContent>
        </Card>
      )}

      {!scoredExercise && (
        <div className="flex justify-end">
          <Button onClick={continueToNext}>{currentIndex === items.length - 1 ? 'View results' : 'Continue'}</Button>
        </div>
      )}

      {!embedded && (
        <div className="flex justify-between">
          <Button asChild variant="ghost">
            <Link href="/admin/tests/manage">Exit test</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/admin/tests/edit/${test.id}`}>Edit configuration</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
