# Lesson Database Migration Guide

## Overview
Migrate from dual-collection architecture (`lessons` + `live_lessons`) to unified single-collection design with publishing fields.

**Goals:**
- Eliminate `live_lessons` collection entirely
- Add publishing fields to `lessons` collection  
- Remove ~700 lines of redundant code
- Maintain existing functionality with simplified architecture

**Principles:**
- No in-code comments
- Keep code streamlined
- Use existing infrastructure when possible
- Atomic operations only

---

## Phase 1: Database Schema Migration

### 1.1 Create Migration Script

Create `/src/scripts/migrate-live-lessons.ts`:

```typescript
import { adminDb } from '@/src/services/firebase-admin';

export async function migrateLiveLessonsToUnified() {
  console.log('Starting live lessons migration...');
  
  const liveLessonsSnapshot = await adminDb.collection('live_lessons').get();
  const allLessonsSnapshot = await adminDb.collection('lessons').get();
  
  const batch = adminDb.batch();
  const liveIds = new Set<string>();
  
  for (const doc of liveLessonsSnapshot.docs) {
    const liveLesson = doc.data();
    liveIds.add(liveLesson.lessonId);
    
    const lessonRef = adminDb.collection('lessons').doc(liveLesson.lessonId);
    batch.update(lessonRef, {
      isLive: true,
      liveOrder: liveLesson.order,
      publishedAt: liveLesson.publishedAt,
      publishedBy: liveLesson.publishedBy
    });
  }
  
  for (const doc of allLessonsSnapshot.docs) {
    if (!liveIds.has(doc.id)) {
      batch.update(doc.ref, {
        isLive: false,
        liveOrder: null,
        publishedAt: null,
        publishedBy: null
      });
    }
  }
  
  await batch.commit();
  console.log(`Migrated ${liveLessonsSnapshot.size} live lessons`);
}

export async function validateMigration() {
  const lessons = await adminDb.collection('lessons').get();
  const liveLessons = lessons.docs.filter(doc => doc.data().isLive);
  
  console.log(`Total lessons: ${lessons.size}`);
  console.log(`Live lessons: ${liveLessons.length}`);
  
  const orderedLive = liveLessons
    .map(doc => ({ id: doc.id, order: doc.data().liveOrder }))
    .sort((a, b) => a.order - b.order);
    
  console.log('Live lesson order:', orderedLive);
}

export async function cleanupLiveLessonsCollection() {
  console.log('⚠️  DESTRUCTIVE: Deleting live_lessons collection');
  const snapshot = await adminDb.collection('live_lessons').get();
  
  const batch = adminDb.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  
  await batch.commit();
  console.log(`Deleted ${snapshot.size} documents from live_lessons`);
}
```

### 1.2 Create API Endpoint for Migration

Create `/src/app/api/admin/migrate-lessons/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { migrateLiveLessonsToUnified, validateMigration, cleanupLiveLessonsCollection } from '@/src/scripts/migrate-live-lessons';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await request.json();

    switch (action) {
      case 'migrate':
        await migrateLiveLessonsToUnified();
        return NextResponse.json({ success: true, message: 'Migration completed' });
      
      case 'validate':
        await validateMigration();
        return NextResponse.json({ success: true, message: 'Validation completed' });
      
      case 'cleanup':
        await cleanupLiveLessonsCollection();
        return NextResponse.json({ success: true, message: 'Cleanup completed' });
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  }
}
```

### 1.3 Run Migration

```bash
curl -X POST http://localhost:3000/api/admin/migrate-lessons \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"action":"migrate"}'

curl -X POST http://localhost:3000/api/admin/migrate-lessons \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"action":"validate"}'
```

---

## Phase 2: Type System Updates

### 2.1 Update Lesson Interface

Replace `src/types/lesson.d.ts`:

```typescript
import { IntroductionPage, ExercisePage } from './page';
import type { VocabularyPoolWithWords } from './vocabulary-pool';

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  vocabulary_pool?: string;
  introduction: IntroductionPage[];
  exercises: ExercisePage[];
  
  isLive: boolean;
  liveOrder: number | null;
  publishedAt: string | null;
  publishedBy: string | null;
  
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
}

export interface LessonWithVocabularyPool extends Lesson {
  vocabularyPoolData?: VocabularyPoolWithWords;
}

export type LessonStatus = 'available' | 'in-progress' | 'completed' | 'locked' | 'current' | 'upcoming';

export interface LessonWithProgress extends Lesson {
  progress?: number;
  status?: LessonStatus;
}

export type { IntroductionPage, ExercisePage } from './page';
export type { RenderableContentItem } from './page';
export type { ContentItem, TextContent, EmphasisContent, TableContent, ComponentNarration } from './content';
export type { VocabularyItem, VocabularyContent, VocabularyPoolContent } from './vocabulary';
export type {
  BaseExercise,
  MatchingExercise,
  FillExercise,
  TextSelectionExercise,
  VerbAnalysisExercise,
  VerbConjugationExercise,
  MultipleChoiceExercise,
  OddOneOutExercise,
  Exercise,
} from './exercise';
```

### 2.2 Delete Files

```bash
rm src/types/live-lesson.d.ts
rm src/services/liveLessonService.ts
rm src/store/slices/liveLessonSlice.ts
```

---

## Phase 3: Service Layer Unification

### 3.1 Update Lesson Service

Replace `src/services/lessonService.ts`:

```typescript
import { Lesson, LessonWithProgress } from '@/src/types/lesson';
import { auth } from './firebase';

class LessonService {
  private async getAuthToken(): Promise<string | null> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }

  private async makeRequest(url: string, options: RequestInit = {}) {
    const token = await this.getAuthToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async createLesson(lesson: Lesson): Promise<{ success: boolean; lesson: Lesson; message: string }> {
    return this.makeRequest('/api/admin/lessons', {
      method: 'POST',
      body: JSON.stringify(lesson),
    });
  }

  async updateLesson(lesson: Lesson): Promise<{ success: boolean; lesson: Lesson; message: string }> {
    return this.makeRequest('/api/admin/lessons', {
      method: 'PUT',
      body: JSON.stringify(lesson),
    });
  }

  async saveLesson(lesson: Lesson, isUpdate: boolean = false): Promise<{ success: boolean; lesson: Lesson; message: string }> {
    if (isUpdate) {
      return this.updateLesson(lesson);
    } else {
      return this.createLesson(lesson);
    }
  }

  async getLessons(): Promise<{ lessons: Lesson[] }> {
    return this.makeRequest('/api/admin/lessons');
  }

  async getLesson(id: string): Promise<Lesson> {
    const response = await this.makeRequest(`/api/admin/lessons/${id}`);
    return response.lesson;
  }

  async deleteLesson(id: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`/api/admin/lessons/${id}`, {
      method: 'DELETE',
    });
  }

  async getStudentLessons(): Promise<{ lessons: LessonWithProgress[] }> {
    return this.makeRequest('/api/lessons');
  }

  async getLessonById(lessonId: string): Promise<LessonWithProgress> {
    const response = await this.makeRequest(`/api/lessons/${lessonId}`);
    return response.lesson;
  }

  async publishLesson(lessonId: string, order?: number): Promise<{ success: boolean; message: string }> {
    return this.makeRequest('/api/admin/lessons/publish', {
      method: 'POST',
      body: JSON.stringify({ lessonId, order }),
    });
  }

  async unpublishLesson(lessonId: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest('/api/admin/lessons/unpublish', {
      method: 'POST',
      body: JSON.stringify({ lessonId }),
    });
  }

  async reorderLiveLessons(lessons: { lessonId: string; order: number }[]): Promise<{ success: boolean }> {
    return this.makeRequest('/api/admin/lessons/reorder', {
      method: 'POST',
      body: JSON.stringify({ lessons }),
    });
  }

  async batchPublish(lessonIds: string[]): Promise<{ success: boolean; message: string; processedCount: number }> {
    return this.makeRequest('/api/admin/lessons/batch-publish', {
      method: 'POST',
      body: JSON.stringify({ lessonIds }),
    });
  }

  async batchUnpublish(lessonIds: string[]): Promise<{ success: boolean; message: string; processedCount: number }> {
    return this.makeRequest('/api/admin/lessons/batch-unpublish', {
      method: 'POST',
      body: JSON.stringify({ lessonIds }),
    });
  }
}

export const lessonService = new LessonService();
```

---

## Phase 4: Redux Slice Consolidation

### 4.1 Update Lesson Slice

Replace `src/store/slices/lessonSlice.ts`:

```typescript
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Lesson, IntroductionPage, ExercisePage, LessonWithProgress } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';
import { lessonService } from '@/src/services/lessonService';
import { TooltipData } from '@/src/types/tooltip';
import { extractTooltipsFromLesson } from '@/src/utils/tooltipUtils';

interface LessonWithMetadata extends Lesson {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
}

interface LessonState {
  currentLesson: Lesson | null;
  drafts: Record<string, { lesson: Lesson; lastModified: string }>;
  editingContent: {
    content: RenderableContentItem;
    pageType: 'introduction' | 'exercises';
    pageIndex: number;
    itemIndex: number;
  } | null;
  isModalOpen: boolean;

  lessons: LessonWithMetadata[];
  studentLessons: LessonWithProgress[];
  
  loading: boolean;
  saving: boolean;
  error: string | null;
  lastSavedLesson: LessonWithMetadata | null;

  tooltips: Record<string, TooltipData>;
}

const initialState: LessonState = {
  currentLesson: null,
  drafts: {},
  editingContent: null,
  isModalOpen: false,
  lessons: [],
  studentLessons: [],
  loading: false,
  saving: false,
  error: null,
  lastSavedLesson: null,
  tooltips: {},
};

const DRAFTS_KEY = 'lesson_drafts';

export const saveLesson = createAsyncThunk(
  'lesson/saveLesson',
  async ({ lesson, isUpdate }: { lesson: Lesson; isUpdate?: boolean }, { rejectWithValue }) => {
    try {
      const result = await lessonService.saveLesson(lesson, isUpdate);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const loadLessons = createAsyncThunk('lesson/loadLessons', async (_, { rejectWithValue }) => {
  try {
    const result = await lessonService.getLessons();
    return result.lessons as LessonWithMetadata[];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load lessons';
    return rejectWithValue(errorMessage);
  }
});

export const loadStudentLessons = createAsyncThunk('lesson/loadStudentLessons', async (_, { rejectWithValue }) => {
  try {
    const result = await lessonService.getStudentLessons();
    return result.lessons;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load lessons';
    return rejectWithValue(errorMessage);
  }
});

export const loadLessonById = createAsyncThunk(
  'lesson/loadLessonById',
  async ({ lessonId, isStudent = false }: { lessonId: string; isStudent?: boolean }, { rejectWithValue }) => {
    try {
      let lesson;
      if (isStudent) {
        lesson = await lessonService.getLessonById(lessonId);
      } else {
        lesson = await lessonService.getLesson(lessonId);
      }
      const tooltips = extractTooltipsFromLesson(lesson);
      return { lesson: lesson as LessonWithMetadata, tooltips };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const deleteLesson = createAsyncThunk('lesson/deleteLesson', async (lessonId: string, { rejectWithValue }) => {
  try {
    await lessonService.deleteLesson(lessonId);
    return lessonId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete lesson';
    return rejectWithValue(errorMessage);
  }
});

export const publishLesson = createAsyncThunk(
  'lesson/publishLesson',
  async ({ lessonId, order }: { lessonId: string; order?: number }, { rejectWithValue }) => {
    try {
      const result = await lessonService.publishLesson(lessonId, order);
      return { ...result, lessonId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const unpublishLesson = createAsyncThunk(
  'lesson/unpublishLesson',
  async (lessonId: string, { rejectWithValue }) => {
    try {
      const result = await lessonService.unpublishLesson(lessonId);
      return { ...result, lessonId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unpublish lesson';
      return rejectWithValue(errorMessage);
    }
  }
);

export const reorderLiveLessons = createAsyncThunk(
  'lesson/reorderLiveLessons',
  async (lessons: { lessonId: string; order: number }[], { rejectWithValue }) => {
    try {
      const result = await lessonService.reorderLiveLessons(lessons);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reorder lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const batchPublishLessons = createAsyncThunk(
  'lesson/batchPublish',
  async (lessonIds: string[], { rejectWithValue }) => {
    try {
      const result = await lessonService.batchPublish(lessonIds);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const batchUnpublishLessons = createAsyncThunk(
  'lesson/batchUnpublish',
  async (lessonIds: string[], { rejectWithValue }) => {
    try {
      const result = await lessonService.batchUnpublish(lessonIds);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unpublish lessons';
      return rejectWithValue(errorMessage);
    }
  }
);

export const loadDrafts = createAsyncThunk('lesson/loadDrafts', (_, { rejectWithValue }) => {
  try {
    const draftsData = sessionStorage.getItem(DRAFTS_KEY);
    return draftsData ? JSON.parse(draftsData) : {};
  } catch (error) {
    console.error('Error loading drafts from storage:', error);
    return rejectWithValue('Failed to load drafts');
  }
});

export const saveDraft = createAsyncThunk('lesson/saveDraft', async (lesson: Lesson, { getState, rejectWithValue }) => {
  try {
    const state = getState() as { lesson: LessonState };
    const drafts = { ...state.lesson.drafts };
    const timestamp = new Date().toISOString();

    drafts[lesson.id] = { lesson, lastModified: timestamp };

    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    return { lessonId: lesson.id, draft: { lesson, lastModified: timestamp } };
  } catch (error) {
    console.error('Error saving draft to storage:', error);
    return rejectWithValue('Failed to save draft');
  }
});

export const clearDraft = createAsyncThunk(
  'lesson/clearDraft',
  async (lessonId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { lesson: LessonState };
      const drafts = { ...state.lesson.drafts };
      delete drafts[lessonId];

      sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      return lessonId;
    } catch (error) {
      console.error('Error clearing draft from storage:', error);
      return rejectWithValue('Failed to clear draft');
    }
  }
);

const lessonSlice = createSlice({
  name: 'lesson',
  initialState,
  reducers: {
    setLesson: (state, action: PayloadAction<Lesson | undefined>) => {
      state.currentLesson = action.payload || {
        id: `lesson-${Date.now()}`,
        title: 'New Lesson',
        description: '',
        introduction: [],
        exercises: [],
        isLive: false,
        liveOrder: null,
        publishedAt: null,
        publishedBy: null,
      };
      state.error = null;
    },

    updateLessonInfo: (state, action: PayloadAction<Partial<Pick<Lesson, 'id' | 'title' | 'description'>>>) => {
      if (state.currentLesson) {
        Object.assign(state.currentLesson, action.payload);
      }
    },

    addIntroductionPage: state => {
      if (state.currentLesson) {
        const newPage: IntroductionPage = {
          id: `intro-page-${Date.now()}`,
          title: 'New Introduction Page',
          items: [],
          audioPath: null,
        };
        state.currentLesson.introduction.push(newPage);
      }
    },

    addExercisePage: state => {
      if (state.currentLesson) {
        const newPage: ExercisePage = {
          id: `exercise-page-${Date.now()}`,
          title: 'New Exercise Page',
          items: [],
          audioPath: null,
        };
        state.currentLesson.exercises.push(newPage);
      }
    },

    updatePageTitle: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        title: string;
      }>
    ) => {
      const { pageType, pageIndex, title } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType][pageIndex].title = title;
      }
    },

    addContentToPage: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        content: RenderableContentItem;
      }>
    ) => {
      const { pageType, pageIndex, content } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType][pageIndex].items.push(content);
      }
    },

    updateContentItem: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        itemIndex: number;
        content: RenderableContentItem;
      }>
    ) => {
      const { pageType, pageIndex, itemIndex, content } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType][pageIndex].items[itemIndex] = content;
      }
    },

    removeContent: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        itemIndex: number;
      }>
    ) => {
      const { pageType, pageIndex, itemIndex } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType][pageIndex].items.splice(itemIndex, 1);
      }
    },

    removePage: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
      }>
    ) => {
      const { pageType, pageIndex } = action.payload;
      if (state.currentLesson) {
        state.currentLesson[pageType].splice(pageIndex, 1);
      }
    },

    startEditingContent: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        itemIndex: number;
      }>
    ) => {
      const { pageType, pageIndex, itemIndex } = action.payload;
      if (state.currentLesson) {
        state.editingContent = {
          content: JSON.parse(JSON.stringify(state.currentLesson[pageType][pageIndex].items[itemIndex])),
          pageType,
          pageIndex,
          itemIndex,
        };
        state.isModalOpen = true;
      }
    },

    updateEditingContent: (state, action: PayloadAction<RenderableContentItem>) => {
      if (state.editingContent) {
        state.editingContent.content = action.payload;

        if (state.currentLesson) {
          const { pageType, pageIndex, itemIndex } = state.editingContent;
          state.currentLesson[pageType][pageIndex].items[itemIndex] = action.payload;
        }
      }
    },

    saveEditingContent: state => {
      if (state.editingContent && state.currentLesson) {
        const { pageType, pageIndex, itemIndex, content } = state.editingContent;
        state.currentLesson[pageType][pageIndex].items[itemIndex] = content;
        state.editingContent = null;
        state.isModalOpen = false;
      }
    },

    cancelEditing: state => {
      state.editingContent = null;
      state.isModalOpen = false;
    },

    clearError: state => {
      state.error = null;
    },

    clearLastSavedLesson: state => {
      state.lastSavedLesson = null;
    },

    resetLessonState: state => {
      state.currentLesson = null;
      state.editingContent = null;
      state.error = null;
      state.lastSavedLesson = null;
    },

    addTooltip: (state, action: PayloadAction<{ id: string; data: Omit<TooltipData, 'id'> }>) => {
      const { id, data } = action.payload;
      state.tooltips[id] = { ...data, id };
    },

    removeTooltip: (state, action: PayloadAction<string>) => {
      delete state.tooltips[action.payload];
    },

    clearTooltips: state => {
      state.tooltips = {};
    },

    loadTooltips: (state, action: PayloadAction<Record<string, TooltipData>>) => {
      state.tooltips = { ...state.tooltips, ...action.payload };
    },

    reorderPages: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        fromIndex: number;
        toIndex: number;
      }>
    ) => {
      const { pageType, fromIndex, toIndex } = action.payload;
      if (state.currentLesson && fromIndex !== toIndex) {
        const pages = state.currentLesson[pageType];
        const [movedPage] = pages.splice(fromIndex, 1);
        pages.splice(toIndex, 0, movedPage);
      }
    },

    reorderContentItems: (
      state,
      action: PayloadAction<{
        pageType: 'introduction' | 'exercises';
        pageIndex: number;
        fromIndex: number;
        toIndex: number;
      }>
    ) => {
      const { pageType, pageIndex, fromIndex, toIndex } = action.payload;
      if (state.currentLesson && fromIndex !== toIndex) {
        const items = state.currentLesson[pageType][pageIndex].items;
        const [movedItem] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, movedItem);
      }
    },

    localReorderLiveLessons: (state, action: PayloadAction<{ fromIndex: number; toIndex: number }>) => {
      const { fromIndex, toIndex } = action.payload;
      const liveLessons = state.lessons.filter(l => l.isLive).sort((a, b) => (a.liveOrder || 0) - (b.liveOrder || 0));
      
      if (fromIndex < liveLessons.length && toIndex < liveLessons.length) {
        const [removed] = liveLessons.splice(fromIndex, 1);
        liveLessons.splice(toIndex, 0, removed);
        
        liveLessons.forEach((lesson, index) => {
          const lessonInState = state.lessons.find(l => l.id === lesson.id);
          if (lessonInState) {
            lessonInState.liveOrder = index;
          }
        });
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(saveLesson.pending, state => {
        state.saving = true;
        state.error = null;
      })
      .addCase(saveLesson.fulfilled, (state, action) => {
        state.saving = false;
        state.error = null;
        state.lastSavedLesson = action.payload.lesson as LessonWithMetadata;
        delete state.drafts[action.payload.lesson.id];

        if (state.currentLesson && state.currentLesson.id === action.payload.lesson.id) {
          state.currentLesson = action.payload.lesson;
        }

        const existingIndex = state.lessons.findIndex(l => l.id === action.payload.lesson.id);
        if (existingIndex >= 0) {
          state.lessons[existingIndex] = action.payload.lesson as LessonWithMetadata;
        } else {
          state.lessons.unshift(action.payload.lesson as LessonWithMetadata);
        }
      })
      .addCase(saveLesson.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      })

      .addCase(loadLessons.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadLessons.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.lessons = action.payload;
      })
      .addCase(loadLessons.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      .addCase(loadStudentLessons.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadStudentLessons.fulfilled, (state, action) => {
        state.loading = false;
        state.studentLessons = action.payload;
      })
      .addCase(loadStudentLessons.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      .addCase(loadLessonById.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadLessonById.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.currentLesson = action.payload.lesson;
        state.tooltips = action.payload.tooltips;
      })
      .addCase(loadLessonById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      .addCase(publishLesson.pending, state => {
        state.error = null;
      })
      .addCase(publishLesson.fulfilled, (state, action) => {
        const lesson = state.lessons.find(l => l.id === action.meta.arg.lessonId);
        if (lesson) {
          lesson.isLive = true;
          lesson.publishedAt = new Date().toISOString();
          lesson.publishedBy = action.meta.arg.publishedBy || '';
          lesson.liveOrder = action.meta.arg.order ?? state.lessons.filter(l => l.isLive).length;
        }
      })
      .addCase(publishLesson.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(unpublishLesson.pending, state => {
        state.error = null;
      })
      .addCase(unpublishLesson.fulfilled, (state, action) => {
        const lesson = state.lessons.find(l => l.id === action.meta.arg);
        if (lesson) {
          lesson.isLive = false;
          lesson.liveOrder = null;
          lesson.publishedAt = null;
          lesson.publishedBy = null;
        }
      })
      .addCase(unpublishLesson.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(reorderLiveLessons.pending, state => {
        state.error = null;
      })
      .addCase(reorderLiveLessons.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(batchPublishLessons.pending, state => {
        state.error = null;
      })
      .addCase(batchPublishLessons.fulfilled, () => {
      })
      .addCase(batchPublishLessons.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(batchUnpublishLessons.pending, state => {
        state.error = null;
      })
      .addCase(batchUnpublishLessons.fulfilled, () => {
      })
      .addCase(batchUnpublishLessons.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      .addCase(loadDrafts.fulfilled, (state, action) => {
        state.drafts = action.payload;
      })
      .addCase(saveDraft.fulfilled, (state, action) => {
        state.drafts[action.payload.lessonId] = action.payload.draft;
      })
      .addCase(clearDraft.fulfilled, (state, action) => {
        delete state.drafts[action.payload];
      })

      .addCase(deleteLesson.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteLesson.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.lessons = state.lessons.filter(l => l.id !== action.payload);

        if (state.currentLesson?.id === action.payload) {
          state.currentLesson = null;
        }
      })
      .addCase(deleteLesson.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setLesson,
  updateLessonInfo,
  addIntroductionPage,
  addExercisePage,
  updatePageTitle,
  addContentToPage,
  updateContentItem,
  removeContent,
  removePage,
  startEditingContent,
  updateEditingContent,
  saveEditingContent,
  cancelEditing,
  clearError,
  clearLastSavedLesson,
  resetLessonState,
  addTooltip,
  removeTooltip,
  clearTooltips,
  loadTooltips,
  reorderPages,
  reorderContentItems,
  localReorderLiveLessons,
} = lessonSlice.actions;

export const selectHasDraft = (state: { lesson: LessonState }, lessonId: string) =>
  Boolean(state.lesson.drafts[lessonId]);

export const selectDraftLastModified = (state: { lesson: LessonState }, lessonId: string) =>
  state.lesson.drafts[lessonId]?.lastModified;

export const selectDraft = (state: { lesson: LessonState }, lessonId: string) => state.lesson.drafts[lessonId];

export const selectLiveLessons = (state: { lesson: LessonState }) => 
  state.lesson.lessons.filter(l => l.isLive).sort((a, b) => (a.liveOrder || 0) - (b.liveOrder || 0));

export const selectAvailableLessons = (state: { lesson: LessonState }) =>
  state.lesson.lessons.filter(l => !l.isLive);

export const selectLessonById = (state: { lesson: LessonState }, lessonId: string) =>
  state.lesson.lessons.find(l => l.id === lessonId);

export default lessonSlice.reducer;
```

---

## Phase 5: API Endpoints Update

### 5.1 Update Student Lessons API

Replace `src/app/api/lessons/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { LessonWithProgress } from '@/src/types/lesson';

export async function GET() {
  try {
    const snapshot = await adminDb.collection('lessons')
      .where('isLive', '==', true)
      .orderBy('liveOrder', 'asc')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ lessons: [] });
    }

    const lessons: LessonWithProgress[] = snapshot.docs.map(doc => {
      const data = doc.data();
      const progress = 0;
      const status = progress === 0 ? 'available' : progress === 100 ? 'completed' : 'in-progress';

      return {
        id: doc.id,
        ...data,
        progress,
        status,
      } as LessonWithProgress;
    });

    return NextResponse.json({ lessons });
  } catch (error) {
    console.error('Error fetching live lessons:', error);
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
  }
}
```

### 5.2 Update Individual Lesson API  

Replace `src/app/api/lessons/[lessonId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { LessonWithProgress } from '@/src/types/lesson';

export async function GET(request: NextRequest, { params }: { params: { lessonId: string } }) {
  try {
    const { lessonId } = params;

    if (!lessonId) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();

    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const lessonData = lessonDoc.data();
    
    if (!lessonData?.isLive) {
      return NextResponse.json({ error: 'Lesson not published' }, { status: 404 });
    }

    const progress = 0;
    const status = progress === 0 ? 'available' : progress === 100 ? 'completed' : 'in-progress';

    const lesson: LessonWithProgress = {
      id: lessonDoc.id,
      ...lessonData,
      progress,
      status,
    } as LessonWithProgress;

    return NextResponse.json({ lesson });
  } catch (error) {
    console.error('Error fetching lesson:', error);
    return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500 });
  }
}
```

### 5.3 Add Publishing Endpoints

Create `src/app/api/admin/lessons/publish/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonId, order } = await request.json();

    if (!lessonId) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();
    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    if (lessonDoc.data()?.isLive) {
      return NextResponse.json({ error: 'Lesson is already live' }, { status: 409 });
    }

    let finalOrder = order;
    if (finalOrder === undefined) {
      const liveLessonsSnapshot = await adminDb.collection('lessons')
        .where('isLive', '==', true)
        .orderBy('liveOrder', 'desc')
        .limit(1)
        .get();

      finalOrder = liveLessonsSnapshot.empty ? 0 : liveLessonsSnapshot.docs[0].data().liveOrder + 1;
    }

    await adminDb.collection('lessons').doc(lessonId).update({
      isLive: true,
      liveOrder: finalOrder,
      publishedAt: new Date().toISOString(),
      publishedBy: user.uid,
    });

    console.log(`Lesson ${lessonId} published as live by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Lesson published successfully',
    });
  } catch (error) {
    console.error('Error publishing lesson:', error);
    return NextResponse.json({ error: 'Failed to publish lesson' }, { status: 500 });
  }
}
```

Create `src/app/api/admin/lessons/unpublish/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonId } = await request.json();

    if (!lessonId) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();
    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    if (!lessonDoc.data()?.isLive) {
      return NextResponse.json({ error: 'Lesson is not live' }, { status: 409 });
    }

    await adminDb.collection('lessons').doc(lessonId).update({
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
    });

    console.log(`Lesson ${lessonId} unpublished by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Lesson unpublished successfully',
    });
  } catch (error) {
    console.error('Error unpublishing lesson:', error);
    return NextResponse.json({ error: 'Failed to unpublish lesson' }, { status: 500 });
  }
}
```

Create `src/app/api/admin/lessons/reorder/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessons } = await request.json();

    if (!Array.isArray(lessons)) {
      return NextResponse.json({ error: 'Lessons array is required' }, { status: 400 });
    }

    const batch = adminDb.batch();

    for (const lesson of lessons) {
      if (!lesson.lessonId || lesson.order === undefined) {
        return NextResponse.json({ error: 'Invalid lesson data' }, { status: 400 });
      }

      const lessonRef = adminDb.collection('lessons').doc(lesson.lessonId);
      batch.update(lessonRef, { liveOrder: lesson.order });
    }

    await batch.commit();

    console.log(`Reordered ${lessons.length} lessons by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Lessons reordered successfully',
    });
  } catch (error) {
    console.error('Error reordering lessons:', error);
    return NextResponse.json({ error: 'Failed to reorder lessons' }, { status: 500 });
  }
}
```

Create `src/app/api/admin/lessons/batch-publish/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonIds } = await request.json();

    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return NextResponse.json({ error: 'Lesson IDs array is required' }, { status: 400 });
    }

    const liveLessonsSnapshot = await adminDb.collection('lessons')
      .where('isLive', '==', true)
      .orderBy('liveOrder', 'desc')
      .limit(1)
      .get();

    let nextOrder = liveLessonsSnapshot.empty ? 0 : liveLessonsSnapshot.docs[0].data().liveOrder + 1;

    const batch = adminDb.batch();
    let processedCount = 0;

    for (const lessonId of lessonIds) {
      const lessonRef = adminDb.collection('lessons').doc(lessonId);
      const lessonDoc = await lessonRef.get();

      if (lessonDoc.exists && !lessonDoc.data()?.isLive) {
        batch.update(lessonRef, {
          isLive: true,
          liveOrder: nextOrder,
          publishedAt: new Date().toISOString(),
          publishedBy: user.uid,
        });
        nextOrder++;
        processedCount++;
      }
    }

    await batch.commit();

    console.log(`Batch published ${processedCount} lessons by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: `Successfully published ${processedCount} lessons`,
      processedCount,
    });
  } catch (error) {
    console.error('Error batch publishing lessons:', error);
    return NextResponse.json({ error: 'Failed to publish lessons' }, { status: 500 });
  }
}
```

Create `src/app/api/admin/lessons/batch-unpublish/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonIds } = await request.json();

    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return NextResponse.json({ error: 'Lesson IDs array is required' }, { status: 400 });
    }

    const batch = adminDb.batch();
    let processedCount = 0;

    for (const lessonId of lessonIds) {
      const lessonRef = adminDb.collection('lessons').doc(lessonId);
      const lessonDoc = await lessonRef.get();

      if (lessonDoc.exists && lessonDoc.data()?.isLive) {
        batch.update(lessonRef, {
          isLive: false,
          liveOrder: null,
          publishedAt: null,
          publishedBy: null,
        });
        processedCount++;
      }
    }

    await batch.commit();

    console.log(`Batch unpublished ${processedCount} lessons by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: `Successfully unpublished ${processedCount} lessons`,
      processedCount,
    });
  } catch (error) {
    console.error('Error batch unpublishing lessons:', error);
    return NextResponse.json({ error: 'Failed to unpublish lessons' }, { status: 500 });
  }
}
```

### 5.4 Update Admin Lessons API

Update `src/app/api/admin/lessons/route.ts` to include live lesson data:

```typescript
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await adminDb.collection('lessons')
      .orderBy('updatedAt', 'desc')
      .get();

    const lessons = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    const liveLessons = lessons.filter(l => l.isLive);
    const availableLessons = lessons.filter(l => !l.isLive);

    return NextResponse.json({
      lessons,
      liveLessons,
      availableLessons,
    });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
  }
}
```

### 5.5 Remove Old API Files

```bash
rm -rf src/app/api/live-lessons/
rm -rf src/app/api/admin/live-lessons/
```

---

## Phase 6: Component Updates

### 6.1 Update Store Import

Replace `src/store/index.ts`:

```typescript
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import lessonReducer from './slices/lessonSlice';
import vocabularyPoolReducer from './slices/vocabularyPoolSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    lesson: lessonReducer,
    vocabularyPool: vocabularyPoolReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### 6.2 Update Dashboard Component

Update `src/app/dashboard/page.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/services/firebase';
import type { RootState, AppDispatch } from '@/src/store';
import { loadStudentLessons } from '@/src/store/slices/lessonSlice';
import { Button } from '@/src/components/ui/button';
import { toast } from 'sonner';
import React from 'react';
import { BookOpen, User, Clock, Target, TrendingUp, CheckCircle, Play } from 'lucide-react';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { LessonStatus } from '@/src/types/lesson';

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user, loading } = useSelector((state: RootState) => state.auth);
  const { studentLessons, loading: lessonsLoading } = useSelector((state: RootState) => state.lesson);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (user) {
      dispatch(loadStudentLessons());
    }
  }, [user, loading, router, dispatch]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/login');
      toast.success('Successfully logged out!');
    } catch {
      toast.error('Failed to log out. Please try again.');
    }
  };

  if (loading || !user || lessonsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  const lessons = studentLessons.map(lesson => ({
    ...lesson,
    progress: lesson.progress || 0,
    status: lesson.status || 'available',
  }));

  const todaysGoals = [
    { task: 'Complete current lesson', completed: false, points: 50 },
    { task: 'Review 15 vocabulary words', completed: true, points: 30 },
    { task: 'Practice pronunciation', completed: false, points: 20 },
  ];

  const weeklyStats = [
    { label: 'Lessons Completed', value: 2, icon: CheckCircle, color: 'roman-green' },
    { label: 'Words Learned', value: 89, icon: BookOpen, color: 'roman-red' },
    { label: 'Study Time', value: '4.2h', icon: Clock, color: 'roman-gold' },
    { label: 'Current Streak', value: '7 days', icon: TrendingUp, color: 'roman-terracotta' },
  ];

  const statusConfig: Record<
    LessonStatus,
    { card: string; icon: string; button: string; text: string; showIcon: JSX.Element | null }
  > = {
    completed: {
      card: 'border-roman-green bg-roman-green/5',
      icon: 'bg-roman-green text-white',
      button: 'bg-roman-green hover:bg-roman-green/90',
      text: 'Review',
      showIcon: <CheckCircle className="h-6 w-6" />,
    },
    current: {
      card: 'border-roman-red bg-roman-red/5',
      icon: 'bg-roman-red text-white',
      button: 'bg-roman-red hover:bg-roman-red/90',
      text: 'Continue',
      showIcon: null,
    },
    upcoming: {
      card: 'border-roman-gold bg-roman-gold/5',
      icon: 'bg-roman-gold text-white',
      button: 'bg-roman-gold hover:bg-roman-gold/90',
      text: 'Start',
      showIcon: null,
    },
    available: {
      card: 'border-roman-stone bg-roman-stone/5',
      icon: 'bg-roman-stone text-white',
      button: 'bg-roman-stone hover:bg-roman-stone/90',
      text: 'Start',
      showIcon: null,
    },
    'in-progress': {
      card: 'border-roman-terracotta bg-roman-terracotta/5',
      icon: 'bg-roman-terracotta text-white',
      button: 'bg-roman-terracotta hover:bg-roman-terracotta/90',
      text: 'Continue',
      showIcon: null,
    },
    locked: {
      card: 'border-gray-300 bg-gray-100',
      icon: 'bg-gray-300 text-gray-500',
      button: 'bg-gray-400 cursor-not-allowed',
      text: 'Locked',
      showIcon: null,
    },
  };

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
            <span className="text-xl">L</span>
          </div>
          <div>
            <h1 className="text-2xl font-serif tracking-wide">Latin Learning</h1>
            <p className="text-sm text-roman-stone">Welcome back, {user.displayName || user.email?.split('@')[0]}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            className="text-roman-stone hover:text-foreground/80 px-4 py-2 rounded-md text-sm font-medium flex items-center"
            onClick={() => router.push('/profile')}>
            <User className="h-5 w-5 mr-2" />
            Profile
          </Button>
          <Button onClick={handleSignOut}>Sign Out</Button>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="max-w-[1800px] mx-auto">
          <section className="mb-12">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-4xl font-serif text-gray-900 mb-2">Your Learning Path</h2>
                <p className="text-lg text-roman-stone">Continue your journey through Latin mastery</p>
              </div>
              {lessons.length > 0 && (
                <div className="text-right">
                  <div className="text-2xl font-serif text-roman-red">
                    {Math.round((lessons.filter(l => l.status === 'completed').length / lessons.length) * 100)}%
                    Complete
                  </div>
                  <div className="text-sm text-roman-stone">
                    {lessons.filter(l => l.status === 'completed').length} of {lessons.length} lessons finished
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {lessons.length === 0 ? (
                <RomanCard className="col-span-full">
                  <RomanCardContent className="p-12 text-center">
                    <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-2xl font-serif text-gray-700 mb-2">No Lessons Available</h3>
                    <p className="text-gray-500">
                      Check back soon! Your instructors are preparing amazing Latin lessons for you.
                    </p>
                  </RomanCardContent>
                </RomanCard>
              ) : (
                lessons.map((lesson, index) => (
                  <RomanCard
                    key={index}
                    className={`transition-all duration-200 hover:shadow-xl cursor-pointer hover:-translate-y-1 ${statusConfig[lesson.status]?.card || 'border-gray-300'}`}>
                    <RomanCardContent className="p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center ${statusConfig[lesson.status]?.icon || 'bg-gray-300 text-gray-500'}`}>
                          {statusConfig[lesson.status]?.showIcon || <BookOpen className="h-5 w-5" />}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-serif mb-2">{lesson.title}</h3>
                          <p className="text-sm text-roman-stone mb-3">{lesson.description}</p>

                          <div className="flex items-center gap-4 text-xs text-roman-stone mb-3">
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              {lesson.introduction?.length || 0} intro pages
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              {lesson.exercises?.length || 0} exercises
                            </span>
                          </div>

                          {lesson.progress > 0 && (
                            <div className="mb-4">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium">Progress</span>
                                <span className="text-xs font-semibold">{lesson.progress}%</span>
                              </div>
                              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    lesson.status === 'completed' ? 'bg-roman-green' : 'bg-roman-red'
                                  }`}
                                  style={{ width: `${lesson.progress}%` }}></div>
                              </div>
                            </div>
                          )}

                          <Button
                            className={`w-full ${statusConfig[lesson.status]?.button || 'bg-gray-400'}`}
                            onClick={() => router.push(`/lesson/${lesson.id}`)}>
                            <Play className="h-4 w-4 mr-2" />
                            {statusConfig[lesson.status]?.text || 'Start'}
                          </Button>
                        </div>
                      </div>
                    </RomanCardContent>
                  </RomanCard>
                ))
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <RomanCard>
              <RomanCardHeader>
                <h3 className="text-2xl font-serif flex items-center gap-3">
                  <Target className="h-6 w-6 text-roman-red" />
                  Today&apos;s Goals
                </h3>
                <p className="text-roman-stone mt-1">Complete your daily learning objectives</p>
              </RomanCardHeader>
              <RomanCardContent className="space-y-4">
                {todaysGoals.map((goal, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-roman-parchment/50 transition-colors">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        goal.completed ? 'bg-roman-green text-white' : 'border-2 border-gray-300'
                      }`}>
                      {goal.completed && <CheckCircle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <p className={`${goal.completed ? 'line-through text-gray-500' : ''}`}>{goal.task}</p>
                    </div>
                    <span className="text-sm font-medium text-roman-red">+{goal.points}pts</span>
                  </div>
                ))}

                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Daily Progress</span>
                    <span className="text-lg font-bold text-roman-red">25/90 pts</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-roman-red rounded-full" style={{ width: '28%' }}></div>
                  </div>
                </div>
              </RomanCardContent>
            </RomanCard>

            <RomanCard>
              <RomanCardHeader>
                <h3 className="text-2xl font-serif flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-roman-red" />
                  This Week&apos;s Progress
                </h3>
                <p className="text-roman-stone mt-1">Track your learning achievements</p>
              </RomanCardHeader>
              <RomanCardContent>
                <div className="grid grid-cols-2 gap-6">
                  {weeklyStats.map((stat, index) => (
                    <div key={index} className="text-center p-4 rounded-lg bg-roman-parchment/30">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 bg-${stat.color}/20`}>
                        <stat.icon className={`h-6 w-6 text-${stat.color}`} />
                      </div>
                      <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
                      <div className="text-sm text-roman-stone">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </RomanCardContent>
            </RomanCard>
          </div>
        </div>
      </main>
    </div>
  );
}
```

### 6.3 Update Admin Live Lessons Page

Update `src/app/admin/lessons/live/page.tsx`:

```typescript
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/src/store';
import { 
  loadLessons, 
  batchPublishLessons, 
  batchUnpublishLessons,
  selectLiveLessons,
  selectAvailableLessons 
} from '@/src/store/slices/lessonSlice';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { RomanCard, RomanCardContent, RomanCardHeader } from '@/src/components/ui/core/roman-card';
import { Badge } from '@/src/components/ui/badge';
import { Checkbox } from '@/src/components/ui/checkbox';
import { ArrowLeft, Globe, Search, Filter, BookOpen, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Lesson } from '@/src/types/lesson';

export default function LiveLessonsPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { loading } = useSelector((state: RootState) => state.lesson);
  const liveLessons = useSelector((state: RootState) => selectLiveLessons(state));
  const availableLessons = useSelector((state: RootState) => selectAvailableLessons(state));

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'draft'>('all');
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [isPublishing, setIsPublishing] = useState(false);
  const [originalLiveIds, setOriginalLiveIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    dispatch(loadLessons());
  }, [dispatch, user, router]);

  useEffect(() => {
    const liveIds = new Set(liveLessons.map(l => l.id));
    setOriginalLiveIds(liveIds);
    setSelectedLessons(liveIds);
  }, [liveLessons]);

  const getFilteredLessons = (): Array<(Lesson & { isLive: true }) | (Lesson & { isLive: false })> => {
    const lessons: Array<(Lesson & { isLive: true }) | (Lesson & { isLive: false })> = [];

    if (filterStatus === 'all' || filterStatus === 'live') {
      for (const lesson of liveLessons) {
        const matchesSearch =
          !searchQuery ||
          lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lesson.description?.toLowerCase().includes(searchQuery.toLowerCase());

        if (matchesSearch) {
          lessons.push({ ...lesson, isLive: true as const });
        }
      }
    }

    if (filterStatus === 'all' || filterStatus === 'draft') {
      for (const lesson of availableLessons) {
        const matchesSearch =
          !searchQuery ||
          lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lesson.description?.toLowerCase().includes(searchQuery.toLowerCase());

        if (matchesSearch) {
          lessons.push({ ...lesson, isLive: false as const });
        }
      }
    }

    return lessons;
  };

  const handleSelectLesson = (lessonId: string) => {
    setSelectedLessons(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lessonId)) {
        newSet.delete(lessonId);
      } else {
        newSet.add(lessonId);
      }
      return newSet;
    });
  };

  const hasChanges = useMemo(() => {
    if (originalLiveIds.size !== selectedLessons.size) return true;

    for (const id of Array.from(originalLiveIds)) {
      if (!selectedLessons.has(id)) return true;
    }
    for (const id of Array.from(selectedLessons)) {
      if (!originalLiveIds.has(id)) return true;
    }

    return false;
  }, [originalLiveIds, selectedLessons]);

  const handleApplyChanges = async () => {
    const toPublish = Array.from(selectedLessons).filter(id => !originalLiveIds.has(id));
    const toUnpublish = Array.from(originalLiveIds).filter(id => !selectedLessons.has(id));

    setIsPublishing(true);

    try {
      if (toUnpublish.length > 0) {
        await dispatch(batchUnpublishLessons(toUnpublish)).unwrap();
      }

      if (toPublish.length > 0) {
        await dispatch(batchPublishLessons(toPublish)).unwrap();
      }

      toast.success('Changes applied successfully');
      dispatch(loadLessons());
    } catch (error) {
      toast.error('Failed to apply changes');
    }

    setIsPublishing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost">
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-roman-red" />
              <h1 className="text-xl font-serif tracking-wide">Manage Live Lessons</h1>
            </div>
          </div>

          {hasChanges && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-roman-stone">{selectedLessons.size} lessons selected</span>
              <Button
                onClick={handleApplyChanges}
                disabled={isPublishing}
                className="bg-roman-green hover:bg-roman-green/90">
                <CheckCircle className="h-4 w-4 mr-2" />
                Apply Changes
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <RomanCard>
            <RomanCardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{liveLessons.length + availableLessons.length}</div>
                  <div className="text-sm text-gray-600">Total Lessons</div>
                </div>
              </div>
            </RomanCardContent>
          </RomanCard>

          <RomanCard>
            <RomanCardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-roman-green/20 flex items-center justify-center">
                  <Globe className="h-5 w-5 text-roman-green" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{liveLessons.length}</div>
                  <div className="text-sm text-gray-600">Live Lessons</div>
                </div>
              </div>
            </RomanCardContent>
          </RomanCard>

          <RomanCard>
            <RomanCardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{availableLessons.length}</div>
                  <div className="text-sm text-gray-600">Draft Lessons</div>
                </div>
              </div>
            </RomanCardContent>
          </RomanCard>
        </div>

        <RomanCard className="mb-6">
          <RomanCardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search lessons by title or description..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-600" />
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('all')}>
                  All
                </Button>
                <Button
                  variant={filterStatus === 'live' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('live')}>
                  Live
                </Button>
                <Button
                  variant={filterStatus === 'draft' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('draft')}>
                  Draft
                </Button>
              </div>
            </div>
          </RomanCardContent>
        </RomanCard>

        <RomanCard>
          <RomanCardHeader>
            <h2 className="text-lg font-serif">Lessons ({getFilteredLessons().length})</h2>
          </RomanCardHeader>
          <RomanCardContent className="p-0">
            <div className="divide-y divide-border">
              {getFilteredLessons().length === 0 ? (
                <div className="p-8 text-center text-gray-500">No lessons found matching your criteria</div>
              ) : (
                getFilteredLessons().map(lesson => {
                  return (
                    <div key={lesson.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={selectedLessons.has(lesson.id)}
                          onCheckedChange={() => handleSelectLesson(lesson.id)}
                          className="mt-1"
                        />

                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-serif text-lg">{lesson.title}</h3>
                                <Badge variant={lesson.isLive ? 'default' : 'secondary'}>
                                  {lesson.isLive ? 'Live' : 'Draft'}
                                </Badge>
                              </div>
                              {lesson.description && (
                                <p className="text-sm text-gray-600 mb-2">{lesson.description}</p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>{lesson.introduction?.length || 0} intro pages</span>
                                <span>{lesson.exercises?.length || 0} exercise pages</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" asChild>
                                <Link href={`/admin/lessons/edit/${lesson.id}`}>Edit</Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </RomanCardContent>
        </RomanCard>
      </main>
    </div>
  );
}
```

### 6.4 Update Individual Lesson Page

Update `src/app/lesson/[lessonId]/page.tsx`:

```typescript
'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '@/src/store';
import { loadLessonById } from '@/src/store/slices/lessonSlice';
import LessonPlayer from '@/src/components/ui/lesson/lesson-player';

export default function DynamicLessonPage() {
  const params = useParams();
  const lessonId = params.lessonId as string;
  const dispatch = useDispatch<AppDispatch>();

  const { currentLesson, loading, error } = useSelector((state: RootState) => state.lesson);

  useEffect(() => {
    if (lessonId) {
      dispatch(loadLessonById({ lessonId, isStudent: true }));
    }
  }, [lessonId, dispatch]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <span className="text-xl">L</span>
            </div>
            <h1 className="text-xl font-serif tracking-wide">Latin App</h1>
          </div>
        </header>
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <h2 className="text-2xl font-serif text-gray-800 mb-4">Lesson Not Found</h2>
              <p className="text-roman-stone">{error}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!currentLesson) {
    return (
      <div className="min-h-screen bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <span className="text-xl">L</span>
            </div>
            <h1 className="text-xl font-serif tracking-wide">Latin App</h1>
          </div>
        </header>
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <h2 className="text-2xl font-serif text-gray-800 mb-4">Lesson Not Available</h2>
              <p className="text-roman-stone">The requested lesson could not be found.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
            <span className="text-xl">L</span>
          </div>
          <h1 className="text-xl font-serif tracking-wide">Latin App</h1>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-serif text-gray-800 mb-6">{currentLesson.title}</h2>
          <LessonPlayer lesson={currentLesson} />
        </div>
      </main>
    </div>
  );
}
```

---

## Phase 7: Testing & Validation

### 7.1 Test Migration Script

```bash
# Run migration
curl -X POST http://localhost:3000/api/admin/migrate-lessons \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"action":"migrate"}'

# Validate migration  
curl -X POST http://localhost:3000/api/admin/migrate-lessons \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"action":"validate"}'

# Test new endpoints
curl http://localhost:3000/api/lessons
curl http://localhost:3000/api/admin/lessons
```

### 7.2 Manual Testing Checklist

- [ ] Admin can view all lessons with live/draft status
- [ ] Admin can publish/unpublish individual lessons
- [ ] Admin can batch publish/unpublish lessons  
- [ ] Admin can reorder live lessons
- [ ] Students see only published lessons in correct order
- [ ] Individual lesson pages work for students
- [ ] Dashboard shows correct lesson progress
- [ ] No console errors or type errors

### 7.3 Cleanup

After successful testing:

```bash
# Remove migration script and endpoint
rm src/scripts/migrate-live-lessons.ts
rm src/app/api/admin/migrate-lessons/route.ts

# Clean up old collection (DANGEROUS - backup first!)
curl -X POST http://localhost:3000/api/admin/migrate-lessons \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"action":"cleanup"}'
```

---

## Summary

This migration eliminates:

- **~700 lines of code** across 5 files
- **Separate `live_lessons` collection** and associated complexity
- **Dual state management** with synchronization issues
- **Redundant service methods** and API endpoints
- **Complex data fetching** patterns

While maintaining:

- **All existing functionality** with simplified architecture
- **Publishing workflow** with atomic operations
- **Lesson ordering** and progress tracking
- **Admin and student separation** of concerns

The result is a significantly cleaner, more maintainable codebase with the same user experience.