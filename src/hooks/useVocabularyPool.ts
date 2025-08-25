import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  loadPool,
  loadAvailableWords,
  addWordsToPool,
  removeWordsFromPool,
  setWordSearchQuery,
  updateWordFilters,
  clearCurrentPool,
} from '@/src/store/slices/vocabularyPoolSlice';

export const useVocabularyPool = (poolId: string) => {
  const dispatch = useAppDispatch();
  const {
    currentPool,
    currentPoolLoading,
    currentPoolError,
    availableWords,
    availableWordsLoading,
    wordSearchQuery,
    wordFilters,
  } = useAppSelector(state => state.vocabularyPools);

  const loadPoolData = useCallback(() => {
    if (poolId) {
      dispatch(loadPool(poolId));
    }
  }, [dispatch, poolId]);

  const loadAvailableWordsData = useCallback(
    (query?: { search?: string; wordType?: string; section?: string }) => {
      dispatch(loadAvailableWords(query || { search: wordSearchQuery, ...wordFilters }));
    },
    [dispatch, wordSearchQuery, wordFilters]
  );

  const addWords = useCallback(
    async (wordDocIds: string[]) => {
      if (!poolId) return false;
      const result = await dispatch(addWordsToPool({ poolId, wordDocIds }));

      // Reload pool data to get updated words
      if (result.meta.requestStatus === 'fulfilled') {
        dispatch(loadPool(poolId));
      }

      return result.meta.requestStatus === 'fulfilled';
    },
    [dispatch, poolId]
  );

  const removeWords = useCallback(
    async (wordDocIds: string[]) => {
      if (!poolId) return false;
      const result = await dispatch(removeWordsFromPool({ poolId, wordDocIds }));

      // Reload pool data to get updated words
      if (result.meta.requestStatus === 'fulfilled') {
        dispatch(loadPool(poolId));
      }

      return result.meta.requestStatus === 'fulfilled';
    },
    [dispatch, poolId]
  );

  const setSearchQuery = useCallback(
    (query: string) => {
      dispatch(setWordSearchQuery(query));
    },
    [dispatch]
  );

  const updateFilters = useCallback(
    (filters: Partial<typeof wordFilters>) => {
      dispatch(updateWordFilters(filters));
    },
    [dispatch]
  );

  const clearPool = useCallback(() => {
    dispatch(clearCurrentPool());
  }, [dispatch]);

  // Auto-load pool when poolId changes
  useEffect(() => {
    loadPoolData();
    return () => {
      clearPool();
    };
  }, [loadPoolData, clearPool]);

  return {
    // Data
    pool: currentPool,
    loading: currentPoolLoading,
    error: currentPoolError,

    // Available words for adding
    availableWords,
    availableWordsLoading,
    wordSearchQuery,
    wordFilters,

    // Actions
    loadPool: loadPoolData,
    addWords,
    removeWords,
    loadAvailableWords: loadAvailableWordsData,
    setSearchQuery,
    updateFilters,
    clearPool,
  };
};
