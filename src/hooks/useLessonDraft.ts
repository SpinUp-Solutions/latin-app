import { useEffect, useCallback, useState } from 'react';
import { Lesson } from '@/src/types/lesson';

const DRAFT_KEY = 'lesson_draft';
const DRAFT_TIMESTAMP_KEY = 'lesson_draft_timestamp';

export const useLessonDraft = (isCreating: boolean) => {
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  const saveDraftToStorage = useCallback(
    (lesson: Lesson | null) => {
      if (!isCreating || !lesson) return;
      try {
        const timestamp = new Date().toISOString();
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(lesson));
        sessionStorage.setItem(DRAFT_TIMESTAMP_KEY, timestamp);
        setLastSavedTime(new Date());
      } catch (error) {
        console.error('Error saving draft to storage:', error);
      }
    },
    [isCreating]
  );

  // Warn user before leaving if there's a draft
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check for draft existence directly from storage
      if (sessionStorage.getItem(DRAFT_KEY)) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isCreating]);

  return {
    saveDraftToStorage,
    lastSavedTime,
  };
};
