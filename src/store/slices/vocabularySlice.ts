import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { VocabularyFilters } from '@/src/types/admin-vocabulary';

interface VocabularyState {
  filters: VocabularyFilters;
}

const initialState: VocabularyState = {
  filters: {
    wordType: 'all',
    coreType: null,
    search: '',
  },
};

const vocabularySlice = createSlice({
  name: 'vocabulary',
  initialState,
  reducers: {
    updateFilters: (state, action: PayloadAction<Partial<VocabularyState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    resetFilters: state => {
      state.filters = initialState.filters;
    },
  },
});

export const { updateFilters, resetFilters } = vocabularySlice.actions;

export const selectVocabularyFilters = (state: { vocabulary: VocabularyState }) => state.vocabulary.filters;

export default vocabularySlice.reducer;
