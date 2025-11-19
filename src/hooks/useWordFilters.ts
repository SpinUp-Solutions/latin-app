import { useState, useMemo } from 'react';
import { useDebounce } from './useDebounce';
import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import type { VerbConjugation } from '@/src/types/vocabulary/schemas/verb-conjugation';
import type { NounDeclension } from '@/src/types/vocabulary/schemas/enums';
import type { AdjectiveDeclension } from '@/src/types/vocabulary/schemas/enums';

export interface PoolFilters {
  partOfSpeech: PartOfSpeech | 'all';
  search: string;
  verbConjugation: VerbConjugation | 'all';
  isDeponent: 'true' | 'false' | 'both';
  nounDeclension: NounDeclension | 'all';
  adjectiveDeclension: AdjectiveDeclension | 'all';
}

const DEFAULT_FILTERS: PoolFilters = {
  partOfSpeech: 'all',
  search: '',
  verbConjugation: 'all',
  isDeponent: 'both',
  nounDeclension: 'all',
  adjectiveDeclension: 'all',
};

export const useWordFilters = (initialFilters?: Partial<PoolFilters>) => {
  const [filters, setFilters] = useState<PoolFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });

  const debouncedSearch = useDebounce(filters.search || '', 300);

  const debouncedFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [filters, debouncedSearch]
  );

  const updateFilters = (updates: Partial<PoolFilters>) => {
    setFilters(prev => {
      const newFilters = { ...prev, ...updates };

      if ('partOfSpeech' in updates) {
        const pos = updates.partOfSpeech;
        if (pos !== 'verb') {
          newFilters.verbConjugation = 'all';
          newFilters.isDeponent = 'both';
        }
        if (pos !== 'noun') {
          newFilters.nounDeclension = 'all';
        }
        if (pos !== 'adjective') {
          newFilters.adjectiveDeclension = 'all';
        }
      }

      return newFilters;
    });
  };

  const resetFilters = () => {
    setFilters({
      ...DEFAULT_FILTERS,
      ...initialFilters,
    });
  };

  return {
    filters,
    debouncedFilters,
    updateFilters,
    resetFilters,
  };
};
