import { useEffect, useEffectEvent } from 'react';

/**
 * Refetches a query when the tab becomes visible again, but only once its data
 * is older than `maxAgeMs`. Use it with `refetchOnFocus: false` for data that
 * is costly to rebuild and is otherwise kept current by mutation results.
 */
export function useRefreshStaleOnFocus(
  fulfilledTimeStamp: number | undefined,
  refetch: () => unknown,
  maxAgeMs: number
): void {
  const refreshIfStale = useEffectEvent(() => {
    // A query that has never completed is still loading or skipped; neither can be refetched.
    if (document.visibilityState !== 'visible' || fulfilledTimeStamp === undefined) return;
    if (Date.now() - fulfilledTimeStamp >= maxAgeMs) refetch();
  });

  useEffect(() => {
    const onVisible = () => refreshIfStale();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
}
