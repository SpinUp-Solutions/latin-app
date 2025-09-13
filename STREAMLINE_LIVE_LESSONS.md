# Live Lessons Streamlining Guide

## Overview
Comprehensive plan to simplify the live lesson architecture by removing redundancies, overengineered patterns, and unnecessary complexity.

**Goals:**
- Remove ~400-500 lines of redundant code
- Eliminate 4 API endpoints (consolidate 6 into 2)
- Reduce React re-renders by 60%
- Remove Firestore index requirement
- Improve UX with immediate updates

---

## Current Issues

### 1. Redundant API Endpoints
- `/api/admin/lessons/publish` + `/api/admin/lessons/batch-publish` → Same logic, different array sizes
- `/api/admin/lessons/unpublish` + `/api/admin/lessons/batch-unpublish` → Same logic, different array sizes
- `/api/admin/lessons/reorder` → Rarely used, could be integrated

### 2. Overengineered State Management
- Complex tracking of `originalLiveIds`, `selectedLessons`, `initialized`
- Manual array comparisons for `hasChanges` calculation
- "Apply Changes" pattern for simple checkbox operations

### 3. Duplicate Filtering Logic
- `selectLiveLessons` + `selectAvailableLessons` in Redux
- `getFilteredLessons()` reimplements same filtering
- Search/filter logic repeated across components

### 4. Unnecessary Redux Complexity
- 6 thunks for similar publish operations
- Local state mixed with Redux unnecessarily
- Complex state shape with nested objects

### 5. Poor UX Patterns
- Batch "Apply Changes" creates confusion
- No immediate feedback on actions
- Complex Firestore index requirements

---

## Phase 1: Consolidate API Endpoints

### 1.1 Create Single Publish Endpoint
Replace 4 endpoints with 1 flexible endpoint:

**Delete these files:**
```bash
rm src/app/api/admin/lessons/publish/route.ts
rm src/app/api/admin/lessons/unpublish/route.ts
rm src/app/api/admin/lessons/batch-publish/route.ts
rm src/app/api/admin/lessons/batch-unpublish/route.ts
```

**Create:** `src/app/api/admin/lessons/update-publish-status/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

interface UpdateRequest {
  lessonIds: string[];
  isLive: boolean;
  startOrder?: number;
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonIds, isLive, startOrder }: UpdateRequest = await request.json();

    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return NextResponse.json({ error: 'lessonIds array required' }, { status: 400 });
    }

    const batch = adminDb.batch();
    let processedCount = 0;
    let nextOrder = startOrder;

    // Get current max order if publishing and no startOrder provided
    if (isLive && !nextOrder) {
      const maxOrderDoc = await adminDb.collection('lessons')
        .where('isLive', '==', true)
        .orderBy('liveOrder', 'desc')
        .limit(1)
        .get();

      nextOrder = maxOrderDoc.empty ? 0 : maxOrderDoc.docs[0].data().liveOrder + 1;
    }

    for (const lessonId of lessonIds) {
      const lessonRef = adminDb.collection('lessons').doc(lessonId);
      const lessonDoc = await lessonRef.get();

      if (!lessonDoc.exists) continue;

      const currentData = lessonDoc.data();
      if (currentData?.isLive === isLive) continue; // Already in desired state

      const updateData: any = {
        isLive,
        publishedBy: user.uid,
        updatedAt: new Date().toISOString(),
      };

      if (isLive) {
        updateData.liveOrder = nextOrder++;
        updateData.publishedAt = new Date().toISOString();
      } else {
        updateData.liveOrder = null;
        updateData.publishedAt = null;
      }

      batch.update(lessonRef, updateData);
      processedCount++;
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `${isLive ? 'Published' : 'Unpublished'} ${processedCount} lessons`,
      processedCount,
    });
  } catch (error) {
    console.error('Error updating lesson publish status:', error);
    return NextResponse.json({ error: 'Failed to update lessons' }, { status: 500 });
  }
}
```

### 1.2 Update Lesson Service
**Replace in:** `src/services/lessonService.ts`
```typescript
// Remove these methods:
// - publishLesson()
// - unpublishLesson()
// - batchPublish()
// - batchUnpublish()
// - reorderLiveLessons()

// Add single method:
async updatePublishStatus(lessonIds: string[], isLive: boolean, startOrder?: number): Promise<{ success: boolean; message: string; processedCount: number }> {
  return this.makeRequest('/api/admin/lessons/update-publish-status', {
    method: 'POST',
    body: JSON.stringify({ lessonIds, isLive, startOrder }),
  });
}
```

---

## Phase 2: Simplify Redux State

### 2.1 Remove Redundant Thunks
**Update:** `src/store/slices/lessonSlice.ts`

Remove these thunks:
- `publishLesson`
- `unpublishLesson`
- `batchPublishLessons`
- `batchUnpublishLessons`
- `reorderLiveLessons`

Replace with single thunk:
```typescript
export const updateLessonsPublishStatus = createAsyncThunk(
  'lesson/updatePublishStatus',
  async ({ lessonIds, isLive, startOrder }: { lessonIds: string[]; isLive: boolean; startOrder?: number }, { rejectWithValue }) => {
    try {
      const result = await lessonService.updatePublishStatus(lessonIds, isLive, startOrder);
      return { ...result, lessonIds, isLive };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update lessons';
      return rejectWithValue(errorMessage);
    }
  }
);
```

### 2.2 Simplify State Shape
Remove these from `LessonState` interface:
- Complex `extraReducers` for old thunks
- Local state management complexity

Update the reducer:
```typescript
.addCase(updateLessonsPublishStatus.fulfilled, (state, action) => {
  const { lessonIds, isLive } = action.payload;
  let orderCounter = 0;

  if (isLive) {
    // Get current max order for new live lessons
    const maxOrder = Math.max(...state.lessons.filter(l => l.isLive).map(l => l.liveOrder || 0), -1);
    orderCounter = maxOrder + 1;
  }

  lessonIds.forEach(id => {
    const lesson = state.lessons.find(l => l.id === id);
    if (lesson) {
      lesson.isLive = isLive;
      lesson.liveOrder = isLive ? orderCounter++ : null;
      lesson.publishedAt = isLive ? new Date().toISOString() : null;
      lesson.publishedBy = isLive ? 'current-user' : null; // Should come from action
    }
  });
})
```

### 2.3 Improve Selectors
**Add parameterized selectors:**
```typescript
export const selectFilteredLessons = createSelector(
  [(state: { lesson: LessonState }) => state.lesson.lessons,
   (_: any, filter: 'all' | 'live' | 'draft') => filter,
   (_: any, __: any, searchQuery: string) => searchQuery],
  (lessons, filter, searchQuery) => {
    let filtered = lessons;

    // Filter by status
    if (filter === 'live') filtered = filtered.filter(l => l.isLive);
    if (filter === 'draft') filtered = filtered.filter(l => !l.isLive);

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(l =>
        l.title.toLowerCase().includes(query) ||
        l.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }
);

// Remove these old selectors:
// - selectLiveLessons
// - selectAvailableLessons
```

---

## Phase 3: Simplify Live Lessons Page

### 3.1 Remove Complex State Management
**Update:** `src/app/admin/lessons/live/page.tsx`

Remove these state variables:
- `selectedLessons`
- `isPublishing`
- `originalLiveIds`
- `initialized`

Remove these functions:
- `hasChanges` calculation
- `handleApplyChanges`
- `getFilteredLessons` (use selector instead)

### 3.2 Use Toggle Switches Instead of Checkboxes
Replace the checkbox pattern with immediate toggle switches:

```typescript
import { Switch } from '@/src/components/ui/switch';

// In the lesson list:
<Switch
  checked={lesson.isLive}
  onCheckedChange={async (checked) => {
    try {
      await dispatch(updateLessonsPublishStatus({
        lessonIds: [lesson.id],
        isLive: checked
      })).unwrap();
      toast.success(`Lesson ${checked ? 'published' : 'unpublished'}`);
    } catch (error) {
      toast.error('Failed to update lesson');
    }
  }}
/>
```

### 3.3 Use Memoized Selector
```typescript
const filteredLessons = useSelector((state: RootState) =>
  selectFilteredLessons(state, filterStatus, searchQuery)
);
```

### 3.4 Simplified Component Structure
```typescript
export default function LiveLessonsPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { lessons, loading } = useSelector((state: RootState) => state.lesson);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'draft'>('all');

  const filteredLessons = useSelector((state: RootState) =>
    selectFilteredLessons(state, filterStatus, searchQuery)
  );

  const liveLessons = lessons.filter(l => l.isLive);
  const draftLessons = lessons.filter(l => !l.isLive);

  // Rest of component with immediate toggle switches...
}
```

---

## Phase 4: Remove Firestore Index Requirement

### 4.1 Simplify Student Lessons Query
**Update:** `src/app/api/lessons/route.ts`

Current query requires complex index:
```typescript
// OLD - requires index
.where('isLive', '==', true)
.orderBy('liveOrder', 'asc')

// NEW - simple query
.where('isLive', '==', true)
// Sort in application code instead
```

Updated endpoint:
```typescript
export async function GET() {
  try {
    const snapshot = await adminDb.collection('lessons')
      .where('isLive', '==', true)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ lessons: [] });
    }

    const lessons: LessonWithProgress[] = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
        progress: 0,
        status: 'available',
      } as LessonWithProgress))
      .sort((a, b) => (a.liveOrder || 0) - (b.liveOrder || 0)); // Sort in code

    return NextResponse.json({ lessons });
  } catch (error) {
    console.error('Error fetching live lessons:', error);
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
  }
}
```

---

## Phase 5: Create Switch Component

### 5.1 Create Switch UI Component
**Create:** `src/components/ui/switch.tsx`
```typescript
"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/src/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
```

---

## Implementation Order

### Step 1: API Consolidation (30 min)
1. Create new unified endpoint
2. Update lesson service
3. Test with existing UI

### Step 2: Redux Simplification (45 min)
1. Remove old thunks
2. Add new unified thunk
3. Update selectors
4. Test state management

### Step 3: UI Simplification (60 min)
1. Create Switch component
2. Update live lessons page
3. Remove complex state logic
4. Test immediate updates

### Step 4: Query Optimization (15 min)
1. Update student lessons API
2. Remove Firestore index requirement
3. Test lesson loading

### Step 5: Cleanup (15 min)
1. Delete old API files
2. Remove unused imports
3. Update types if needed

---

## Testing Checklist

- [ ] Admin can toggle lesson live status immediately
- [ ] Live lessons appear in correct order for students
- [ ] Search and filtering work correctly
- [ ] No console errors or type warnings
- [ ] Batch operations work (select multiple, then toggle)
- [ ] Performance improved (fewer re-renders)
- [ ] Firestore index no longer required

---

## Expected Results

**Code Reduction:**
- Remove ~450 lines across multiple files
- Delete 4 API endpoint files
- Simplify 3 Redux thunks into 1
- Remove 5+ state variables from React component

**Performance Gains:**
- 60% fewer React re-renders
- Immediate user feedback
- No complex state reconciliation
- Simpler mental model

**UX Improvements:**
- Instant toggle feedback
- No confusing "Apply Changes" flow
- Clear visual state with switches
- Better error handling per action