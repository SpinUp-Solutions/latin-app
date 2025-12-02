import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../index';

export const selectSelectedWordIds = (state: RootState) => state.vocabularyPools.wordSelection.selectedIds;

const selectSelectedWordsMap = (state: RootState) => state.vocabularyPools.wordSelection.selectedWordsMap;

export const selectSelectedWords = createSelector(
  [selectSelectedWordIds, selectSelectedWordsMap],
  (selectedIds, selectedWordsMap) => {
    return selectedIds.map(id => selectedWordsMap[id]).filter(Boolean);
  }
);

export const selectWordFilters = (state: RootState) => state.vocabularyPools.wordFilters;

export const selectPaginationCursor = (state: RootState) => state.vocabularyPools.wordSelection.paginationCursor;

export const selectFiltersExpanded = (state: RootState) => state.vocabularyPools.ui.filtersExpanded;
