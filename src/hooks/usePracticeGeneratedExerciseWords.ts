import { createContext, useContext, useState } from 'react';
import { useGetGeneratedExerciseWordsQuery } from '@/src/store/api/advancedVocabularyApi';

export const RetainedPracticeSession = createContext(false);

type QueryArgs = Parameters<typeof useGetGeneratedExerciseWordsQuery>[0];
type QueryOptions = Parameters<typeof useGetGeneratedExerciseWordsQuery>[1];
type QueryData = ReturnType<typeof useGetGeneratedExerciseWordsQuery>['data'];

/** Keep a visited practice exercise's random sample even after RTK cache eviction. */
export function usePracticeGeneratedExerciseWords(args: QueryArgs, options: QueryOptions) {
  const retained = useContext(RetainedPracticeSession);
  const key = JSON.stringify(args);
  const [sample, setSample] = useState<{ key: string; data: QueryData } | null>(null);
  const saved = retained && sample?.key === key ? sample.data : undefined;
  const result = useGetGeneratedExerciseWordsQuery(args, { ...options, skip: options?.skip || Boolean(saved) });

  if (retained && !saved && result.currentData && !options?.skip) {
    setSample({ key, data: result.currentData });
  }

  return saved ? { ...result, data: saved, isLoading: false, isError: false } : result;
}
