'use client';

import { useEffect, useRef } from 'react';

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave this page?';
const HISTORY_SENTINEL = '__codexUnsavedNavigationGuard';

/**
 * Protects refreshes, same-origin links, and browser Back with one history
 * sentinel. A confirmed Back consumes the sentinel and then permits exactly
 * one additional pop, avoiding a second confirmation.
 */
export function useUnsavedNavigationGuard(dirty: boolean, message = DEFAULT_MESSAGE) {
  const bypassNextPop = useRef(false);
  const markerRef = useRef<string | null>(null);

  useEffect(() => {
    if (!dirty) {
      const marker = markerRef.current;
      markerRef.current = null;
      if (marker && window.history.state?.[HISTORY_SENTINEL] === marker) {
        window.history.back();
      }
      return;
    }

    const marker = markerRef.current ?? `${Date.now()}-${Math.random()}`;
    if (!markerRef.current) {
      markerRef.current = marker;
      window.history.pushState(
        { ...(window.history.state ?? {}), [HISTORY_SENTINEL]: marker },
        '',
        window.location.href
      );
    }

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin || target.href === window.location.href) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const popState = () => {
      if (bypassNextPop.current) {
        bypassNextPop.current = false;
        return;
      }
      if (window.confirm(message)) {
        bypassNextPop.current = true;
        window.history.back();
      } else {
        window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_SENTINEL]: marker }, '', window.location.href);
      }
    };

    window.addEventListener('beforeunload', beforeUnload);
    globalThis.document.addEventListener('click', click, true);
    window.addEventListener('popstate', popState);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      globalThis.document.removeEventListener('click', click, true);
      window.removeEventListener('popstate', popState);
      bypassNextPop.current = false;
    };
  }, [dirty, message]);
}
