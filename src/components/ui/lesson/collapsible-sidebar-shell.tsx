'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface CollapsibleSidebarShellProps {
  side: 'left' | 'right';
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
  closeLabel: string;
  expandLabel: string;
  collapseLabel: string;
  railIcon: ReactNode;
  railLabel: string;
  children: ReactNode;
}

export function CollapsibleSidebarShell({
  side,
  isCollapsed,
  onToggleCollapse,
  closeLabel,
  expandLabel,
  collapseLabel,
  railIcon,
  railLabel,
  children,
}: CollapsibleSidebarShellProps) {
  const isLeft = side === 'left';

  return (
    <>
      {!isCollapsed && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 min-[901px]:hidden"
          aria-label={closeLabel}
          onClick={onToggleCollapse}
        />
      )}
      <div
        className={cn(
          'relative h-full shrink-0 transition-[width] duration-300 ease-in-out',
          isCollapsed ? 'w-0 min-[901px]:w-12' : 'w-0 min-[901px]:w-80'
        )}>
        <div
          className={cn(
            'overflow-hidden bg-gradient-to-br from-roman-marble via-white to-roman-parchment',
            isLeft ? 'border-r border-roman-red/20' : 'border-l border-roman-red/20',
            isCollapsed
              ? 'hidden min-[901px]:absolute min-[901px]:inset-0 min-[901px]:block'
              : isLeft
                ? 'fixed inset-y-0 left-0 z-40 w-80 min-[901px]:absolute min-[901px]:inset-0 min-[901px]:w-auto'
                : 'fixed inset-y-0 right-0 z-40 w-80 min-[901px]:absolute min-[901px]:inset-0 min-[901px]:w-auto'
          )}>
          <div className="absolute inset-0 pointer-events-none">
            {isLeft ? (
              <>
                <div className="absolute top-0 left-0 w-48 h-48 bg-gradient-to-r from-roman-gold/20 to-amber-300/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
                <div className="absolute bottom-0 right-0 w-48 h-48 bg-gradient-to-l from-roman-red/15 to-roman-terracotta/10 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
              </>
            ) : (
              <>
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-l from-roman-gold/20 to-amber-300/15 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-r from-roman-red/15 to-roman-terracotta/10 rounded-full mix-blend-multiply filter blur-2xl opacity-60" />
              </>
            )}
          </div>

          <div
            hidden={isCollapsed}
            style={{ display: isCollapsed ? 'none' : undefined }}
            className={cn('absolute inset-0 flex flex-col', isCollapsed && 'pointer-events-none')}>
            {children}
          </div>

          <div
            hidden={!isCollapsed}
            style={{ display: isCollapsed ? undefined : 'none' }}
            className="absolute inset-0 hidden flex-col items-center pt-5 min-[901px]:flex">
            <div className="relative h-10 w-10 bg-gradient-to-br from-roman-red/20 to-roman-terracotta/10 rounded-xl flex items-center justify-center shadow-lg border border-roman-red/20">
              {railIcon}
            </div>
            <span
              className="mt-6 text-xs font-medium uppercase tracking-wide text-roman-stone"
              style={{ writingMode: 'vertical-rl' }}>
              {railLabel}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? expandLabel : collapseLabel}
          className={
            isLeft
              ? 'absolute left-full top-1/2 z-20 hidden h-10 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-roman-red/20 bg-white text-roman-red shadow-md transition-colors hover:bg-roman-red/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red min-[901px]:inline-flex'
              : 'absolute right-full top-1/2 z-20 hidden h-10 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-roman-red/20 bg-white text-roman-red shadow-md transition-colors hover:bg-roman-red/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-roman-red min-[901px]:inline-flex'
          }>
          {isLeft ? (
            <ChevronLeft
              className="h-4 w-4 transition-transform duration-300"
              style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none' }}
            />
          ) : (
            <ChevronRight
              className="h-4 w-4 transition-transform duration-300"
              style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none' }}
            />
          )}
        </button>
      </div>
    </>
  );
}
