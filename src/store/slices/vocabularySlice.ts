import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface VocabularyState {
  filters: {
    wordType: string;
    section: string;
    search: string;
  };
}

const initialState: VocabularyState = {
  filters: {
    wordType: 'all',
    section: 'all',
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
