import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { Lesson } from '@/src/types/lesson';

interface LessonState {
  lessons: Lesson[];
  hasUnsavedChanges: boolean;
}

const initialState: LessonState = {
  lessons: [],
  hasUnsavedChanges: false,
};

const lessonSlice = createSlice({
  name: 'lesson',
  initialState,
  reducers: {
    syncLessonsFromRTQ: (state, action: PayloadAction<Lesson[]>) => {
      state.lessons = action.payload;
      state.hasUnsavedChanges = false;
    },

    setUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },

    localReorderLiveLessons: (
      state,
      action: PayloadAction<{
        fromIndex: number;
        toIndex: number;
        lessonType: 'normal' | 'vocab' | 'sentence-diagramming';
      }>
    ) => {
      const { fromIndex, toIndex, lessonType } = action.payload;
      const liveLessonsOfType = state.lessons
        .filter(l => l.isLive && l.type === lessonType)
        .sort((a, b) => (a.liveOrder || 0) - (b.liveOrder || 0));

      if (fromIndex < liveLessonsOfType.length && toIndex < liveLessonsOfType.length) {
        const [removed] = liveLessonsOfType.splice(fromIndex, 1);
        liveLessonsOfType.splice(toIndex, 0, removed);

        liveLessonsOfType.forEach((lesson, index) => {
          const lessonInState = state.lessons.find(l => l.id === lesson.id);
          if (lessonInState) {
            lessonInState.liveOrder = index;
          }
        });
      }

      state.hasUnsavedChanges = true;
    },
  },
});

export const { syncLessonsFromRTQ, setUnsavedChanges, localReorderLiveLessons } = lessonSlice.actions;

// Base selector for lessons
const selectLessons = (state: { lesson: LessonState }) => state.lesson.lessons;

// Parameterized selector for filtering lessons
export const selectFilteredLessons = createSelector(
  [
    selectLessons,
    (_: { lesson: LessonState }, filter: 'all' | 'live' | 'draft') => filter,
    (_: { lesson: LessonState }, __: 'all' | 'live' | 'draft', searchQuery: string = '') => searchQuery,
  ],
  (lessons, filter, searchQuery) => {
    let filtered = lessons;

    // Filter by status
    if (filter === 'live') {
      filtered = filtered.filter(l => l.isLive);
    } else if (filter === 'draft') {
      filtered = filtered.filter(l => !l.isLive);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        l => l.title.toLowerCase().includes(query) || l.description?.toLowerCase().includes(query) || false
      );
    }

    // Sort live lessons by order
    if (filter === 'live' || filter === 'all') {
      filtered = [...filtered].sort((a, b) => {
        if (a.isLive && b.isLive) {
          return (a.liveOrder || 0) - (b.liveOrder || 0);
        }
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        return 0;
      });
    }

    return filtered;
  }
);

// Convenience selectors using the parameterized selector
export const selectLiveLessons = (state: { lesson: LessonState }) => selectFilteredLessons(state, 'live', '');

export const selectAvailableLessons = (state: { lesson: LessonState }) => selectFilteredLessons(state, 'draft', '');

export const selectLessonById = (state: { lesson: LessonState }, lessonId: string) =>
  state.lesson.lessons.find(l => l.id === lessonId);

export const selectHasUnsavedChanges = (state: { lesson: LessonState }) => state.lesson.hasUnsavedChanges;

export default lessonSlice.reducer;
