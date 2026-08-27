'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function OffscreenSlide({ isVisible, children }: { isVisible: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [intersecting, setIntersecting] = useState<boolean | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const root = el.closest('.swiper');
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.rootBounds || entry.rootBounds.width <= 0) return;
        setIntersecting(entry.intersectionRatio >= 0.2);
      },
      { root, threshold: [0, 0.2, 0.5, 1] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shown = intersecting ?? isVisible;

  return (
    <div ref={ref} className="h-full min-w-0 overflow-hidden" inert={!shown || undefined} aria-hidden={!shown}>
      {children}
    </div>
  );
}
