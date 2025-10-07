import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface VocabularyPoolState {
  filters: {
    search: string;
    difficulty: string;
    tags: string[];
    isActive: boolean | null;
    sortBy: 'name' | 'createdAt' | 'wordCount';
    sortOrder: 'asc' | 'desc';
  };
  wordSearchQuery: string;
  wordFilters: {
    wordType: string;
    section: string;
  };
}

const initialState: VocabularyPoolState = {
  filters: {
    search: '',
    difficulty: '',
    tags: [],
    isActive: null,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  wordSearchQuery: '',
  wordFilters: {
    wordType: 'all',
    section: 'all',
  },
};

const vocabularyPoolSlice = createSlice({
  name: 'vocabularyPools',
  initialState,
  reducers: {
    updateFilters: (state, action: PayloadAction<Partial<VocabularyPoolState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    setWordSearchQuery: (state, action: PayloadAction<string>) => {
      state.wordSearchQuery = action.payload;
    },
    updateWordFilters: (state, action: PayloadAction<Partial<VocabularyPoolState['wordFilters']>>) => {
      state.wordFilters = { ...state.wordFilters, ...action.payload };
    },
    resetFilters: state => {
      state.filters = initialState.filters;
      state.wordSearchQuery = initialState.wordSearchQuery;
      state.wordFilters = initialState.wordFilters;
    },
  },
});

export const { updateFilters, setWordSearchQuery, updateWordFilters, resetFilters } = vocabularyPoolSlice.actions;

export default vocabularyPoolSlice.reducer;
