# Vocabulary Pools Implementation Plan

## 📋 Overview

This document outlines the complete implementation plan for the **Vocabulary Pools System** - a separate vocabulary management system that allows admins to create curated word collections and assign them to lessons.

**Key Principles:**
- Completely separate from existing vocabulary management (`/admin/vocabulary`)
- Pools reference word documents by Firestore document ID
- Lessons reference pools by Firestore document ID
- Single pool per lesson via `vocabulary_pool` field

---

## 🏗️ Data Architecture

### Firestore Collections

#### Existing Collections (No Changes)
```typescript
// words/{wordDocId} - UNCHANGED
{
  word: string,
  translation: string,
  wordType: string,
  grammaticalInfo: string,
  // ... other existing fields
}
```

#### New Collections

```typescript
// vocabulary_pools/{poolDocId} - NEW
{
  name: string,                    // "Lesson 1 Core Vocabulary"
  description: string,             // "Essential words for first lesson"
  wordDocIds: string[],           // ["Mx7kF9...", "Nq8pL2...", "Or9mK3..."]
  metadata: {
    createdAt: Timestamp,
    createdBy: string,            // Admin user UID
    updatedAt: Timestamp, 
    updatedBy: string,
    wordCount: number,            // Cached for performance
    isActive: boolean,            // Can be disabled
    tags: string[],               // ["beginner", "nouns", "family"]
    difficulty: "beginner" | "intermediate" | "advanced"
  }
}
```

#### Updated Collections

```typescript
// lessons/{lessonId} - UPDATED
{
  id: string,
  title: string,
  description?: string,
  vocabulary_pool?: string,        // NEW: References vocabulary_pools/{poolDocId}
  introduction: IntroductionPage[],
  exercises: ExercisePage[]
}
```

---

## 📁 File Structure & Implementation

### Type Definitions

#### `src/types/vocabulary-pool.d.ts` - NEW
```typescript
export interface VocabularyPool {
  id: string;                     // Firestore doc ID
  name: string;
  description: string;
  wordDocIds: string[];           // Array of word document IDs
  metadata: VocabularyPoolMetadata;
}

export interface VocabularyPoolMetadata {
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  wordCount: number;
  isActive: boolean;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export interface VocabularyPoolWithWords extends VocabularyPool {
  words: Word[];                  // Populated from wordDocIds
}

export interface VocabularyPoolsResponse {
  success: boolean;
  data: {
    pools: VocabularyPool[];
    total: number;
    hasMore: boolean;
    lastPoolId: string | null;
  };
}

export interface VocabularyPoolResponse {
  success: boolean;
  data: {
    pool: VocabularyPoolWithWords;
  };
}

export interface CreatePoolRequest {
  name: string;
  description: string;
  wordDocIds?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  tags?: string[];
}

export interface AddWordsRequest {
  wordDocIds: string[];
  skipDuplicates?: boolean;
}

export interface AddWordsResponse {
  success: boolean;
  data: {
    addedCount: number;
    duplicateCount: number;
    invalidIds: string[];
    pool: VocabularyPool;
  };
}
```

#### `src/types/lesson.d.ts` - UPDATED
```typescript
// ADD this field to existing Lesson interface
export interface Lesson {
  id: string;
  title: string;
  description?: string;
  vocabulary_pool?: string;       // NEW: Single pool reference
  introduction: IntroductionPage[];
  exercises: ExercisePage[];
}

// NEW: Extended lesson type for UI
export interface LessonWithVocabularyPool extends Lesson {
  vocabularyPoolData?: VocabularyPoolWithWords;
}
```

### API Endpoints

#### `src/app/api/admin/vocabulary-pools/route.ts` - NEW
```typescript
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Query params: ?limit=20&lastPoolId=xyz&search=lesson&difficulty=beginner&tags=nouns,verbs&isActive=true
  // Features:
  // - Paginated pool list
  // - Search by name/description
  // - Filter by difficulty, tags, active status
  // - Sort by name, createdAt, wordCount
  
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const lastPoolId = searchParams.get('lastPoolId');
    const search = searchParams.get('search');
    const difficulty = searchParams.get('difficulty');
    const tags = searchParams.get('tags')?.split(',');
    const isActive = searchParams.get('isActive') === 'true';
    
    let query: Query = adminDb.collection('vocabulary_pools').orderBy('createdAt', 'desc');
    
    // Apply filters
    if (search) {
      // Implement search logic
    }
    if (difficulty) {
      query = query.where('metadata.difficulty', '==', difficulty);
    }
    if (isActive !== undefined) {
      query = query.where('metadata.isActive', '==', isActive);
    }
    
    // Apply pagination
    if (lastPoolId) {
      const lastDoc = await adminDb.collection('vocabulary_pools').doc(lastPoolId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    query = query.limit(limit);
    const snapshot = await query.get();
    
    const pools = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        pools,
        total: pools.length,
        hasMore: snapshot.docs.length === limit,
        lastPoolId: pools[pools.length - 1]?.id || null,
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Create new pool
  // Body: CreatePoolRequest
  
  try {
    const { name, description, wordDocIds = [], difficulty, tags = [] } = await request.json();
    
    // Validation
    if (!name || !description) {
      return NextResponse.json(
        { success: false, error: 'Name and description are required' },
        { status: 400 }
      );
    }
    
    // Get current user from auth
    const user = await getCurrentUser(request);
    
    const poolData = {
      name,
      description,
      wordDocIds,
      metadata: {
        createdAt: new Date(),
        createdBy: user.uid,
        updatedAt: new Date(),
        updatedBy: user.uid,
        wordCount: wordDocIds.length,
        isActive: true,
        tags,
        difficulty: difficulty || 'beginner'
      }
    };
    
    const docRef = await adminDb.collection('vocabulary_pools').add(poolData);
    
    return NextResponse.json({
      success: true,
      data: {
        pool: {
          id: docRef.id,
          ...poolData
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

#### `src/app/api/admin/vocabulary-pools/[poolId]/route.ts` - NEW
```typescript
export async function GET(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  // Get single pool with populated words
  
  try {
    const { poolId } = params;
    
    // Get pool data
    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Pool not found' },
        { status: 404 }
      );
    }
    
    const pool = { id: poolDoc.id, ...poolDoc.data() } as VocabularyPool;
    
    // Populate words
    const words: Word[] = [];
    if (pool.wordDocIds.length > 0) {
      // Batch get words (Firestore allows up to 10 docs per batch)
      const batches = [];
      for (let i = 0; i < pool.wordDocIds.length; i += 10) {
        const batch = pool.wordDocIds.slice(i, i + 10);
        batches.push(
          adminDb.collection('words').where(FieldPath.documentId(), 'in', batch).get()
        );
      }
      
      const batchResults = await Promise.all(batches);
      batchResults.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          words.push({ id: doc.id, ...doc.data() } as Word);
        });
      });
    }
    
    return NextResponse.json({
      success: true,
      data: {
        pool: {
          ...pool,
          words
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  // Update pool metadata
  
  try {
    const { poolId } = params;
    const updates = await request.json();
    const user = await getCurrentUser(request);
    
    const updateData = {
      ...updates,
      'metadata.updatedAt': new Date(),
      'metadata.updatedBy': user.uid
    };
    
    if (updates.wordDocIds) {
      updateData['metadata.wordCount'] = updates.wordDocIds.length;
    }
    
    await adminDb.collection('vocabulary_pools').doc(poolId).update(updateData);
    
    const updatedDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    
    return NextResponse.json({
      success: true,
      data: {
        pool: { id: updatedDoc.id, ...updatedDoc.data() }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  // Delete pool
  
  try {
    const { poolId } = params;
    
    // Check if pool is used by any lessons
    const lessonsQuery = await adminDb.collection('lessons')
      .where('vocabulary_pool', '==', poolId)
      .limit(1)
      .get();
    
    if (!lessonsQuery.empty) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete pool that is assigned to lessons' },
        { status: 400 }
      );
    }
    
    await adminDb.collection('vocabulary_pools').doc(poolId).delete();
    
    return NextResponse.json({
      success: true,
      message: 'Pool deleted successfully'
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

#### `src/app/api/admin/vocabulary-pools/[poolId]/words/route.ts` - NEW
```typescript
export async function POST(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  // Add words to pool
  
  try {
    const { poolId } = params;
    const { wordDocIds, skipDuplicates = true } = await request.json();
    
    // Get current pool
    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Pool not found' },
        { status: 404 }
      );
    }
    
    const pool = poolDoc.data() as VocabularyPool;
    let currentWordIds = pool.wordDocIds || [];
    
    // Validate word IDs exist
    const invalidIds: string[] = [];
    const validIds: string[] = [];
    
    for (const wordId of wordDocIds) {
      const wordDoc = await adminDb.collection('words').doc(wordId).get();
      if (wordDoc.exists) {
        validIds.push(wordId);
      } else {
        invalidIds.push(wordId);
      }
    }
    
    // Handle duplicates
    const newIds = skipDuplicates 
      ? validIds.filter(id => !currentWordIds.includes(id))
      : validIds;
    
    const duplicateCount = validIds.length - newIds.length;
    
    // Update pool
    const updatedWordIds = [...currentWordIds, ...newIds];
    const user = await getCurrentUser(request);
    
    await adminDb.collection('vocabulary_pools').doc(poolId).update({
      wordDocIds: updatedWordIds,
      'metadata.wordCount': updatedWordIds.length,
      'metadata.updatedAt': new Date(),
      'metadata.updatedBy': user.uid
    });
    
    return NextResponse.json({
      success: true,
      data: {
        addedCount: newIds.length,
        duplicateCount,
        invalidIds,
        pool: {
          ...pool,
          wordDocIds: updatedWordIds,
          metadata: {
            ...pool.metadata,
            wordCount: updatedWordIds.length
          }
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { poolId: string } }): Promise<NextResponse> {
  // Remove words from pool
  
  try {
    const { poolId } = params;
    const { wordDocIds } = await request.json();
    
    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Pool not found' },
        { status: 404 }
      );
    }
    
    const pool = poolDoc.data() as VocabularyPool;
    const currentWordIds = pool.wordDocIds || [];
    
    const updatedWordIds = currentWordIds.filter(id => !wordDocIds.includes(id));
    const removedCount = currentWordIds.length - updatedWordIds.length;
    
    const user = await getCurrentUser(request);
    
    await adminDb.collection('vocabulary_pools').doc(poolId).update({
      wordDocIds: updatedWordIds,
      'metadata.wordCount': updatedWordIds.length,
      'metadata.updatedAt': new Date(),
      'metadata.updatedBy': user.uid
    });
    
    return NextResponse.json({
      success: true,
      data: {
        removedCount,
        pool: {
          ...pool,
          wordDocIds: updatedWordIds,
          metadata: {
            ...pool.metadata,
            wordCount: updatedWordIds.length
          }
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### State Management

#### `src/store/slices/vocabularyPoolSlice.ts` - NEW
```typescript
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
  async ({ reset = false, filters }: { reset?: boolean; filters?: any }, { getState, rejectWithValue }) => {
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
      if (filters?.isActive !== null) params.append('isActive', filters.isActive.toString());
      
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

export const loadPool = createAsyncThunk(
  'vocabularyPools/loadPool',
  async (poolId: string, { rejectWithValue }) => {
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
  }
);

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
    
    clearCurrentPool: (state) => {
      state.currentPool = null;
      state.currentPoolError = null;
    },
    
    setWordSearchQuery: (state, action: PayloadAction<string>) => {
      state.wordSearchQuery = action.payload;
    },
    
    updateWordFilters: (state, action: PayloadAction<Partial<VocabularyPoolState['wordFilters']>>) => {
      state.wordFilters = { ...state.wordFilters, ...action.payload };
    },
    
    resetPoolState: (state) => {
      Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // Load pools
    builder
      .addCase(loadPools.pending, (state) => {
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
      .addCase(loadPool.pending, (state) => {
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
      .addCase(createPool.pending, (state) => {
        state.creatingPool = true;
      })
      .addCase(createPool.fulfilled, (state, action) => {
        state.creatingPool = false;
        state.pools.unshift(action.payload);
      })
      .addCase(createPool.rejected, (state) => {
        state.creatingPool = false;
      });
      
    // Update pool
    builder
      .addCase(updatePool.pending, (state) => {
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
      .addCase(updatePool.rejected, (state) => {
        state.updatingPool = false;
      });
      
    // Delete pool
    builder
      .addCase(deletePool.pending, (state) => {
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
      .addCase(deletePool.rejected, (state) => {
        state.deletingPool = false;
      });
      
    // Add words to pool
    builder
      .addCase(addWordsToPool.fulfilled, (state, action) => {
        const { pool } = action.payload;
        
        // Update pools list
        const index = state.pools.findIndex(p => p.id === pool.id);
        if (index !== -1) {
          state.pools[index] = pool;
        }
        
        // Update current pool
        if (state.currentPool && state.currentPool.id === pool.id) {
          // Reload current pool to get updated words
          state.currentPoolLoading = true;
        }
      });
      
    // Remove words from pool
    builder
      .addCase(removeWordsFromPool.fulfilled, (state, action) => {
        const { pool } = action.payload;
        
        // Update pools list
        const index = state.pools.findIndex(p => p.id === pool.id);
        if (index !== -1) {
          state.pools[index] = pool;
        }
        
        // Update current pool
        if (state.currentPool && state.currentPool.id === pool.id) {
          // Reload current pool to get updated words
          state.currentPoolLoading = true;
        }
      });
      
    // Load available words
    builder
      .addCase(loadAvailableWords.pending, (state) => {
        state.availableWordsLoading = true;
      })
      .addCase(loadAvailableWords.fulfilled, (state, action) => {
        state.availableWordsLoading = false;
        state.availableWords = action.payload;
      })
      .addCase(loadAvailableWords.rejected, (state) => {
        state.availableWordsLoading = false;
      });
  },
});

export const {
  updateFilters,
  clearCurrentPool,
  setWordSearchQuery,
  updateWordFilters,
  resetPoolState,
} = vocabularyPoolSlice.actions;

export default vocabularyPoolSlice.reducer;
```

### Custom Hooks

#### `src/hooks/useVocabularyPools.ts` - NEW
```typescript
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
  const {
    pools,
    poolsLoading,
    poolsError,
    poolsPagination,
    filters,
    creatingPool,
    updatingPool,
    deletingPool,
  } = useAppSelector(state => state.vocabularyPools);

  const loadPoolsData = useCallback((reset = false) => {
    dispatch(loadPools({ reset, filters }));
  }, [dispatch, filters]);

  const loadMorePools = useCallback(() => {
    if (poolsPagination.hasMore && !poolsLoading) {
      dispatch(loadPools({ reset: false, filters }));
    }
  }, [dispatch, poolsPagination.hasMore, poolsLoading, filters]);

  const createPoolData = useCallback(async (poolData: CreatePoolRequest) => {
    const result = await dispatch(createPool(poolData));
    return result.meta.requestStatus === 'fulfilled';
  }, [dispatch]);

  const updatePoolData = useCallback(async (id: string, data: Partial<VocabularyPool>) => {
    const result = await dispatch(updatePool({ id, data }));
    return result.meta.requestStatus === 'fulfilled';
  }, [dispatch]);

  const deletePoolData = useCallback(async (poolId: string) => {
    const result = await dispatch(deletePool(poolId));
    return result.meta.requestStatus === 'fulfilled';
  }, [dispatch]);

  const updateFiltersData = useCallback((newFilters: Partial<typeof filters>) => {
    dispatch(updateFilters(newFilters));
  }, [dispatch]);

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
```

#### `src/hooks/useVocabularyPool.ts` - NEW
```typescript
import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  loadPool,
  loadAvailableWords,
  addWordsToPool,
  removeWordsFromPool,
  setWordSearchQuery,
  updateWordFilters,
  clearCurrentPool,
} from '@/src/store/slices/vocabularyPoolSlice';

export const useVocabularyPool = (poolId: string) => {
  const dispatch = useAppDispatch();
  const {
    currentPool,
    currentPoolLoading,
    currentPoolError,
    availableWords,
    availableWordsLoading,
    wordSearchQuery,
    wordFilters,
  } = useAppSelector(state => state.vocabularyPools);

  const loadPoolData = useCallback(() => {
    if (poolId) {
      dispatch(loadPool(poolId));
    }
  }, [dispatch, poolId]);

  const loadAvailableWordsData = useCallback((query?: { search?: string; wordType?: string; section?: string }) => {
    dispatch(loadAvailableWords(query || { search: wordSearchQuery, ...wordFilters }));
  }, [dispatch, wordSearchQuery, wordFilters]);

  const addWords = useCallback(async (wordDocIds: string[]) => {
    if (!poolId) return false;
    const result = await dispatch(addWordsToPool({ poolId, wordDocIds }));
    
    // Reload pool data to get updated words
    if (result.meta.requestStatus === 'fulfilled') {
      dispatch(loadPool(poolId));
    }
    
    return result.meta.requestStatus === 'fulfilled';
  }, [dispatch, poolId]);

  const removeWords = useCallback(async (wordDocIds: string[]) => {
    if (!poolId) return false;
    const result = await dispatch(removeWordsFromPool({ poolId, wordDocIds }));
    
    // Reload pool data to get updated words
    if (result.meta.requestStatus === 'fulfilled') {
      dispatch(loadPool(poolId));
    }
    
    return result.meta.requestStatus === 'fulfilled';
  }, [dispatch, poolId]);

  const setSearchQuery = useCallback((query: string) => {
    dispatch(setWordSearchQuery(query));
  }, [dispatch]);

  const updateFilters = useCallback((filters: Partial<typeof wordFilters>) => {
    dispatch(updateWordFilters(filters));
  }, [dispatch]);

  const clearPool = useCallback(() => {
    dispatch(clearCurrentPool());
  }, [dispatch]);

  // Auto-load pool when poolId changes
  useEffect(() => {
    loadPoolData();
    return () => {
      clearPool();
    };
  }, [loadPoolData, clearPool]);

  return {
    // Data
    pool: currentPool,
    loading: currentPoolLoading,
    error: currentPoolError,
    
    // Available words for adding
    availableWords,
    availableWordsLoading,
    wordSearchQuery,
    wordFilters,
    
    // Actions
    loadPool: loadPoolData,
    addWords,
    removeWords,
    loadAvailableWords: loadAvailableWordsData,
    setSearchQuery,
    updateFilters,
    clearPool,
  };
};
```

### Pages

#### `src/app/admin/vocabulary-pools/page.tsx` - NEW
```typescript
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, Plus, Library } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { useVocabularyPools } from '@/src/hooks/useVocabularyPools';
import { PoolHeader } from '@/src/components/ui/admin/vocabulary-pools/PoolHeader';
import { PoolFilters } from '@/src/components/ui/admin/vocabulary-pools/PoolFilters';
import { PoolList } from '@/src/components/ui/admin/vocabulary-pools/PoolList';

export default function VocabularyPoolsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useSelector((state: RootState) => state.auth);
  
  const {
    pools,
    loading,
    error,
    pagination,
    filters,
    loadPools,
    loadMorePools,
    updateFilters,
    deletePool,
  } = useVocabularyPools();

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadPools(true);
    }
  }, [user, loadPools]);

  const handleDeletePool = async (poolId: string, poolName: string) => {
    if (confirm(`Are you sure you want to delete "${poolName}"? This action cannot be undone.`)) {
      const success = await deletePool(poolId);
      if (success) {
        toast.success('Pool deleted successfully');
      }
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <PoolHeader
        title="Vocabulary Pools"
        subtitle="Manage vocabulary collections for lessons"
        navigation={
          <Button variant="ghost" onClick={() => router.push('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        }
        actions={
          <Button asChild>
            <Link href="/admin/vocabulary-pools/create">
              <Plus className="h-4 w-4 mr-2" />
              Create New Pool
            </Link>
          </Button>
        }
      />

      <main className="container mx-auto py-6 px-4 space-y-6">
        <PoolFilters
          filters={filters}
          onFiltersChange={updateFilters}
          loading={loading}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPools(true)}
              className="mt-2"
            >
              Try Again
            </Button>
          </div>
        )}

        <PoolList
          pools={pools}
          loading={loading}
          hasMore={pagination.hasMore}
          onLoadMore={loadMorePools}
          onEdit={(pool) => router.push(`/admin/vocabulary-pools/${pool.id}/edit`)}
          onView={(pool) => router.push(`/admin/vocabulary-pools/${pool.id}`)}
          onDelete={handleDeletePool}
        />
      </main>
    </div>
  );
}
```

#### `src/app/admin/vocabulary-pools/create/page.tsx` - NEW
```typescript
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useVocabularyPools } from '@/src/hooks/useVocabularyPools';
import { PoolHeader } from '@/src/components/ui/admin/vocabulary-pools/PoolHeader';
import { PoolNavigation } from '@/src/components/ui/admin/vocabulary-pools/PoolNavigation';
import { PoolForm } from '@/src/components/ui/admin/vocabulary-pools/PoolForm';
import type { CreatePoolRequest } from '@/src/types/vocabulary-pool';

export default function CreatePoolPage() {
  const router = useRouter();
  const { createPool, creating } = useVocabularyPools();

  const handleCreatePool = async (poolData: CreatePoolRequest) => {
    const success = await createPool(poolData);
    
    if (success) {
      toast.success('Vocabulary pool created successfully');
      router.push('/admin/vocabulary-pools');
      return true;
    } else {
      toast.error('Failed to create vocabulary pool');
      return false;
    }
  };

  const handleCancel = () => {
    router.push('/admin/vocabulary-pools');
  };

  return (
    <div className="min-h-screen bg-roman-marble">
      <PoolHeader
        title="Create Vocabulary Pool"
        subtitle="Create a new collection of words for lessons"
        navigation={<PoolNavigation currentPage="create" />}
      />

      <main className="container mx-auto py-6 px-4 max-w-4xl">
        <PoolForm
          mode="create"
          onSubmit={handleCreatePool}
          onCancel={handleCancel}
          isLoading={creating}
        />
      </main>
    </div>
  );
}
```

#### `src/app/admin/vocabulary-pools/[poolId]/page.tsx` - NEW
```typescript
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Edit, Trash2, Plus, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { useVocabularyPool } from '@/src/hooks/useVocabularyPool';
import { useVocabularyPools } from '@/src/hooks/useVocabularyPools';
import { PoolHeader } from '@/src/components/ui/admin/vocabulary-pools/PoolHeader';
import { PoolNavigation } from '@/src/components/ui/admin/vocabulary-pools/PoolNavigation';
import { PoolStats } from '@/src/components/ui/admin/vocabulary-pools/PoolStats';
import { PoolWordList } from '@/src/components/ui/admin/vocabulary-pools/PoolWordList';

interface PoolDetailPageProps {
  params: {
    poolId: string;
  };
}

export default function PoolDetailPage({ params }: PoolDetailPageProps) {
  const { poolId } = params;
  const router = useRouter();
  const { pool, loading, error } = useVocabularyPool(poolId);
  const { deletePool, deleting } = useVocabularyPools();

  const handleDeletePool = async () => {
    if (!pool) return;
    
    if (confirm(`Are you sure you want to delete "${pool.name}"? This action cannot be undone.`)) {
      const success = await deletePool(pool.id);
      if (success) {
        toast.success('Pool deleted successfully');
        router.push('/admin/vocabulary-pools');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="min-h-screen bg-roman-marble">
        <PoolHeader
          title="Pool Not Found"
          navigation={<PoolNavigation currentPage="detail" poolId={poolId} />}
        />
        <div className="container mx-auto py-6 px-4 text-center">
          <p className="text-red-600 mb-4">{error || 'Pool not found'}</p>
          <Button onClick={() => router.push('/admin/vocabulary-pools')}>
            Back to Pools
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <PoolHeader
        title={pool.name}
        subtitle={pool.description}
        navigation={
          <PoolNavigation 
            currentPage="detail" 
            poolId={poolId} 
            poolName={pool.name}
          />
        }
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/admin/vocabulary-pools/${poolId}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Info
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/admin/vocabulary-pools/${poolId}/words`}>
                <BookOpen className="h-4 w-4 mr-2" />
                Manage Words
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePool}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Pool
            </Button>
          </div>
        }
      />

      <main className="container mx-auto py-6 px-4 space-y-6">
        <PoolStats pool={pool} />
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif">
              Words in this pool ({pool.words.length})
            </h2>
            <Button asChild>
              <Link href={`/admin/vocabulary-pools/${poolId}/words/add`}>
                <Plus className="h-4 w-4 mr-2" />
                Add Words
              </Link>
            </Button>
          </div>
          
          <PoolWordList 
            words={pool.words.slice(0, 20)}
            poolId={poolId}
            compact={true}
            showRemove={false}
          />
          
          {pool.words.length > 20 && (
            <div className="text-center">
              <Button asChild variant="outline">
                <Link href={`/admin/vocabulary-pools/${poolId}/words`}>
                  View All {pool.words.length} Words
                </Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
```

### Components

#### `src/components/ui/admin/vocabulary-pools/PoolHeader.tsx` - NEW
```typescript
import React from 'react';
import { Library } from 'lucide-react';

interface PoolHeaderProps {
  title: string;
  subtitle?: string;
  navigation?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PoolHeader: React.FC<PoolHeaderProps> = ({
  title,
  subtitle,
  navigation,
  actions
}) => {
  return (
    <header className="bg-white border-b border-border">
      <div className="container mx-auto px-4 py-3">
        {navigation && (
          <div className="mb-4">
            {navigation}
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">{title}</h1>
              {subtitle && (
                <p className="text-sm text-roman-stone">{subtitle}</p>
              )}
            </div>
          </div>
          
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
```

#### `src/components/ui/admin/vocabulary-pools/PoolNavigation.tsx` - NEW
```typescript
import React from 'react';
import Link from 'next/link';
import { ChevronRight, Home, Library } from 'lucide-react';

interface PoolNavigationProps {
  currentPage: 'list' | 'create' | 'detail' | 'edit' | 'words' | 'add-words';
  poolId?: string;
  poolName?: string;
}

export const PoolNavigation: React.FC<PoolNavigationProps> = ({
  currentPage,
  poolId,
  poolName
}) => {
  const breadcrumbs = [
    { label: 'Admin', href: '/admin', icon: Home },
    { label: 'Vocabulary Pools', href: '/admin/vocabulary-pools', icon: Library },
  ];

  if (poolId && poolName) {
    breadcrumbs.push({
      label: poolName,
      href: `/admin/vocabulary-pools/${poolId}`,
    });
  }

  if (currentPage === 'create') {
    breadcrumbs.push({ label: 'Create Pool' });
  } else if (currentPage === 'edit' && poolId) {
    breadcrumbs.push({ label: 'Edit Pool' });
  } else if (currentPage === 'words' && poolId) {
    breadcrumbs.push({ label: 'Words' });
  } else if (currentPage === 'add-words' && poolId) {
    breadcrumbs.push({ label: 'Words' });
    breadcrumbs.push({ label: 'Add Words' });
  }

  return (
    <nav className="flex items-center space-x-1 text-sm text-gray-500">
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={index}>
          <div className="flex items-center gap-1">
            {crumb.icon && <crumb.icon className="h-4 w-4" />}
            {crumb.href ? (
              <Link 
                href={crumb.href}
                className="hover:text-roman-red transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="text-gray-900 font-medium">{crumb.label}</span>
            )}
          </div>
          {index < breadcrumbs.length - 1 && (
            <ChevronRight className="h-4 w-4" />
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
```

#### `src/components/ui/admin/vocabulary-pools/PoolForm.tsx` - NEW
```typescript
import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { X } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import type { CreatePoolRequest, VocabularyPool } from '@/src/types/vocabulary-pool';

interface PoolFormProps {
  initialData?: Partial<VocabularyPool>;
  onSubmit: (data: CreatePoolRequest) => Promise<boolean>;
  onCancel: () => void;
  isLoading: boolean;
  mode: 'create' | 'edit';
}

export const PoolForm: React.FC<PoolFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
  mode
}) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    difficulty: initialData?.metadata?.difficulty || 'beginner',
    tags: initialData?.metadata?.tags || [],
  });

  const [newTag, setNewTag] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Name must be less than 100 characters';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitData: CreatePoolRequest = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      difficulty: formData.difficulty as 'beginner' | 'intermediate' | 'advanced',
      tags: formData.tags,
    };

    await onSubmit(submitData);
  };

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <RomanCard>
      <RomanCardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Pool Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter pool name (e.g., Lesson 1 Core Vocabulary)"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the purpose and content of this vocabulary pool"
              rows={3}
              className={errors.description ? 'border-red-500' : ''}
            />
            {errors.description && <p className="text-sm text-red-600">{errors.description}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="difficulty">Difficulty Level</Label>
            <Select
              value={formData.difficulty}
              onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Add tag (e.g., nouns, family, animals)"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddTag}
                disabled={!newTag.trim()}
              >
                Add
              </Button>
            </div>
            
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </>
              ) : (
                mode === 'create' ? 'Create Pool' : 'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </RomanCardContent>
    </RomanCard>
  );
};
```

#### `src/components/ui/admin/vocabulary-pools/VocabularyPoolSelector.tsx` - NEW
```typescript
import React, { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Card, CardContent } from '@/src/components/ui/card';
import { Library, Search } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import Link from 'next/link';

import { useVocabularyPools } from '@/src/hooks/useVocabularyPools';
import type { VocabularyPool } from '@/src/types/vocabulary-pool';

interface VocabularyPoolSelectorProps {
  selectedPoolId?: string;
  onPoolSelect: (poolId: string | undefined) => void;
  disabled?: boolean;
}

export const VocabularyPoolSelector: React.FC<VocabularyPoolSelectorProps> = ({
  selectedPoolId,
  onPoolSelect,
  disabled = false
}) => {
  const { pools, loading, loadPools, filters, updateFilters } = useVocabularyPools();
  const [selectedPool, setSelectedPool] = useState<VocabularyPool | null>(null);
  const [showPoolPicker, setShowPoolPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load selected pool data
  useEffect(() => {
    if (selectedPoolId && pools.length > 0) {
      const pool = pools.find(p => p.id === selectedPoolId);
      setSelectedPool(pool || null);
    } else if (!selectedPoolId) {
      setSelectedPool(null);
    }
  }, [selectedPoolId, pools]);

  // Load pools when modal opens
  useEffect(() => {
    if (showPoolPicker) {
      loadPools(true);
    }
  }, [showPoolPicker, loadPools]);

  const filteredPools = pools.filter(pool => 
    pool.metadata.isActive &&
    (searchQuery ? 
      pool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pool.description.toLowerCase().includes(searchQuery.toLowerCase())
      : true
    )
  );

  return (
    <div className="space-y-4">
      {/* Current Selection Display */}
      {selectedPool ? (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">{selectedPool.name}</h4>
              <p className="text-sm text-gray-600">{selectedPool.description}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span>{selectedPool.metadata.wordCount} words</span>
                <Badge variant="secondary">{selectedPool.metadata.difficulty}</Badge>
                {selectedPool.metadata.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPoolPicker(true)}
                disabled={disabled}
              >
                Change Pool
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onPoolSelect(undefined);
                  setSelectedPool(null);
                }}
                disabled={disabled}
              >
                Remove Pool
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <Library className="h-8 w-8 mx-auto text-gray-400 mb-2" />
          <p className="text-gray-600 mb-4">No vocabulary pool assigned</p>
          <Button
            onClick={() => setShowPoolPicker(true)}
            disabled={disabled}
          >
            <Library className="h-4 w-4 mr-2" />
            Select Vocabulary Pool
          </Button>
        </div>
      )}

      {/* Pool Selection Modal */}
      <Dialog open={showPoolPicker} onOpenChange={setShowPoolPicker}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Select Vocabulary Pool</DialogTitle>
            <DialogDescription>
              Choose a vocabulary pool to assign to this lesson
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search pools..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select
                value={filters.difficulty}
                onValueChange={(value) => updateFilters({ difficulty: value })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Difficulties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Difficulties</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pool List */}
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red mx-auto mb-2" />
                  Loading pools...
                </div>
              ) : filteredPools.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No vocabulary pools found.
                  <br />
                  <Button asChild variant="outline" className="mt-2">
                    <Link href="/admin/vocabulary-pools/create" target="_blank">
                      Create New Pool
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredPools.map(pool => (
                    <Card
                      key={pool.id}
                      className={cn(
                        "cursor-pointer hover:bg-gray-50 transition-colors",
                        selectedPoolId === pool.id && "ring-2 ring-roman-red"
                      )}
                      onClick={() => {
                        onPoolSelect(pool.id);
                        setSelectedPool(pool);
                        setShowPoolPicker(false);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">{pool.name}</h4>
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {pool.description}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>{pool.metadata.wordCount} words</span>
                            <Badge variant="secondary" className="text-xs">
                              {pool.metadata.difficulty}
                            </Badge>
                          </div>
                          {selectedPoolId === pool.id && (
                            <Badge className="text-xs">Currently Selected</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPoolPicker(false)}>
              Cancel
            </Button>
            <Button asChild>
              <Link href="/admin/vocabulary-pools/create" target="_blank">
                Create New Pool
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
```

### Lesson Builder Integration

#### Update `src/components/ui/admin/lesson-builder/LessonInfoForm.tsx`
```typescript
// Add import
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';

// Update the component to include vocabulary pool selection
export const LessonInfoForm: React.FC<LessonInfoFormProps> = ({ lesson, onUpdateInfo }) => {
  return (
    <div className="space-y-4">
      {/* Existing lesson info card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Lesson Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing fields: ID, Title, Description */}
        </CardContent>
      </Card>

      {/* NEW: Vocabulary Pool Assignment Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Vocabulary Pool
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VocabularyPoolSelector 
            selectedPoolId={lesson.vocabulary_pool}
            onPoolSelect={(poolId) => onUpdateInfo({ vocabulary_pool: poolId })}
          />
        </CardContent>
      </Card>
    </div>
  );
};
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal**: Basic infrastructure and data layer

**Files to Create/Update**:
1. `src/types/vocabulary-pool.d.ts` - Complete type definitions
2. `src/types/lesson.d.ts` - Add vocabulary_pool field
3. `src/app/api/admin/vocabulary-pools/route.ts` - Core pool CRUD
4. `src/app/api/admin/vocabulary-pools/[poolId]/route.ts` - Single pool operations

**Testing**:
- API endpoints respond correctly
- Pool CRUD operations work via Postman/API testing
- Firestore collections created properly

### Phase 2: State Management (Week 2)
**Goal**: Redux integration and hooks

**Files to Create**:
1. `src/store/slices/vocabularyPoolSlice.ts` - Complete Redux slice
2. `src/hooks/useVocabularyPools.ts` - Pools list management
3. `src/hooks/useVocabularyPool.ts` - Single pool management

**Files to Update**:
1. `src/store/index.ts` - Add vocabulary pool slice

**Testing**:
- Redux actions dispatch correctly
- State updates reflect in components
- Hooks provide correct data and loading states

### Phase 3: Basic UI (Week 3)
**Goal**: Pool list and creation interface

**Files to Create**:
1. `src/app/admin/vocabulary-pools/page.tsx` - Pool list page
2. `src/app/admin/vocabulary-pools/create/page.tsx` - Pool creation
3. `src/components/ui/admin/vocabulary-pools/PoolHeader.tsx`
4. `src/components/ui/admin/vocabulary-pools/PoolNavigation.tsx`
5. `src/components/ui/admin/vocabulary-pools/PoolForm.tsx`
6. `src/components/ui/admin/vocabulary-pools/PoolList.tsx`
7. `src/components/ui/admin/vocabulary-pools/PoolCard.tsx`

**Files to Update**:
1. `src/app/admin/page.tsx` - Add pools section

**Testing**:
- Can create new pools via UI
- Pool list displays correctly
- Navigation works between pages

### Phase 4: Word Management (Week 4)
**Goal**: Add/remove words from pools

**Files to Create**:
1. `src/app/api/admin/vocabulary-pools/[poolId]/words/route.ts` - Word operations
2. `src/app/admin/vocabulary-pools/[poolId]/page.tsx` - Pool detail
3. `src/app/admin/vocabulary-pools/[poolId]/words/page.tsx` - Word management
4. `src/app/admin/vocabulary-pools/[poolId]/words/add/page.tsx` - Add words interface
5. `src/components/ui/admin/vocabulary-pools/WordSelector.tsx`
6. `src/components/ui/admin/vocabulary-pools/PoolWordManager.tsx`

**Testing**:
- Can add words to pools from existing word database
- Can remove words from pools
- Word search and filtering works correctly

### Phase 5: Lesson Integration (Week 5)
**Goal**: Connect pools to lessons

**Files to Create**:
1. `src/components/ui/admin/vocabulary-pools/VocabularyPoolSelector.tsx`

**Files to Update**:
1. `src/components/ui/admin/lesson-builder/LessonInfoForm.tsx` - Add pool selection
2. `src/services/lessonService.ts` - Add pool validation

**Testing**:
- Can assign pools to lessons
- Pool data displays in lesson builder
- Lesson saving includes pool reference

### Phase 6: Enhancement & Polish (Week 6)
**Goal**: Advanced features and UX improvements

**Features**:
- Pool usage analytics (which lessons use each pool)
- Bulk operations (duplicate pools, merge pools)
- Pool templates for common word groupings
- Enhanced filtering and search
- Performance optimizations

---

## 📊 Success Metrics

### Technical Metrics
- **API Performance**: All endpoints respond < 500ms
- **Database Efficiency**: Batch word loading for large pools
- **Error Handling**: Comprehensive validation and user feedback
- **Type Safety**: Full TypeScript coverage with no `any` types

### User Experience Metrics
- **Pool Creation**: < 2 minutes to create and populate a new pool
- **Word Assignment**: < 1 minute to assign pool to lesson
- **Search Performance**: Real-time search with < 100ms debounce
- **Navigation Flow**: Intuitive breadcrumbs and consistent UI patterns

### Business Metrics
- **Admin Efficiency**: 50% reduction in time to create vocabulary-rich lessons
- **Content Reusability**: Pools used across multiple lessons
- **Data Consistency**: Centralized vocabulary management reduces duplication

---

## 🔧 Technical Considerations

### Performance Optimizations
- **Firestore Queries**: Use compound indexes for complex filtering
- **Word Loading**: Batch requests for word population (10 docs per batch)
- **Caching**: Cache word counts in pool metadata
- **Pagination**: Cursor-based pagination for large pool lists

### Security & Validation
- **Admin-Only**: All pool operations require admin role
- **Input Validation**: Comprehensive validation on both client and server
- **Reference Integrity**: Validate word document IDs exist before adding to pools
- **Soft Deletion**: Consider soft delete for pools used in lessons

### Scalability Planning
- **Document Limits**: Monitor Firestore document size limits (1MB)
- **Query Optimization**: Index all filterable fields
- **Batch Operations**: Handle large word sets efficiently
- **Error Recovery**: Graceful degradation when word references become invalid

This comprehensive plan provides a complete roadmap for implementing the vocabulary pools system while maintaining separation from the existing vocabulary management and ensuring integration with the lesson system.