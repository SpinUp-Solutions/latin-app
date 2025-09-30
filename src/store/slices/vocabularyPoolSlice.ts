import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { VocabularyPool, VocabularyPoolWithWords, CreatePoolRequest } from '@/src/types/vocabulary-pool';
import { Word } from '@/src/types/admin-vocabulary';

interface VocabularyPoolState {
  // Pool list management
  pools: VocabularyPool[];
  poolsLoading: boolean;
  poolsError: string | null;
  poolsPagination: {
    hasMore: boolean;
    lastPoolId: string | null;
    total: number;
  };

  // Current pool management
  currentPool: VocabularyPoolWithWords | null;
  currentPoolLoading: boolean;
  currentPoolError: string | null;

  // Pool words management
  availableWords: Word[];
  availableWordsLoading: boolean;
  wordSearchQuery: string;
  wordFilters: {
    wordType: string;
    section: string;
  };

  // UI state
  filters: {
    search: string;
    difficulty: string;
    tags: string[];
    isActive: boolean | null;
    sortBy: 'name' | 'createdAt' | 'wordCount';
    sortOrder: 'asc' | 'desc';
  };

  // Form state
  creatingPool: boolean;
  updatingPool: boolean;
  deletingPool: boolean;
}

const initialState: VocabularyPoolState = {
  pools: [],
  poolsLoading: false,
  poolsError: null,
  poolsPagination: {
    hasMore: true,
    lastPoolId: null,
    total: 0,
  },

  currentPool: null,
  currentPoolLoading: false,
  currentPoolError: null,

  availableWords: [],
  availableWordsLoading: false,
  wordSearchQuery: '',
  wordFilters: {
    wordType: 'all',
    section: 'all',
  },

  filters: {
    search: '',
    difficulty: '',
    tags: [],
    isActive: null,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },

  creatingPool: false,
  updatingPool: false,
  deletingPool: false,
};

// Async thunks
export const loadPools = createAsyncThunk(
  'vocabularyPools/loadPools',
  async (
    {
      reset = false,
      filters,
    }: {
      reset?: boolean;
      filters?: {
        search?: string;
        difficulty?: string;
        tags?: string[];
        isActive?: boolean | null;
        sortBy?: 'name' | 'createdAt' | 'wordCount';
        sortOrder?: 'asc' | 'desc';
      };
    },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as { vocabularyPools: VocabularyPoolState };

      const params = new URLSearchParams({
        limit: '20',
      });

      if (!reset && state.vocabularyPools.poolsPagination.lastPoolId) {
        params.append('lastPoolId', state.vocabularyPools.poolsPagination.lastPoolId);
      }

      if (filters?.search) params.append('search', filters.search);
      if (filters?.difficulty) params.append('difficulty', filters.difficulty);
      if (filters?.isActive !== null && filters?.isActive !== undefined) {
        params.append('isActive', filters.isActive.toString());
      }

      const response = await fetch(`/api/admin/vocabulary-pools?${params}`);
      const data = await response.json();

      if (!data.success) {
        return rejectWithValue(data.error);
      }

      return { ...data.data, reset };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

export const loadPool = createAsyncThunk('vocabularyPools/loadPool', async (poolId: string, { rejectWithValue }) => {
  try {
    const response = await fetch(`/api/admin/vocabulary-pools/${poolId}`);
    const data = await response.json();

    if (!data.success) {
      return rejectWithValue(data.error);
    }

    return data.data.pool;
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
  }
});

export const createPool = createAsyncThunk(
  'vocabularyPools/createPool',
  async (poolData: CreatePoolRequest, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/admin/vocabulary-pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(poolData),
      });

      const data = await response.json();

      if (!data.success) {
        return rejectWithValue(data.error);
      }

      return data.data.pool;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

export const updatePool = createAsyncThunk(
  'vocabularyPools/updatePool',
  async ({ id, data }: { id: string; data: Partial<VocabularyPool> }, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/admin/vocabulary-pools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!result.success) {
        return rejectWithValue(result.error);
      }

      return result.data.pool;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

export const deletePool = createAsyncThunk(
  'vocabularyPools/deletePool',
  async (poolId: string, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/admin/vocabulary-pools/${poolId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!data.success) {
        return rejectWithValue(data.error);
      }

      return poolId;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

export const addWordsToPool = createAsyncThunk(
  'vocabularyPools/addWordsToPool',
  async ({ poolId, wordDocIds }: { poolId: string; wordDocIds: string[] }, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/admin/vocabulary-pools/${poolId}/words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordDocIds }),
      });

      const data = await response.json();

      if (!data.success) {
        return rejectWithValue(data.error);
      }

      return data.data;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

export const removeWordsFromPool = createAsyncThunk(
  'vocabularyPools/removeWordsFromPool',
  async ({ poolId, wordDocIds }: { poolId: string; wordDocIds: string[] }, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/admin/vocabulary-pools/${poolId}/words`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordDocIds }),
      });

      const data = await response.json();

      if (!data.success) {
        return rejectWithValue(data.error);
      }

      return data.data;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

export const loadAvailableWords = createAsyncThunk(
  'vocabularyPools/loadAvailableWords',
  async (query: { search?: string; wordType?: string; section?: string }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams({ limit: '100' });

      if (query.search) params.append('search', query.search);
      if (query.wordType && query.wordType !== 'all') params.append('wordType', query.wordType);
      if (query.section && query.section !== 'all') params.append('section', query.section);

      const response = await fetch(`/api/admin/words?${params}`);
      const data = await response.json();

      if (!data.success) {
        return rejectWithValue(data.error);
      }

      return data.data.words;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

const vocabularyPoolSlice = createSlice({
  name: 'vocabularyPools',
  initialState,
  reducers: {
    updateFilters: (state, action: PayloadAction<Partial<VocabularyPoolState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    clearCurrentPool: state => {
      state.currentPool = null;
      state.currentPoolError = null;
    },

    setWordSearchQuery: (state, action: PayloadAction<string>) => {
      state.wordSearchQuery = action.payload;
    },

    updateWordFilters: (state, action: PayloadAction<Partial<VocabularyPoolState['wordFilters']>>) => {
      state.wordFilters = { ...state.wordFilters, ...action.payload };
    },

    resetPoolState: state => {
      Object.assign(state, initialState);
    },
  },
  extraReducers: builder => {
    // Load pools
    builder
      .addCase(loadPools.pending, state => {
        state.poolsLoading = true;
        state.poolsError = null;
      })
      .addCase(loadPools.fulfilled, (state, action) => {
        state.poolsLoading = false;
        const { pools, total, hasMore, lastPoolId, reset } = action.payload;

        if (reset) {
          state.pools = pools;
        } else {
          state.pools.push(...pools);
        }

        state.poolsPagination = {
          total,
          hasMore,
          lastPoolId,
        };
      })
      .addCase(loadPools.rejected, (state, action) => {
        state.poolsLoading = false;
        state.poolsError = action.payload as string;
      });

    // Load single pool
    builder
      .addCase(loadPool.pending, state => {
        state.currentPoolLoading = true;
        state.currentPoolError = null;
      })
      .addCase(loadPool.fulfilled, (state, action) => {
        state.currentPoolLoading = false;
        state.currentPool = action.payload;
      })
      .addCase(loadPool.rejected, (state, action) => {
        state.currentPoolLoading = false;
        state.currentPoolError = action.payload as string;
      });

    // Create pool
    builder
      .addCase(createPool.pending, state => {
        state.creatingPool = true;
      })
      .addCase(createPool.fulfilled, (state, action) => {
        state.creatingPool = false;
        state.pools.unshift(action.payload);
      })
      .addCase(createPool.rejected, state => {
        state.creatingPool = false;
      });

    // Update pool
    builder
      .addCase(updatePool.pending, state => {
        state.updatingPool = true;
      })
      .addCase(updatePool.fulfilled, (state, action) => {
        state.updatingPool = false;
        const updatedPool = action.payload;

        // Update in pools list
        const index = state.pools.findIndex(p => p.id === updatedPool.id);
        if (index !== -1) {
          state.pools[index] = updatedPool;
        }

        // Update current pool if it's the same
        if (state.currentPool && state.currentPool.id === updatedPool.id) {
          state.currentPool = { ...state.currentPool, ...updatedPool };
        }
      })
      .addCase(updatePool.rejected, state => {
        state.updatingPool = false;
      });

    // Delete pool
    builder
      .addCase(deletePool.pending, state => {
        state.deletingPool = true;
      })
      .addCase(deletePool.fulfilled, (state, action) => {
        state.deletingPool = false;
        const deletedPoolId = action.payload;

        state.pools = state.pools.filter(p => p.id !== deletedPoolId);

        if (state.currentPool && state.currentPool.id === deletedPoolId) {
          state.currentPool = null;
        }
      })
      .addCase(deletePool.rejected, state => {
        state.deletingPool = false;
      });

    // Add words to pool
    builder.addCase(addWordsToPool.fulfilled, (state, action) => {
      const { pool } = action.payload;

      // Update pools list
      const index = state.pools.findIndex(p => p.id === pool.id);
      if (index !== -1) {
        state.pools[index] = pool;
      }

      // Mark current pool as needing reload
      if (state.currentPool && state.currentPool.id === pool.id) {
        state.currentPoolLoading = true;
      }
    });

    // Remove words from pool
    builder.addCase(removeWordsFromPool.fulfilled, (state, action) => {
      const { pool } = action.payload;

      // Update pools list
      const index = state.pools.findIndex(p => p.id === pool.id);
      if (index !== -1) {
        state.pools[index] = pool;
      }

      // Mark current pool as needing reload
      if (state.currentPool && state.currentPool.id === pool.id) {
        state.currentPoolLoading = true;
      }
    });

    // Load available words
    builder
      .addCase(loadAvailableWords.pending, state => {
        state.availableWordsLoading = true;
      })
      .addCase(loadAvailableWords.fulfilled, (state, action) => {
        state.availableWordsLoading = false;
        state.availableWords = action.payload;
      })
      .addCase(loadAvailableWords.rejected, state => {
        state.availableWordsLoading = false;
      });
  },
});

export const { updateFilters, clearCurrentPool, setWordSearchQuery, updateWordFilters, resetPoolState } =
  vocabularyPoolSlice.actions;

export default vocabularyPoolSlice.reducer;
