'use client';

import React, { memo } from 'react';
import { ArrowRight, ClipboardCheck, Trophy } from 'lucide-react';
import type { StudentMockTestSummary } from '@/src/types/test';
import { RomanCardContent } from '@/src/components/ui/core/roman-card';
import { cn } from '@/src/lib/utils';
import { formatScorePercentage } from '@/src/lib/tests/formatting';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';

const formatPoints = (value: number) =>
  value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');

export const MockTestCard = memo(
  ({ mock, onMockClick }: { mock: StudentMockTestSummary; onMockClick: (id: string) => void }) => {
    const summary = mock.attemptSummary;
    const action = summary.inProgressAttemptId
      ? 'Continue Mock Test'
      : summary.attemptCount
        ? 'Retake Mock Test'
        : 'Start Mock Test';
    const latest = summary.latest;
    const status = summary.inProgressAttemptId ? 'In progress' : summary.attemptCount ? 'Attempted' : 'Ready';

    // Outcomes are frozen on submission. The mock's current setting only
    // describes a future attempt, so it must never reinterpret history.
    const latestOutcome = latest
      ? latest.outcome === 'passed'
        ? 'Passed — informational only'
        : latest.outcome === 'not-passed'
          ? 'Not passed — informational only'
          : 'Completed — score-only attempt'
      : null;

    const statusClass = summary.inProgressAttemptId
      ? 'border-roman-terracotta/25 bg-roman-terracotta/10 text-roman-red'
      : summary.attemptCount
        ? 'border-teal-200 bg-teal-50 text-teal-700'
        : 'border-slate-200 bg-white/80 text-slate-500';
    const title = stripHtmlTags(mock.title);
    const description = stripHtmlTags(mock.description ?? '');

    return (
      <button
        type="button"
        aria-label={`${action}: ${title}`}
        onClick={() => onMockClick(mock.id)}
        data-testid="mock-test-card"
        className="group relative flex h-[16rem] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-[0_12px_35px_-24px_rgba(30,41,59,0.55)] transition duration-300 hover:-translate-y-1 hover:border-teal-300/70 hover:shadow-[0_20px_45px_-24px_rgba(30,41,59,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-teal-300/35 via-cyan-100/30 to-transparent opacity-80"
        />

        <RomanCardContent className="relative flex h-full flex-col p-0">
          <div className="flex min-h-11 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 ring-1 ring-black/5">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="min-w-0 flex-1 line-clamp-2 text-xl font-serif leading-6 text-slate-950 transition-colors group-hover:text-roman-red">
              {title}
            </h3>
          </div>

          <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
            {description && <p className="line-clamp-1 text-sm leading-5 text-slate-600">{description}</p>}

            <div
              className={cn(
                'flex min-w-0 items-center gap-2 overflow-hidden text-xs text-slate-600',
                description && 'mt-2'
              )}>
              <span className="shrink-0 rounded-full border border-teal-100 bg-teal-50 px-2.5 py-0.5 font-medium text-teal-800">
                {mock.passingPercentage === null ? 'Score only' : `Pass ≥ ${mock.passingPercentage}%`}
              </span>
              {summary.best ? (
                <span className="flex min-w-0 shrink-0 items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                  <span>Best</span>
                  <span className="font-semibold text-teal-800">{formatScorePercentage(summary.best.percentage)}%</span>
                </span>
              ) : (
                <span className="min-w-0 truncate">Not attempted · {formatPoints(mock.totalPoints)} points</span>
              )}
            </div>

            {summary.best && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {summary.attemptCount} {summary.attemptCount === 1 ? 'attempt' : 'attempts'}
                {latest && (
                  <>
                    {' · Latest '}
                    {formatPoints(latest.score)} / {formatPoints(latest.maxScore)} (
                    {formatScorePercentage(latest.percentage)}%)
                  </>
                )}
              </p>
            )}
            {latestOutcome && (
              <p
                className={cn(
                  'mt-0.5 truncate text-xs font-semibold',
                  latest?.outcome === 'not-passed' ? 'text-amber-700' : 'text-emerald-700'
                )}>
                {latestOutcome}
              </p>
            )}
            {mock.scoreTrend.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                Recent {mock.scoreTrend.map(score => `${formatScorePercentage(score.percentage)}%`).join(' → ')}
              </p>
            )}

            <p
              className="sr-only"
              aria-label={`Recent scores: ${mock.scoreTrend.length ? mock.scoreTrend.map(score => `${formatScorePercentage(score.percentage)} percent`).join(', ') : 'no submitted attempts'}`}>
              {mock.scoreTrend.length
                ? `Recent scores: ${mock.scoreTrend.map(score => `${formatScorePercentage(score.percentage)}%`).join(' → ')}`
                : 'Your practice attempts will appear here.'}
            </p>
            <span className="sr-only">
              {summary.attemptCount === 1 ? '1 practice attempt' : `${summary.attemptCount} practice attempts`}
            </span>
          </div>

          <div className="relative mt-3 border-t border-slate-100 pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                  statusClass
                )}>
                {status}
              </span>
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-0 py-1 text-sm font-semibold text-slate-800 transition-colors hover:text-roman-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2">
                <span className="truncate">{action}</span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </div>
          </div>
        </RomanCardContent>
      </button>
    );
  }
);

MockTestCard.displayName = 'MockTestCard';
