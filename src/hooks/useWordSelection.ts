import { useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { useDebounce } from './useDebounce';
import { useGetWordsForPoolSelectionQuery } from '@/src/store/api/vocabularyPoolApi';
import {
  addWord,
  addWords,
  removeWord,
  initializeSelection,
  clearSelection,
  setPaginationCursor,
  updateWordFilters,
  resetWordFilters,
  setFiltersExpanded,
} from '@/src/store/slices/vocabularyPoolSlice';
import {
  selectSelectedWordIds,
  selectSelectedWords,
  selectWordFilters,
  selectPaginationCursor,
  selectFiltersExpanded,
} from '@/src/store/selectors/vocabularyPoolSelectors';
import { cascadeFilterUpdates } from '@/src/utils/wordFilters';
import type { Word } from '@/src/types/admin-vocabulary';
import type { PoolFilters } from '@/src/types/pool-filters';

export const useWordSelection = () => {
  const dispatch = useAppDispatch();

  const selectedIds = useAppSelector(selectSelectedWordIds);
  const selectedWords = useAppSelector(selectSelectedWords);
  const filters = useAppSelector(selectWordFilters);
  const paginationCursor = useAppSelector(selectPaginationCursor);
  const filtersExpanded = useAppSelector(selectFiltersExpanded);

  const debouncedSearch = useDebounce(filters.search || '', 300);
  const debouncedFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filters.partOfSpeech,
      filters.verbConjugation,
      filters.isDeponent,
      filters.nounDeclension,
      filters.adjectiveDeclension,
      filters.pronounType,
      filters.pronounPerson,
      debouncedSearch,
    ]
  );

  const { data, isLoading, isFetching } = useGetWordsForPoolSelectionQuery({
    filters: debouncedFilters,
    limit: 50,
    lastWordId: paginationCursor,
  });

  const availableWords = useMemo(() => {
    if (!data?.words) return [];
    return data.words.filter(word => !selectedIds.includes(word.id));
  }, [data?.words, selectedIds]);

  const handleAddWord = useCallback(
    (word: Word) => {
      dispatch(addWord(word));
    },
    [dispatch]
  );

  const handleAddAllVisible = useCallback(
    (words: Word[] = availableWords) => {
      dispatch(addWords(words));
    },
    [dispatch, availableWords]
  );

  const handleRemoveWord = useCallback(
    (wordId: string) => {
      dispatch(removeWord(wordId));
    },
    [dispatch]
  );

  const handleLoadMore = useCallback(() => {
    if (data?.lastWordId && !isFetching) {
      dispatch(setPaginationCursor(data.lastWordId));
    }
  }, [dispatch, data?.lastWordId, isFetching]);

  const handleUpdateFilters = useCallback(
    (updates: Partial<PoolFilters>) => {
      const cleanedFilters = cascadeFilterUpdates(filters, updates);
      dispatch(updateWordFilters(cleanedFilters));
    },
    [dispatch, filters]
  );

  const handleResetFilters = useCallback(() => {
    dispatch(resetWordFilters());
  }, [dispatch]);

  const handleInitialize = useCallback(
    (ids: string[], words: Word[]) => {
      dispatch(initializeSelection({ ids, words }));
    },
    [dispatch]
  );

  const handleClear = useCallback(() => {
    dispatch(clearSelection());
  }, [dispatch]);

  const handleToggleFilters = useCallback(() => {
    dispatch(setFiltersExpanded(!filtersExpanded));
  }, [dispatch, filtersExpanded]);

  return {
    selectedIds,
    selectedWords,
    availableWords,
    filters,
    debouncedFilters,
    filtersExpanded,
    hasMore: data?.hasMore ?? false,
    isLoading,
    isFetching,

    addWord: handleAddWord,
    addAllVisible: handleAddAllVisible,
    removeWord: handleRemoveWord,
    loadMore: handleLoadMore,
    updateFilters: handleUpdateFilters,
    resetFilters: handleResetFilters,
    initialize: handleInitialize,
    clear: handleClear,
    toggleFilters: handleToggleFilters,
  };
};
