import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';
import type { PartOfSpeech, NounDeclension, AdjectiveDeclension } from '@/src/types/vocabulary/schemas/enums';
import type { VerbConjugation } from '@/src/types/vocabulary/schemas/verb-conjugation';

interface AdvancedFiltersState {
  filters: {
    partOfSpeech: PartOfSpeech | 'all';
    search: string;
    verbConjugation: VerbConjugation | 'all';
    isDeponent: 'true' | 'false' | 'both';
    nounDeclension: NounDeclension | 'all';
    adjectiveDeclension: AdjectiveDeclension | 'all';
  };
  pagination: {
    lastWordId: string | null;
  };
  selection: {
    selectedTableType: 'conjugation' | 'declension' | 'adjective-declension' | null;
    selectedCellPaths: string[];
  };
}

const initialState: AdvancedFiltersState = {
  filters: {
    partOfSpeech: 'all',
    search: '',
    verbConjugation: 'all',
    isDeponent: 'both',
    nounDeclension: 'all',
    adjectiveDeclension: 'all',
  },
  pagination: {
    lastWordId: null,
  },
  selection: {
    selectedTableType: null,
    selectedCellPaths: [],
  },
};

const advancedFiltersSlice = createSlice({
  name: 'advancedFilters',
  initialState,
  reducers: {
    updateFilters: (state, action: PayloadAction<Partial<AdvancedFiltersState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };

      // Update selectedTableType if partOfSpeech is being changed
      if ('partOfSpeech' in action.payload) {
        const pos = action.payload.partOfSpeech;
        if (pos === 'verb') {
          state.selection.selectedTableType = 'conjugation';
        } else if (pos === 'noun') {
          state.selection.selectedTableType = 'declension';
        } else if (pos === 'adjective') {
          state.selection.selectedTableType = 'adjective-declension';
        } else {
          state.selection.selectedTableType = null;
        }
        // Clear cell selection when part of speech changes
        state.selection.selectedCellPaths = [];
      }
    },
    setPartOfSpeech: (state, action: PayloadAction<PartOfSpeech | 'all'>) => {
      state.filters.partOfSpeech = action.payload;
      state.filters.verbConjugation = 'all';
      state.filters.isDeponent = 'both';
      state.filters.nounDeclension = 'all';
      state.filters.adjectiveDeclension = 'all';

      if (action.payload === 'verb') {
        state.selection.selectedTableType = 'conjugation';
      } else if (action.payload === 'noun') {
        state.selection.selectedTableType = 'declension';
      } else if (action.payload === 'adjective') {
        state.selection.selectedTableType = 'adjective-declension';
      } else {
        state.selection.selectedTableType = null;
      }
      state.selection.selectedCellPaths = [];
    },
    resetFilters: state => {
      state.filters = initialState.filters;
      state.pagination.lastWordId = null;
      state.selection = initialState.selection;
    },
    setLastWordId: (state, action: PayloadAction<string | null>) => {
      state.pagination.lastWordId = action.payload;
    },
    toggleCellPath: (state, action: PayloadAction<string>) => {
      const index = state.selection.selectedCellPaths.indexOf(action.payload);
      if (index === -1) {
        state.selection.selectedCellPaths.push(action.payload);
      } else {
        state.selection.selectedCellPaths.splice(index, 1);
      }
    },
    addCellPaths: (state, action: PayloadAction<string[]>) => {
      const newPaths = action.payload.filter(p => !state.selection.selectedCellPaths.includes(p));
      state.selection.selectedCellPaths.push(...newPaths);
    },
    removeCellPaths: (state, action: PayloadAction<string[]>) => {
      state.selection.selectedCellPaths = state.selection.selectedCellPaths.filter(p => !action.payload.includes(p));
    },
    clearSelection: state => {
      state.selection.selectedCellPaths = [];
    },
  },
});

export const {
  updateFilters,
  setPartOfSpeech,
  resetFilters,
  setLastWordId,
  toggleCellPath,
  addCellPaths,
  removeCellPaths,
  clearSelection,
} = advancedFiltersSlice.actions;

export const selectAdvancedFilters = (state: RootState) => state.advancedFilters.filters;
export const selectAdvancedPagination = (state: RootState) => state.advancedFilters.pagination;
export const selectAdvancedSelection = (state: RootState) => state.advancedFilters.selection;

export default advancedFiltersSlice.reducer;
