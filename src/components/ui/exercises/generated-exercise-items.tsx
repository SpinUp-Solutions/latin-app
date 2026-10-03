'use client';

import { Fragment, type ReactNode } from 'react';
import { usePracticeGeneratedExerciseItems } from '@/src/hooks/usePracticeGeneratedExerciseItems';
import { generatedExerciseWordsRequest, type GeneratedExercise } from '@/src/lib/tests/generated-exercises';
import type { GeneratedExerciseQuerySource } from '@/src/store/api/advancedVocabularyApi';
import type { RuntimeMode } from '@/src/types/runtime-mode';
import { ExerciseLoadingCard, ExerciseMessageCard } from './exercise-status-card';

interface Props<Item> {
  exercise: GeneratedExercise;
  runtimeMode?: RuntimeMode;
  /** Questions frozen in a test delivery or resolved by an admin preview. */
  resolvedItems?: Item[];
  /** Where the server resolves this exercise's questions when none were passed in. */
  source?: GeneratedExerciseQuerySource;
  children: (items: Item[]) => ReactNode;
}

/** Renders a generated exercise session over its questions, loading them from the server only when needed. */
export function GeneratedExerciseItems<Item>({ resolvedItems, source, ...props }: Props<Item>) {
  // Test sections receive their questions frozen in the delivery.
  if (resolvedItems || !source || props.runtimeMode === 'test') {
    return <KeyedSession {...props} items={resolvedItems ?? []} />;
  }
  return <ServerResolvedItems {...props} source={source} />;
}

function ServerResolvedItems<Item>({
  source,
  ...props
}: Omit<Props<Item>, 'resolvedItems' | 'source'> & { source: GeneratedExerciseQuerySource }) {
  const { data, isLoading, isError } = usePracticeGeneratedExerciseItems({
    exercise: generatedExerciseWordsRequest(props.exercise),
    source,
  });

  if (isLoading) return <ExerciseLoadingCard />;
  if (isError) {
    return (
      <ExerciseMessageCard
        title="Error loading exercise"
        message="Unable to fetch vocabulary words. Please try again later."
      />
    );
  }
  return <KeyedSession {...props} items={(data?.items ?? []) as Item[]} />;
}

function KeyedSession<Item>({
  exercise,
  runtimeMode,
  items,
  children,
}: Omit<Props<Item>, 'resolvedItems' | 'source'> & { items: Item[] }) {
  // A different exercise or sample starts a fresh session and cancels pending advancement.
  return <Fragment key={JSON.stringify([exercise, runtimeMode ?? 'practice', items])}>{children(items)}</Fragment>;
}
