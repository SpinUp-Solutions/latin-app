'use client';

import React from 'react';
import { cn } from '@/src/lib/utils';

interface ExerciseCompletionRingProps {
  completedCount: number;
  requiredCount: number;
}

/** A non-interactive, accessible summary of required exercise completion. */
export function ExerciseCompletionRing({ completedCount, requiredCount }: ExerciseCompletionRingProps) {
  const required =
    typeof requiredCount === 'number' && Number.isFinite(requiredCount) ? Math.max(0, Math.trunc(requiredCount)) : 0;
  const total = Math.max(1, required);
  const completedValue =
    typeof completedCount === 'number' && Number.isFinite(completedCount) ? Math.max(0, Math.trunc(completedCount)) : 0;
  const completed = Math.min(required, completedValue);
  const isComplete = required > 0 && completed >= required;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completed / total) * circumference;

  return (
    <div
      role="progressbar"
      aria-label={`Exercise progress: ${completed} of ${required} completed`}
      aria-valuemin={0}
      aria-valuemax={required}
      aria-valuenow={completed}
      className="relative h-14 w-14 shrink-0 sm:h-16 sm:w-16">
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="h-full w-full -rotate-90 text-roman-parchment/70">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn(
            'transition-[stroke-dashoffset,stroke] duration-300 ease-out',
            isComplete ? 'stroke-roman-green' : 'stroke-roman-terracotta'
          )}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-roman-red sm:text-sm">
        {completed}/{required}
      </span>
    </div>
  );
}

export default ExerciseCompletionRing;
