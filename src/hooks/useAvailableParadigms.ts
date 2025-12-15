import { useMemo } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetPoolParadigmSummaryQuery } from '@/src/store/api/vocabularyPoolApi';
import type { FormParadigm } from '@/src/types/exercises/paradigm';
import type { GeneratorFilters } from '@/src/types/exercises/base';
import { getParadigmsFromFilters } from '@/src/utils/paradigm';

export interface UseAvailableParadigmsReturn {
  isLoading: boolean;
  isError: boolean;
  availableParadigms: FormParadigm[];
  paradigmWordCounts: Partial<Record<FormParadigm, number>>;
  hasMultipleParadigms: boolean;
  uniqueParadigm: FormParadigm | undefined;
}

export function useAvailableParadigms(
  wordSource: 'filters' | 'pool',
  poolId: string | null,
  filters: GeneratorFilters
): UseAvailableParadigmsReturn {
  const poolSummary = useGetPoolParadigmSummaryQuery(wordSource === 'pool' && poolId ? poolId : skipToken);

  const filtersParadigms = useMemo(() => {
    if (wordSource !== 'filters') return null;
    return getParadigmsFromFilters(filters);
  }, [wordSource, filters]);

  return useMemo(() => {
    if (wordSource === 'pool') {
      const paradigms = Object.keys(poolSummary.data?.paradigmSummary || {}) as FormParadigm[];
      return {
        isLoading: poolSummary.isLoading,
        isError: poolSummary.isError,
        availableParadigms: paradigms,
        paradigmWordCounts: poolSummary.data?.paradigmSummary ?? {},
        hasMultipleParadigms: paradigms.length > 1,
        uniqueParadigm: paradigms.length === 1 ? paradigms[0] : undefined,
      };
    }

    return {
      isLoading: false,
      isError: false,
      availableParadigms: filtersParadigms ?? [],
      paradigmWordCounts: {},
      hasMultipleParadigms: (filtersParadigms?.length ?? 0) > 1,
      uniqueParadigm: filtersParadigms?.length === 1 ? filtersParadigms[0] : undefined,
    };
  }, [wordSource, poolSummary, filtersParadigms]);
}
