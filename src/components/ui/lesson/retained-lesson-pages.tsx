import React, { Activity, useState } from 'react';
import { RetainedPracticeSession } from '@/src/hooks/usePracticeGeneratedExerciseWords';
import type { Page } from '@/src/types/lesson';

interface Props {
  pages: Page[];
  currentPageIndex: number;
  children: (page: Page, index: number) => React.ReactNode;
}

/** Session-local practice state. Hidden pages retain state but suspend effects. */
export function RetainedLessonPages({ pages, currentPageIndex, children }: Props) {
  const currentId = pages[currentPageIndex].id;
  const [visited, setVisited] = useState(() => new Set([currentId]));
  if (!visited.has(currentId)) {
    setVisited(new Set([...visited, currentId]));
  }

  return (
    <RetainedPracticeSession.Provider value={true}>
      {pages.map((page, index) =>
        visited.has(page.id) ? (
          <Activity key={page.id} mode={index === currentPageIndex ? 'visible' : 'hidden'}>
            {children(page, index)}
          </Activity>
        ) : null
      )}
    </RetainedPracticeSession.Provider>
  );
}
