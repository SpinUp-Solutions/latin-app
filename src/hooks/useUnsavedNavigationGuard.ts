'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave this page?';
const HISTORY_SENTINEL = '__codexUnsavedNavigationGuard';

interface PendingNavigation {
  kind: 'link' | 'back' | 'action';
  proceed: () => void;
}

export interface UnsavedNavigationGuard {
  isOpen: boolean;
  message: string;
  stayOnPage: () => void;
  leavePage: () => void;
  requestNavigation: (navigate: () => void) => void;
}

/**
 * Protects refreshes, same-origin links, programmatic navigation, and browser
 * Back. In-app navigation is resolved through a React dialog; refresh and tab
 * close continue to use the browser's required beforeunload prompt.
 */
export function useUnsavedNavigationGuard(
  dirty: boolean,
  message = DEFAULT_MESSAGE
): UnsavedNavigationGuard {
  const bypassNextClick = useRef(false);
  const bypassNextBeforeUnload = useRef(false);
  const bypassNextPop = useRef(false);
  const markerRef = useRef<string | null>(null);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);

  const setPending = useCallback((pending: PendingNavigation | null) => {
    pendingNavigationRef.current = pending;
    setPendingNavigation(pending);
  }, []);

  const requestNavigation = useCallback(
    (navigate: () => void) => {
      if (!dirty) {
        navigate();
        return;
      }
      setPending({ kind: 'action', proceed: navigate });
    },
    [dirty, setPending]
  );

  const stayOnPage = useCallback(() => {
    const pending = pendingNavigationRef.current;
    if (pending?.kind === 'back') {
      const marker = markerRef.current;
      if (marker && window.history.state?.[HISTORY_SENTINEL] !== marker) {
        window.history.pushState(
          { ...(window.history.state ?? {}), [HISTORY_SENTINEL]: marker },
          '',
          window.location.href
        );
      }
    }
    setPending(null);
  }, [setPending]);

  const leavePage = useCallback(() => {
    const pending = pendingNavigationRef.current;
    setPending(null);
    pending?.proceed();
  }, [setPending]);

  useEffect(() => {
    if (!dirty) {
      setPending(null);
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
      if (bypassNextBeforeUnload.current) {
        bypassNextBeforeUnload.current = false;
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if (bypassNextClick.current) {
        bypassNextClick.current = false;
        return;
      }
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
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin || target.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({
        kind: 'link',
        proceed: () => {
          bypassNextClick.current = true;
          bypassNextBeforeUnload.current = true;
          anchor.click();
          window.setTimeout(() => {
            bypassNextBeforeUnload.current = false;
          }, 0);
        },
      });
    };
    const popState = () => {
      if (bypassNextPop.current) {
        bypassNextPop.current = false;
        return;
      }
      if (window.history.state?.[HISTORY_SENTINEL] !== marker) {
        window.history.pushState(
          { ...(window.history.state ?? {}), [HISTORY_SENTINEL]: marker },
          '',
          window.location.href
        );
      }
      if (pendingNavigationRef.current) return;
      setPending({
        kind: 'back',
        proceed: () => {
          bypassNextPop.current = true;
          window.history.go(-2);
        },
      });
    };

    window.addEventListener('beforeunload', beforeUnload);
    globalThis.document.addEventListener('click', click, true);
    window.addEventListener('popstate', popState);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      globalThis.document.removeEventListener('click', click, true);
      window.removeEventListener('popstate', popState);
      bypassNextClick.current = false;
      bypassNextBeforeUnload.current = false;
      bypassNextPop.current = false;
    };
  }, [dirty, message, setPending]);

  return {
    isOpen: pendingNavigation !== null,
    message,
    stayOnPage,
    leavePage,
    requestNavigation,
  };
}
