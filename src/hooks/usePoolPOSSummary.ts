import { useMemo } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetPoolParadigmSummaryQuery } from '@/src/store/api/vocabularyPoolApi';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';

export interface UsePoolPOSSummaryReturn {
  isLoading: boolean;
  isError: boolean;
  summary: Partial<Record<PartOfSpeech, number>> | null;
  totalWords: number;
  availablePOS: PartOfSpeech[];
  hasMultiplePOS: boolean;
  uniquePOS: PartOfSpeech | undefined;
}

export function usePoolPOSSummary(poolId: string | null): UsePoolPOSSummaryReturn {
  const { data, isLoading, isError } = useGetPoolParadigmSummaryQuery(poolId ?? skipToken);
  const summary = data?.posSummary;

  const availablePOS = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([pos]) => pos as PartOfSpeech);
  }, [summary]);

  const hasMultiplePOS = useMemo(() => availablePOS.length > 1, [availablePOS.length]);

  const uniquePOS = useMemo(() => (availablePOS.length === 1 ? availablePOS[0] : undefined), [availablePOS]);

  return {
    isLoading,
    isError,
    summary: summary ?? null,
    totalWords: data?.totalWords ?? 0,
    availablePOS,
    hasMultiplePOS,
    uniquePOS,
  };
}
