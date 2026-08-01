import { useEffect } from 'react';

export const useBeforeUnload = (hasDraft: boolean, onNavigateAway?: (destination?: string) => void) => {
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
        if (onNavigateAway) {
          onNavigateAway();
        }
      }
    };

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    const handleDocumentNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      onNavigateAway?.(`${destination.pathname}${destination.search}${destination.hash}`);
    };

    document.addEventListener('click', handleDocumentNavigation, true);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('click', handleDocumentNavigation, true);
    };
  }, [hasDraft, onNavigateAway]);
};
