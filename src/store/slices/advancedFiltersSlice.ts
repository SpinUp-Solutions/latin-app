import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';
import type { PoolFilters } from '@/src/types/pool-filters';
import type { TableType } from '@/src/utils/schema-helpers';

interface AdvancedFiltersState {
  filters: PoolFilters & { limit: number | 'all' };
  pagination: {
    lastWordId: string | null;
  };
  selection: {
    selectedTableType: TableType | null;
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
    pronounType: 'all',
    pronounPerson: 'all',
    limit: 20,
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
      const updates = action.payload;
      state.filters = { ...state.filters, ...updates };

      if ('partOfSpeech' in updates) {
        state.selection.selectedTableType = deriveTableTypeFromPOS(updates.partOfSpeech) ?? null;
        state.selection.selectedCellPaths = [];
      }

      // The pronoun table shape depends on the selected type and person.
      if (('pronounType' in updates || 'pronounPerson' in updates) && state.filters.partOfSpeech === 'pronoun') {
        const { pronounType, pronounPerson } = state.filters;
        state.selection.selectedTableType =
          deriveTableTypeFromPOS(
            'pronoun',
            pronounType !== 'all' && pronounType.length === 1 ? pronounType[0] : undefined,
            pronounPerson !== 'all' && pronounPerson.length === 1 ? pronounPerson[0] : undefined
          ) ?? null;
        state.selection.selectedCellPaths = [];
      }
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
