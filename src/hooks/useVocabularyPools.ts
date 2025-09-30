import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  loadPools,
  createPool,
  updatePool,
  deletePool,
  updateFilters,
  resetPoolState,
} from '@/src/store/slices/vocabularyPoolSlice';
import type { CreatePoolRequest, VocabularyPool } from '@/src/types/vocabulary-pool';

export const useVocabularyPools = () => {
  const dispatch = useAppDispatch();
  const { pools, poolsLoading, poolsError, poolsPagination, filters, creatingPool, updatingPool, deletingPool } =
    useAppSelector(state => state.vocabularyPools);

  const loadPoolsData = useCallback(
    (reset = false) => {
      dispatch(loadPools({ reset, filters }));
    },
    [dispatch, filters]
  );

  const loadMorePools = useCallback(() => {
    if (poolsPagination.hasMore && !poolsLoading) {
      dispatch(loadPools({ reset: false, filters }));
    }
  }, [dispatch, poolsPagination.hasMore, poolsLoading, filters]);

  const createPoolData = useCallback(
    async (poolData: CreatePoolRequest) => {
      const result = await dispatch(createPool(poolData));
      return result.meta.requestStatus === 'fulfilled';
    },
    [dispatch]
  );

  const updatePoolData = useCallback(
    async (id: string, data: Partial<VocabularyPool>) => {
      const result = await dispatch(updatePool({ id, data }));
      return result.meta.requestStatus === 'fulfilled';
    },
    [dispatch]
  );

  const deletePoolData = useCallback(
    async (poolId: string) => {
      const result = await dispatch(deletePool(poolId));
      return result.meta.requestStatus === 'fulfilled';
    },
    [dispatch]
  );

  const updateFiltersData = useCallback(
    (newFilters: Partial<typeof filters>) => {
      dispatch(updateFilters(newFilters));
    },
    [dispatch]
  );

  const resetState = useCallback(() => {
    dispatch(resetPoolState());
  }, [dispatch]);

  return {
    // Data
    pools,
    loading: poolsLoading,
    error: poolsError,
    pagination: poolsPagination,
    filters,

    // Loading states
    creating: creatingPool,
    updating: updatingPool,
    deleting: deletingPool,

    // Actions
    loadPools: loadPoolsData,
    loadMorePools,
    createPool: createPoolData,
    updatePool: updatePoolData,
    deletePool: deletePoolData,
    updateFilters: updateFiltersData,
    resetState,
  };
};
