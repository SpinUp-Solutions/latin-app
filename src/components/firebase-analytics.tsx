'use client';

import { useEffect } from 'react';
import { app } from '@/src/services/firebase';

const ANALYTICS_IDLE_TIMEOUT_MS = 2000;

export function FirebaseAnalytics() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') return;

    let cancelled = false;
    let idleId: number | undefined;
    let timerId: number | undefined;

    const initialize = async () => {
      try {
        const { getAnalytics, isSupported } = await import('firebase/analytics');
        if (cancelled) return;
        if (!(await isSupported()) || cancelled) return;

        // getAnalytics reuses the app's instance across remounts and Fast Refresh.
        getAnalytics(app);
      } catch (error) {
        if (!cancelled) console.warn('[Firebase] Analytics initialization failed', error);
      }
    };

    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => void initialize(), { timeout: ANALYTICS_IDLE_TIMEOUT_MS });
      } else {
        timerId = window.setTimeout(() => void initialize(), ANALYTICS_IDLE_TIMEOUT_MS);
      }
    };

    // Keep both the SDK chunk and Google's scripts off the initial page load.
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, []);

  return null;
}
