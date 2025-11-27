import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const useBeforeUnload = (hasDraft: boolean, onNavigateAway?: () => void) => {
  const router = useRouter();

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

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasDraft, onNavigateAway]);
};
