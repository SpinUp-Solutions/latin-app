import { createContext, useContext, useState } from 'react';
import { useGetGeneratedExerciseItemsQuery } from '@/src/store/api/generatedExerciseApi';

export const RetainedPracticeSession = createContext(false);

type QueryArgs = Parameters<typeof useGetGeneratedExerciseItemsQuery>[0];
type QueryData = ReturnType<typeof useGetGeneratedExerciseItemsQuery>['data'];

/** Keep a visited practice exercise's random sample even after RTK cache eviction. */
export function usePracticeGeneratedExerciseItems(args: QueryArgs) {
  const retained = useContext(RetainedPracticeSession);
  const key = JSON.stringify(args);
  const [sample, setSample] = useState<{ key: string; data: QueryData } | null>(null);
  const saved = retained && sample?.key === key ? sample.data : undefined;
  const result = useGetGeneratedExerciseItemsQuery(args, { skip: Boolean(saved) });

  if (retained && !saved && result.currentData) {
    setSample({ key, data: result.currentData });
  }

  return saved ? { ...result, data: saved, isLoading: false, isError: false } : result;
}
