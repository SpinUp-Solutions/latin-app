import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Word } from '@/src/types/admin-vocabulary';
import type { PoolFilters } from '@/src/types/pool-filters';

interface WordSelectionState {
  selectedIds: string[];
  selectedWordsMap: Record<string, Word>;
  paginationCursor: string | null;
}

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
  wordFilters: PoolFilters;
  wordSelection: WordSelectionState;
  ui: {
    filtersExpanded: boolean;
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
    partOfSpeech: 'all',
    search: '',
    verbConjugation: 'all',
    isDeponent: 'both',
    nounDeclension: 'all',
    adjectiveDeclension: 'all',
  },
  wordSelection: {
    selectedIds: [],
    selectedWordsMap: {},
    paginationCursor: null,
  },
  ui: {
    filtersExpanded: true,
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
    resetFilters: state => {
      state.filters = initialState.filters;
      state.wordSearchQuery = initialState.wordSearchQuery;
      state.wordFilters = initialState.wordFilters;
    },

    addWord: (state, action: PayloadAction<Word>) => {
      const word = action.payload;
      if (!state.wordSelection.selectedIds.includes(word.id)) {
        state.wordSelection.selectedIds.push(word.id);
        state.wordSelection.selectedWordsMap[word.id] = word;
      }
    },

    addWords: (state, action: PayloadAction<Word[]>) => {
      action.payload.forEach(word => {
        if (!state.wordSelection.selectedIds.includes(word.id)) {
          state.wordSelection.selectedIds.push(word.id);
          state.wordSelection.selectedWordsMap[word.id] = word;
        }
      });
    },

    removeWord: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      state.wordSelection.selectedIds = state.wordSelection.selectedIds.filter(i => i !== id);
      delete state.wordSelection.selectedWordsMap[id];
    },

    initializeSelection: (state, action: PayloadAction<{ ids: string[]; words: Word[] }>) => {
      state.wordSelection.selectedIds = action.payload.ids;
      state.wordSelection.selectedWordsMap = {};
      action.payload.words.forEach(word => {
        state.wordSelection.selectedWordsMap[word.id] = word;
      });
    },

    clearSelection: state => {
      state.wordSelection.selectedIds = [];
      state.wordSelection.selectedWordsMap = {};
    },

    setPaginationCursor: (state, action: PayloadAction<string | null>) => {
      state.wordSelection.paginationCursor = action.payload;
    },

    updateWordFilters: (state, action: PayloadAction<PoolFilters>) => {
      state.wordFilters = action.payload;
      state.wordSelection.paginationCursor = null;
    },

    resetWordFilters: state => {
      state.wordFilters = initialState.wordFilters;
      state.wordSelection.paginationCursor = null;
    },

    setFiltersExpanded: (state, action: PayloadAction<boolean>) => {
      state.ui.filtersExpanded = action.payload;
    },
  },
});

export const {
  updateFilters,
  setWordSearchQuery,
  resetFilters,
  addWord,
  addWords,
  removeWord,
  initializeSelection,
  clearSelection,
  setPaginationCursor,
  updateWordFilters,
  resetWordFilters,
  setFiltersExpanded,
} = vocabularyPoolSlice.actions;

export default vocabularyPoolSlice.reducer;
