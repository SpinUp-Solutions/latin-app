import { useEffect, useEffectEvent } from 'react';
import { interceptableLink } from './useUnsavedNavigationGuard';

export const useBeforeUnload = (hasDraft: boolean, onNavigateAway?: (destination?: string) => void) => {
  // Callers pass a new callback on every render. An effect event always sees the latest one
  // without being an effect dependency, so the history guard below pushes one entry per dirty
  // period instead of one per render (each push re-renders the App Router page).
  const navigateAway = useEffectEvent((destination?: string) => onNavigateAway?.(destination));

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDraft) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasDraft]);

  useEffect(() => {
    if (!hasDraft) return;

    const handlePopState = (e: PopStateEvent) => {
      if (hasDraft) {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
        navigateAway();
      }
    };

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    const handleDocumentNavigation = (event: MouseEvent) => {
      const anchor = interceptableLink(event);
      if (!anchor) return;
      const destination = new URL(anchor.href, window.location.href);
      event.preventDefault();
      event.stopPropagation();
      navigateAway(`${destination.pathname}${destination.search}${destination.hash}`);
    };

    document.addEventListener('click', handleDocumentNavigation, true);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('click', handleDocumentNavigation, true);
    };
  }, [hasDraft]);
};
